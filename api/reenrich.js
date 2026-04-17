const {
  authenticateRequest, jsonResponse, handleCors,
  fetchOGMetadata, downloadImage, extractDomain,
  generateTagsFromMetadata,
} = require('./_lib/supabase');
// Puppeteer + @sparticuz/chromium is heavy; lazy-require only when we
// actually need to capture screenshots so the require tree stays lean
// (and other handlers that import this file via tests don't pull it in).

/**
 * Re-run the full enrichment flow for an existing item:
 *   1. Re-fetch OG metadata from source_url.
 *   2. Backfill any missing title / summary / og_image_path.
 *   3. Flip enrichment_status back to 'text_done' and delegate to
 *      /api/enrich so vision + candidate extraction rerun.
 *
 * Body: { slug }
 *
 * Items without a source_url (text notes, image-only captures) skip
 * phase 1 and only re-run phase 2.
 */
module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (req.method !== 'POST') return jsonResponse(res, 405, { error: 'Method not allowed' });

  const { user, error, status, client } = await authenticateRequest(req);
  if (error) return jsonResponse(res, status, { error });

  const slug = (req.body && req.body.slug);
  if (!slug) return jsonResponse(res, 400, { error: 'Missing slug' });

  const { data: item, error: fetchErr } = await client
    .from('items')
    .select('*')
    .eq('slug', slug)
    .eq('user_id', user.id)
    .single();
  if (fetchErr || !item) return jsonResponse(res, 404, { error: 'Item not found' });

  const updates = {};

  // --- Phase 1: OG refetch (only if we have a source_url) ---
  if (item.source_url) {
    try {
      const meta = await fetchOGMetadata(item.source_url);
      const title = meta['og:title'] || meta.title || item.title;
      const summary = meta['og:description'] || meta.description || item.summary;
      const ogImageUrl = meta['og:image'] || null;
      const domain = extractDomain(item.source_url);

      if (title && title !== item.title) updates.title = title.replace(/"/g, "'");
      if (summary && summary !== item.summary) updates.summary = (summary || '').slice(0, 200);
      if (domain && domain !== item.domain) updates.domain = domain;

      // Re-tag from updated metadata so new subject / rule tags appear.
      // Intent tags (category:'intent') survive because we only rewrite
      // the non-vision-non-intent categories.
      const existingTags = typeof item.tags === 'string' ? JSON.parse(item.tags) : (item.tags || []);
      const visionAndIntent = existingTags.filter(t =>
        ['color', 'style', 'mood', 'intent'].includes(t.category)
      );
      const freshTags = generateTagsFromMetadata({
        title: updates.title || item.title,
        domain: updates.domain || item.domain,
        description: updates.summary || item.summary,
        sourceUrl: item.source_url,
      });
      // Merge: fresh base tags + preserved vision/intent tags (dedupe by tag name)
      const haveNames = new Set(freshTags.map(t => t.tag));
      const merged = [...freshTags];
      for (const t of visionAndIntent) {
        if (!haveNames.has(t.tag)) { merged.push(t); haveNames.add(t.tag); }
      }
      updates.tags = JSON.stringify(merged);

      // Backfill og_image_path if missing.
      if (!item.og_image_path && ogImageUrl) {
        let fullImageUrl = ogImageUrl;
        if (ogImageUrl.startsWith('//')) fullImageUrl = 'https:' + ogImageUrl;
        else if (ogImageUrl.startsWith('/')) {
          try { fullImageUrl = new URL(item.source_url).origin + ogImageUrl; } catch {}
        }
        const img = await downloadImage(fullImageUrl);
        if (img) {
          const storagePath = `${user.id}/${slug}/og-image${img.ext}`;
          const { error: upErr } = await client.storage
            .from('item-images')
            .upload(storagePath, img.buffer, {
              contentType: img.ext === '.png' ? 'image/png'
                : img.ext === '.webp' ? 'image/webp' : 'image/jpeg',
              upsert: true,
            });
          if (!upErr) {
            const { data: urlData } = client.storage.from('item-images').getPublicUrl(storagePath);
            if (urlData?.publicUrl) updates.og_image_path = urlData.publicUrl;
          }
        }
      }
    } catch (err) {
      console.warn('reenrich: OG refetch failed', slug, err.message);
    }
  }

  // --- Full-page screenshots at 1440/640/360 widths.
  // Done synchronously so they land in images[] before this endpoint
  // returns; the poller can then pick them up in its next tick.
  if (item.source_url) {
    try {
      const { captureScreenshots } = require('./_lib/screenshots');
      const shots = await captureScreenshots(item.source_url);
      if (shots.length) {
        // Load current images[] (may have been updated by OG backfill above
        // if we set updates.og_image_path, but that's not in images[] yet
        // until item-update touches it — keep it simple and read from DB).
        const existingImages = typeof item.images === 'string'
          ? JSON.parse(item.images)
          : (item.images || []);
        const have = new Set(existingImages.map(i => i.path));
        const newImages = existingImages.slice();

        for (const shot of shots) {
          const storagePath = `${user.id}/${item.slug}/screenshot-${shot.width}w.webp`;
          const { error: upErr } = await client.storage
            .from('item-images')
            .upload(storagePath, shot.buffer, {
              contentType: 'image/webp',
              upsert: true,
            });
          if (upErr) {
            console.warn('reenrich: screenshot upload failed', item.slug, shot.width, upErr.message);
            continue;
          }
          const { data: urlData } = client.storage
            .from('item-images')
            .getPublicUrl(storagePath);
          if (!urlData?.publicUrl) continue;
          if (have.has(urlData.publicUrl)) continue;
          have.add(urlData.publicUrl);
          // Replace any prior screenshot entry for the same width so
          // re-enriching doesn't accumulate duplicates.
          const idx = newImages.findIndex(i =>
            i.source === 'screenshot' && i.label === `Screenshot — ${shot.width}w`
          );
          const entry = {
            path: urlData.publicUrl,
            label: `Screenshot — ${shot.width}w`,
            source: 'screenshot',
            is_primary: false,
          };
          if (idx >= 0) {
            // Preserve is_primary if the user had set an old screenshot
            // of this width as cover.
            entry.is_primary = newImages[idx].is_primary === true;
            newImages[idx] = entry;
          } else {
            newImages.push(entry);
          }
        }
        updates.images = JSON.stringify(newImages);
      }
    } catch (err) {
      console.warn('reenrich: screenshot pipeline failed', item.slug, err.message);
    }
  }

  // Reset enrichment so the downstream /api/enrich re-runs vision + candidates.
  updates.enrichment_status = 'text_done';
  updates.enrichment_candidates = JSON.stringify({});

  const { error: updateErr } = await client
    .from('items')
    .update(updates)
    .eq('id', item.id);
  if (updateErr) return jsonResponse(res, 500, { error: 'Update failed', detail: updateErr.message });

  // --- Phase 2: fire-and-forget vision + candidates ---
  try {
    const enrichUrl = `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers.host}/api/enrich`;
    fetch(enrichUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': req.headers.authorization,
      },
      body: JSON.stringify({ slug, itemId: item.id }),
    }).catch(() => {});
  } catch { /* ignore */ }

  return jsonResponse(res, 200, { slug, status: 'reenriching' });
};
