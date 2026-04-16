const {
  authenticateRequest, jsonResponse, handleCors,
  generateSlug, normalizeUrl, fetchOGMetadata,
  downloadImage, generateTagsFromMetadata, extractDomain,
} = require('./_lib/supabase');

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (req.method !== 'POST') return jsonResponse(res, 405, { error: 'Method not allowed' });

  const { user, error, status, client } = await authenticateRequest(req);
  if (error) return jsonResponse(res, status, { error });

  const { type, content } = req.body || {};
  if (!type || !content) return jsonResponse(res, 400, { error: 'Missing type or content' });

  if (type === 'url') {
    return handleUrlCapture(client, user, content, res);
  }
  if (type === 'text') {
    return handleTextCapture(client, user, content, res);
  }

  return jsonResponse(res, 400, { error: 'Unknown type: ' + type });
};

async function handleUrlCapture(client, user, url, res) {
  // Duplicate check
  const normalizedUrl = normalizeUrl(url);
  const { data: existing } = await client
    .from('items')
    .select('slug, title, source_url')
    .eq('user_id', user.id)
    .not('source_url', 'is', null);

  if (existing) {
    const dup = existing.find(item =>
      item.source_url && normalizeUrl(item.source_url) === normalizedUrl
    );
    if (dup) {
      return jsonResponse(res, 409, { error: 'Duplicate item', existing: dup });
    }
  }

  // Fetch OG metadata
  const meta = await fetchOGMetadata(url);
  const title = meta['og:title'] || meta.title || extractDomain(url) || 'Untitled';
  const summary = meta['og:description'] || meta.description || '';
  const ogImageUrl = meta['og:image'] || null;
  const domain = extractDomain(url);
  const slug = generateSlug(title);
  const now = new Date().toISOString();

  // Download and upload OG image
  let ogImagePath = null;
  let hasImage = false;

  if (ogImageUrl) {
    // Resolve relative OG image URLs
    let fullImageUrl = ogImageUrl;
    if (ogImageUrl.startsWith('//')) {
      fullImageUrl = 'https:' + ogImageUrl;
    } else if (ogImageUrl.startsWith('/')) {
      try {
        const base = new URL(url);
        fullImageUrl = base.origin + ogImageUrl;
      } catch { /* keep as-is */ }
    }

    const img = await downloadImage(fullImageUrl);
    if (img) {
      const storagePath = `${user.id}/${slug}/og-image${img.ext}`;
      const { error: uploadErr } = await client.storage
        .from('item-images')
        .upload(storagePath, img.buffer, {
          contentType: img.ext === '.png' ? 'image/png'
            : img.ext === '.webp' ? 'image/webp' : 'image/jpeg',
          upsert: true,
        });

      if (!uploadErr) {
        const { data: urlData } = client.storage
          .from('item-images')
          .getPublicUrl(storagePath);
        ogImagePath = urlData.publicUrl;
        hasImage = true;
      }
    }
  }

  // Generate tags
  const tags = generateTagsFromMetadata({ title, domain, description: summary, sourceUrl: url });

  // Build frontmatter for body_markdown
  const bodyMarkdown = `## Summary\n${summary || ''}`;

  // Insert item
  const item = {
    user_id: user.id,
    slug,
    title: title.replace(/"/g, "'"),
    source_url: url,
    domain,
    author: null,
    summary: (summary || '').slice(0, 200),
    body_markdown: bodyMarkdown,
    og_image_path: ogImagePath,
    status: 'active',
    location: null,
    needs_review: true,
    added_at: now,
    tags: JSON.stringify(tags),
  };

  const { data: inserted, error: insertErr } = await client
    .from('items')
    .insert(item)
    .select()
    .single();

  if (insertErr) {
    return jsonResponse(res, 500, { error: 'Insert failed', detail: insertErr.message });
  }

  // Trigger background enrichment (fire-and-forget)
  try {
    const enrichUrl = `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers.host}/api/enrich`;
    fetch(enrichUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': req.headers.authorization,
      },
      body: JSON.stringify({ slug, itemId: inserted.id }),
    }).catch(() => {}); // fire and forget
  } catch { /* ignore */ }

  return jsonResponse(res, 201, {
    ...inserted,
    has_image: hasImage,
    tags: typeof inserted.tags === 'string' ? JSON.parse(inserted.tags) : inserted.tags,
  });
}

async function handleTextCapture(client, user, content, res) {
  const words = content.trim().split(/\s+/);
  const title = words.slice(0, 5).join(' ');
  const slug = generateSlug(title);
  const now = new Date().toISOString();
  const summary = content.slice(0, 200);

  // Mine subject keywords + rule tags from the full note body, not just the
  // 5-word title — otherwise text captures collapse to a single format tag.
  const tags = generateTagsFromMetadata({
    title,
    description: content,
    sourceUrl: null,
  });

  const item = {
    user_id: user.id,
    slug,
    title,
    source_url: null,
    domain: null,
    author: null,
    summary,
    body_markdown: `## Summary\n${summary}`,
    og_image_path: null,
    status: 'active',
    location: null,
    needs_review: true,
    added_at: now,
    tags: JSON.stringify(tags),
  };

  const { data: inserted, error: insertErr } = await client
    .from('items')
    .insert(item)
    .select()
    .single();

  if (insertErr) {
    return jsonResponse(res, 500, { error: 'Insert failed', detail: insertErr.message });
  }

  return jsonResponse(res, 201, {
    ...inserted,
    has_image: false,
    tags: typeof inserted.tags === 'string' ? JSON.parse(inserted.tags) : inserted.tags,
  });
}
