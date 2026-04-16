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

  const ct = req.headers['content-type'] || 'image/png';
  const ext = ct.includes('jpeg') || ct.includes('jpg') ? '.jpg'
    : ct.includes('webp') ? '.webp' : '.png';
  const mimeType = ext === '.jpg' ? 'image/jpeg'
    : ext === '.webp' ? 'image/webp' : 'image/png';

  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const title = `Image upload — ${dateStr}`;
  const slug = generateSlug(title);
  const isoNow = now.toISOString();

  // Upload image to Supabase Storage
  const storagePath = `${user.id}/${slug}/og-image${ext}`;
  const { error: uploadErr } = await client.storage
    .from('item-images')
    .upload(storagePath, buffer, { contentType: mimeType, upsert: true });

  if (uploadErr) {
    return jsonResponse(res, 500, { error: 'Image upload failed', detail: uploadErr.message });
  }

  const { data: urlData } = client.storage
    .from('item-images')
    .getPublicUrl(storagePath);

  const tags = [{ tag: 'image-upload', category: 'format', weight: 0.4 }];

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
