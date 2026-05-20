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
            if (urlData?.publicUrl) {
              updates.og_image_path = urlData.publicUrl;
              // Seed images[] with the OG entry when the row has no curated
              // images yet — see api/capture.js. Width/height come from
              // sharp so the frontend can reserve the exact aspect-ratio
              // slot at render time.
              const existingImages = (() => {
                try { return typeof item.images === 'string' ? JSON.parse(item.images) : (item.images || []); }
                catch { return []; }
              })();
              if (existingImages.length === 0) {
                updates.images = JSON.stringify([{
                  path: urlData.publicUrl, source: 'og', is_primary: true,
                  width: img.width || null, height: img.height || null,
                }]);
              }
            }
          }
        }
      }
    } catch (err) {
      console.warn('reenrich: OG refetch failed', slug, err.message);
    }
  }

  // --- Single 1440×900 viewport screenshot.
  // Done synchronously so it lands in images[] before this endpoint
  // returns; the poller can then pick it up in its next tick.
  //
  // Consolidates legacy items that have up to three `source: 'screenshot'`
  // entries (Screenshot — 1440w/640w/360w from the previous full-page
  // pipeline) down to a single entry. The old multi-width files in
  // storage are deleted in-band so the bucket doesn't accumulate orphans.
  if (item.source_url) {
    try {
      const { captureScreenshot } = require('./_lib/screenshots');
      const shot = await captureScreenshot(item.source_url);
      if (shot) {
        const storagePath = `${user.id}/${item.slug}/screenshot.webp`;
        const { error: upErr } = await client.storage
          .from('item-images')
          .upload(storagePath, shot.buffer, {
            contentType: 'image/webp',
            upsert: true,
          });
        if (upErr) {
          console.warn('reenrich: screenshot upload failed', item.slug, upErr.message);
        } else {
          const { data: urlData } = client.storage
            .from('item-images')
            .getPublicUrl(storagePath);
          const publicUrl = urlData?.publicUrl;
          if (publicUrl) {
            const existingImages = typeof item.images === 'string'
              ? JSON.parse(item.images)
              : (item.images || []);
            // Preserve is_primary across the consolidation: if any prior
            // screenshot entry was the cover, the new entry inherits it.
            const wasPrimary = existingImages.some(
              i => i.source === 'screenshot' && i.is_primary === true
            );
            // Drop all prior screenshot entries, then append the new one.
            const newImages = existingImages
              .filter(i => i.source !== 'screenshot')
              .concat([{
                path: publicUrl,
                label: 'Screenshot',
                source: 'screenshot',
                is_primary: wasPrimary,
                width: shot.width,
                height: shot.height,
              }]);
            updates.images = JSON.stringify(newImages);

            // Delete orphan files from the previous multi-width pipeline.
            // Safe to call unconditionally — storage.remove is a no-op for
            // paths that don't exist.
            const orphanPaths = [
              `${user.id}/${item.slug}/screenshot-1440w.webp`,
              `${user.id}/${item.slug}/screenshot-640w.webp`,
              `${user.id}/${item.slug}/screenshot-360w.webp`,
            ];
            try {
              await client.storage.from('item-images').remove(orphanPaths);
            } catch (cleanupErr) {
              console.warn('reenrich: orphan screenshot cleanup failed', item.slug, cleanupErr.message);
            }
          }
        }
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
