const {
  authenticateRequest, jsonResponse, handleCors,
  fetchOGMetadata, downloadImage, extractDomain,
  generateTagsFromMetadata,
} = require('./_lib/supabase');

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
