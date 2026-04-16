const { getAdminClient, normalizeUrl, fetchOGMetadata, downloadImage, generateSlug, generateTagsFromMetadata, extractDomain } = require('../_lib/supabase');

/**
 * Cron job: pick up incomplete batch jobs and process pending URLs.
 * Runs every minute via vercel.json cron config.
 */
module.exports = async function handler(req, res) {
  // Verify cron secret (Vercel sets this header for cron invocations)
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const admin = getAdminClient();

  // Find processing batches
  const { data: batches } = await admin
    .from('batch_jobs')
    .select('*')
    .eq('status', 'processing')
    .order('created_at', { ascending: true })
    .limit(3);

  if (!batches || batches.length === 0) {
    return res.status(200).json({ status: 'no pending batches' });
  }

  let totalProcessed = 0;

  for (const batch of batches) {
    const urls = typeof batch.urls === 'string' ? JSON.parse(batch.urls) : (batch.urls || []);
    const results = typeof batch.results === 'string' ? JSON.parse(batch.results) : (batch.results || []);
    const processedIndices = new Set(results.map(r => r.index));

    // Find URLs not yet processed
    const pending = [];
    for (let i = 0; i < urls.length; i++) {
      if (!processedIndices.has(i)) {
        pending.push({ index: i, url: urls[i] });
      }
    }

    if (pending.length === 0) {
      // All done
      await admin
        .from('batch_jobs')
        .update({ status: 'completed' })
        .eq('id', batch.id);
      continue;
    }

    // Process up to 5 pending URLs in this invocation
    const toProcess = pending.slice(0, 5);
    for (const { index, url } of toProcess) {
      try {
        const item = await captureUrlAdmin(admin, batch.user_id, url);
        results.push({ index, url, item, error: null });
      } catch (err) {
        results.push({ index, url, item: null, error: err.message });
      }
      totalProcessed++;
    }

    const completed = results.filter(r => r.item).length;
    const failed = results.filter(r => r.error).length;
    const allDone = results.length >= urls.length;

    await admin
      .from('batch_jobs')
      .update({
        status: allDone ? 'completed' : 'processing',
        completed_items: completed,
        failed_items: failed,
        results: JSON.stringify(results),
      })
      .eq('id', batch.id);
  }

  return res.status(200).json({ status: 'processed', count: totalProcessed });
};

async function captureUrlAdmin(admin, userId, url) {
  // Duplicate check
  const normalizedUrl = normalizeUrl(url);
  const { data: existing } = await admin
    .from('items')
    .select('slug, source_url')
    .eq('user_id', userId)
    .not('source_url', 'is', null);

  if (existing) {
    const dup = existing.find(item =>
      item.source_url && normalizeUrl(item.source_url) === normalizedUrl
    );
    if (dup) return { ...dup, is_duplicate: true };
  }

  const meta = await fetchOGMetadata(url);
  const title = meta['og:title'] || meta.title || extractDomain(url) || 'Untitled';
  const summary = meta['og:description'] || meta.description || '';
  const ogImageUrl = meta['og:image'] || null;
  const domain = extractDomain(url);
  const slug = generateSlug(title);
  const now = new Date().toISOString();

  let ogImagePath = null;
  if (ogImageUrl) {
    let fullImageUrl = ogImageUrl;
    if (ogImageUrl.startsWith('//')) fullImageUrl = 'https:' + ogImageUrl;
    else if (ogImageUrl.startsWith('/')) {
      try { fullImageUrl = new URL(url).origin + ogImageUrl; } catch {}
    }
    const img = await downloadImage(fullImageUrl);
    if (img) {
      const storagePath = `${userId}/${slug}/og-image${img.ext}`;
      const { error: uploadErr } = await admin.storage
        .from('item-images')
        .upload(storagePath, img.buffer, {
          contentType: img.ext === '.png' ? 'image/png'
            : img.ext === '.webp' ? 'image/webp' : 'image/jpeg',
          upsert: true,
        });
      if (uploadErr) {
        console.warn('cron: image upload failed', url, uploadErr.message);
      } else {
        const { data: urlData } = admin.storage
          .from('item-images')
          .getPublicUrl(storagePath);
        ogImagePath = urlData.publicUrl;
      }
    } else {
      console.warn('cron: image download returned null', url, fullImageUrl);
    }
  }

  const tags = generateTagsFromMetadata({ title, domain, description: summary, sourceUrl: url });

  const { data: inserted, error: insertErr } = await admin
    .from('items')
    .insert({
      user_id: userId, slug, title: title.replace(/"/g, "'"),
      source_url: url, domain, author: null,
      summary: (summary || '').slice(0, 200),
      body_markdown: `## Summary\n${summary || ''}`,
      og_image_path: ogImagePath, status: 'active',
      location: null, needs_review: true,
      added_at: now, enrichment_status: 'text_done',
      tags: JSON.stringify(tags),
    })
    .select()
    .single();

  if (insertErr) throw new Error(insertErr.message);
  return inserted;
}
