const {
  authenticateRequest, jsonResponse, handleCors,
  fetchOGMetadata, downloadImage, generateTagsFromMetadata,
  extractDomain, decodeHtmlEntities,
} = require('./_lib/supabase');

/**
 * Re-run capture-time processing for an existing item.
 *
 * Purpose: backfill items that were captured before the entity-decode +
 * rule-enrichment fixes landed. The client drip-feeds calls to this
 * endpoint on login for every item not already in vision_done state.
 *
 * What it does:
 *   1. Refetches OG metadata from source_url (entity-decoded now)
 *   2. Regenerates the tag set with the new rule tables
 *   3. Downloads+uploads the OG image if the item currently has none
 *   4. Preserves intent + vision tags from the previous pass
 *   5. Sets enrichment_status so the client knows what to do next
 *
 * Client flow after this returns:
 *   status='text_done' + og_image_path     → call /api/enrich (vision)
 *   status='vision_done'                    → no further work
 *   status='error'                          → give up
 */
module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (req.method !== 'POST') return jsonResponse(res, 405, { error: 'Method not allowed' });

  const { user, error, status, client } = await authenticateRequest(req);
  if (error) return jsonResponse(res, status, { error });

  const { slug, itemId } = req.body || {};
  if (!slug && !itemId) return jsonResponse(res, 400, { error: 'Missing slug or itemId' });

  const baseQuery = client.from('items').select('*').eq('user_id', user.id);
  const { data: item, error: fetchErr } = await (
    itemId ? baseQuery.eq('id', itemId) : baseQuery.eq('slug', slug)
  ).single();
  if (fetchErr || !item) return jsonResponse(res, 404, { error: 'Item not found' });

  const existingTags = typeof item.tags === 'string'
    ? JSON.parse(item.tags) : (item.tags || []);

  // Tags we want to preserve across reprocessing — user-assigned (intent)
  // and anything derived from the image (color/style/mood from vision).
  const PRESERVED_CATS = new Set(['intent', 'color', 'style', 'mood']);
  const preserved = existingTags.filter(t => PRESERVED_CATS.has(t.category));

  // Start by decoding anything that's already in the DB — this alone
  // cleans up the "Today&#x27;s" / "Panter&amp;Tourron" style artifacts
  // even if the source site later goes dark.
  const cleanedTitle = decodeHtmlEntities(item.title || '');
  const cleanedSummary = decodeHtmlEntities(item.summary || '');

  // Text-only items: nothing to refetch, just normalize and return.
  if (!item.source_url) {
    const updates = {};
    if (cleanedTitle !== item.title) updates.title = cleanedTitle.replace(/"/g, "'");
    if (cleanedSummary !== item.summary) updates.summary = cleanedSummary;
    if (item.enrichment_status !== 'vision_done') {
      updates.enrichment_status = 'vision_done'; // text notes never get vision
    }
    if (Object.keys(updates).length > 0) {
      await client.from('items').update(updates).eq('id', item.id);
    }
    return jsonResponse(res, 200, {
      status: 'text_only_cleaned',
      enrichment_status: updates.enrichment_status || item.enrichment_status,
    });
  }

  // URL-backed item: refetch the live OG, regenerate tags, maybe download image.
  const meta = await fetchOGMetadata(item.source_url);
  const ogFailed = meta._status === 'error';

  const title = ogFailed
    ? cleanedTitle || extractDomain(item.source_url) || 'Untitled'
    : (meta['og:title'] || meta.title || cleanedTitle || extractDomain(item.source_url) || 'Untitled');

  const summary = ogFailed
    ? cleanedSummary
    : (meta['og:description'] || meta.description || cleanedSummary || '');

  const ogImageUrl = ogFailed ? null : (meta['og:image'] || null);
  const domain = extractDomain(item.source_url);

  const updates = {
    title: title.replace(/"/g, "'"),
    summary: (summary || '').slice(0, 200),
    body_markdown: `## Summary\n${summary || ''}`,
    domain,
  };

  // Image download: only if we don't have one and OG advertises one.
  // Track the *reason* we ended up without an image so we can choose the
  // right enrichment_status below — a retryable failure (upload denied,
  // transient network error) stays at text_done so the next backfill can
  // pick it up again after the operator fixes the upstream issue.
  let ogImagePath = item.og_image_path;
  let imageUploadRetryable = false;
  if (!ogImagePath && ogImageUrl) {
    let fullImageUrl = ogImageUrl;
    if (ogImageUrl.startsWith('//')) fullImageUrl = 'https:' + ogImageUrl;
    else if (ogImageUrl.startsWith('/')) {
      try { fullImageUrl = new URL(item.source_url).origin + ogImageUrl; } catch { /* keep */ }
    }

    const img = await downloadImage(fullImageUrl);
    if (img) {
      const storagePath = `${user.id}/${item.slug}/og-image${img.ext}`;
      const { error: uploadErr } = await client.storage
        .from('item-images')
        .upload(storagePath, img.buffer, {
          contentType: img.ext === '.png' ? 'image/png'
            : img.ext === '.webp' ? 'image/webp' : 'image/jpeg',
          upsert: true,
        });
      if (uploadErr) {
        console.warn('reprocess: image upload failed', item.source_url, uploadErr.message);
        // Storage policy / quota / transient issue — worth another shot
        // next time the user reloads after fixing their bucket config.
        imageUploadRetryable = true;
      } else {
        const { data: urlData } = client.storage
          .from('item-images')
          .getPublicUrl(storagePath);
        ogImagePath = urlData.publicUrl;
        updates.og_image_path = ogImagePath;
      }
    } else {
      console.warn('reprocess: image download returned null', item.source_url, fullImageUrl);
    }
  }

  // Regenerate metadata-derived tags, then fold in the preserved ones.
  const freshTags = generateTagsFromMetadata({
    title, domain, description: summary, sourceUrl: item.source_url,
  });

  const seen = new Set();
  const merged = [];
  for (const t of [...freshTags, ...preserved]) {
    if (seen.has(t.tag)) continue;
    seen.add(t.tag);
    merged.push(t);
  }
  merged.sort((a, b) => (b.weight || 0) - (a.weight || 0));
  updates.tags = JSON.stringify(merged.slice(0, 16));

  // Decide where this item now lives in the enrichment pipeline.
  //   text_done   — either we have an image + no vision yet (ready for
  //                 /api/enrich), or the upload failed retryably so the
  //                 next backfill pass should try again.
  //   vision_done — terminal: vision already ran, OR there's genuinely
  //                 no image to analyze (OG has none, site has none).
  const hasVisionTags = preserved.some(t => t.category === 'color'
    || t.category === 'style' || t.category === 'mood');
  if (ogImagePath && !hasVisionTags) {
    updates.enrichment_status = 'text_done';
  } else if (imageUploadRetryable) {
    updates.enrichment_status = 'text_done';
  } else {
    updates.enrichment_status = 'vision_done';
  }

  await client.from('items').update(updates).eq('id', item.id);

  return jsonResponse(res, 200, {
    status: 'reprocessed',
    has_image: !!ogImagePath,
    tags_count: merged.length,
    enrichment_status: updates.enrichment_status,
    og_failed: ogFailed,
  });
};
