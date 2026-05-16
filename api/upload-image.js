const {
  authenticateRequest, jsonResponse, handleCors, generateSlug,
} = require('./_lib/supabase');

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (req.method !== 'POST') return jsonResponse(res, 405, { error: 'Method not allowed' });

  const { user, error, status, client } = await authenticateRequest(req);
  if (error) return jsonResponse(res, status, { error });

  // Read raw body as buffer
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const buffer = Buffer.concat(chunks);

  if (!buffer.length) {
    return jsonResponse(res, 400, { error: 'No image data received' });
  }

  // Convert to WebP via sharp — also returns the output dimensions so
  // images[] can carry width/height and the frontend renders without
  // an aspect-ratio reflow.
  const { ensureWebp } = require('./_lib/webp');
  let converted;
  try {
    converted = await ensureWebp(buffer, { maxWidth: 2400 });
  } catch (err) {
    return jsonResponse(res, 400, { error: 'Image conversion failed', detail: err.message });
  }

  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const title = `Image upload — ${dateStr}`;
  const slug = generateSlug(title);
  const isoNow = now.toISOString();

  const storagePath = `${user.id}/${slug}/og-image${converted.ext}`;
  const { error: uploadErr } = await client.storage
    .from('item-images')
    .upload(storagePath, converted.buffer, { contentType: converted.mime, upsert: true });

  if (uploadErr) {
    return jsonResponse(res, 500, { error: 'Image upload failed', detail: uploadErr.message });
  }

  const { data: urlData } = client.storage
    .from('item-images')
    .getPublicUrl(storagePath);

  const tags = [{ tag: 'image-upload', category: 'format', weight: 0.4 }];

  const imagesEntry = [{
    path: urlData.publicUrl, source: 'og', is_primary: true,
    width: converted.width || null, height: converted.height || null,
  }];

  const item = {
    user_id: user.id,
    slug,
    title,
    source_url: null,
    domain: null,
    author: null,
    summary: 'Image pasted from clipboard',
    body_markdown: '## Summary\nImage pasted from clipboard',
    og_image_path: urlData.publicUrl,
    images: JSON.stringify(imagesEntry),
    status: 'active',
    location: null,
    needs_review: true,
    added_at: isoNow,
    // Vision will flip this to 'vision_done' — image uploads always have
    // something to analyze, unlike URL captures that may lack an OG image.
    enrichment_status: 'text_done',
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

  // Trigger background enrichment
  try {
    const enrichUrl = `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers.host}/api/enrich`;
    fetch(enrichUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': req.headers.authorization,
      },
      body: JSON.stringify({ slug, itemId: inserted.id }),
    }).catch(() => {});
  } catch { /* ignore */ }

  return jsonResponse(res, 201, {
    ...inserted,
    has_image: true,
    tags: typeof inserted.tags === 'string' ? JSON.parse(inserted.tags) : inserted.tags,
  });
};
