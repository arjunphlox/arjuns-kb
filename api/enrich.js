const { authenticateRequest, jsonResponse, handleCors } = require('./_lib/supabase');
const Anthropic = require('@anthropic-ai/sdk');

const SYSTEM_PROMPT = `You analyze images from a design knowledge base. Based on the visual content, provide tags in three categories.

Return ONLY valid JSON with this exact structure:
{
  "color": [{"tag": "name", "weight": 0.0}],
  "style": [{"tag": "name", "weight": 0.0}],
  "mood": [{"tag": "name", "weight": 0.0}]
}

Rules:
- color: 2-4 specific colors visible in the image. Use descriptive names like "burgundy", "teal", "charcoal", "ivory", "coral", "sage", "slate", "amber" — not generic "blue" or "red". Weight = how dominant (0.0-1.0).
- style: 1-3 visual/design styles. Examples: "minimalist", "brutalist", "editorial", "geometric", "organic", "typographic", "illustrated", "photographic", "3d", "hand-drawn", "flat", "retro", "futuristic", "grunge". Weight = how strongly (0.0-1.0).
- mood: 1-2 emotional tones. Examples: "dark", "vibrant", "elegant", "playful", "calm", "energetic", "moody", "warm", "cool", "dramatic", "professional", "whimsical". Weight = confidence (0.0-1.0).

Return ONLY the JSON object, no explanation.`;

const TITLE_PROMPT = `Look at this image and give it a short, descriptive title (3-5 words).
The title should describe what the image shows — e.g., "Geometric Pattern Grid", "Dark Typography Specimen", "Minimalist Watch Design".
Return ONLY the title text, nothing else.`;

const VISION_CATEGORIES = new Set(['color', 'style', 'mood']);

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (req.method !== 'POST') return jsonResponse(res, 405, { error: 'Method not allowed' });

  const { user, error, status, client } = await authenticateRequest(req);
  if (error) return jsonResponse(res, status, { error });

  const { slug, itemId } = req.body || {};
  if (!slug && !itemId) return jsonResponse(res, 400, { error: 'Missing slug or itemId' });

  // Fetch the item
  let query = client.from('items').select('*');
  if (itemId) query = query.eq('id', itemId);
  else query = query.eq('slug', slug).eq('user_id', user.id);

  const { data: item, error: fetchErr } = await query.single();
  if (fetchErr || !item) {
    return jsonResponse(res, 404, { error: 'Item not found' });
  }

  // Need an image to enrich
  if (!item.og_image_path) {
    return jsonResponse(res, 200, { status: 'skipped', reason: 'no image' });
  }

  // Get API key from user settings or env
  const apiKey = await getApiKey(client, user.id);
  if (!apiKey) {
    return jsonResponse(res, 200, { status: 'skipped', reason: 'no API key' });
  }

  const anthropic = new Anthropic({ apiKey });
  const result = { slug: item.slug };
  const existingTags = typeof item.tags === 'string' ? JSON.parse(item.tags) : (item.tags || []);

  try {
    // Download image from Storage URL
    const imgResp = await fetch(item.og_image_path);
    if (!imgResp.ok) throw new Error('Could not fetch image');

    const imgBuffer = Buffer.from(await imgResp.arrayBuffer());
    if (imgBuffer.length > 20 * 1024 * 1024) throw new Error('Image too large');

    const contentType = imgResp.headers.get('content-type') || 'image/jpeg';
    const mediaType = contentType.includes('png') ? 'image/png'
      : contentType.includes('webp') ? 'image/webp' : 'image/jpeg';
    const imageB64 = imgBuffer.toString('base64');

    // Call Claude vision for tags
    const contextTags = existingTags
      .filter(t => t.category === 'domain' || t.category === 'subject')
      .map(t => t.tag)
      .slice(0, 6);
    let contextStr = `Item titled "${item.title}"`;
    if (contextTags.length) contextStr += `, tagged with: ${contextTags.join(', ')}`;

    const visionResp = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 300,
      system: SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageB64 } },
          { type: 'text', text: contextStr },
        ],
      }],
    });

    let raw = visionResp.content[0].text.trim();
    raw = raw.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
    const visionResult = JSON.parse(raw);

    // Merge new tags
    const newTags = mergeNewTags(existingTags, visionResult);
    const allTags = [...existingTags, ...newTags];
    result.tags = allTags;

    // Smart title for image-only items
    const title = item.title || '';
    if (title.startsWith('Image upload') || title.startsWith('Saved from')) {
      const smartTitle = await generateSmartTitle(anthropic, imageB64, mediaType);
      if (smartTitle) result.title = smartTitle;
    }

    // Determine needs_review
    const needsReview = shouldReview(allTags);
    result.needs_review = needsReview;

    // Update item in Supabase
    const updates = {
      tags: JSON.stringify(allTags),
      needs_review: needsReview,
      analyzed_at: new Date().toISOString(),
    };
    if (result.title) updates.title = result.title;

    await client.from('items').update(updates).eq('id', item.id);

  } catch (err) {
    result.vision_error = (err.message || '').slice(0, 100);
  }

  return jsonResponse(res, 200, result);
};

function mergeNewTags(existingTags, visionResult) {
  const existingNames = new Set(existingTags.map(t => t.tag));
  const newTags = [];

  for (const category of VISION_CATEGORIES) {
    const items = visionResult[category] || [];
    for (const item of items) {
      const tagName = (item.tag || '').toLowerCase().trim();
      const weight = Math.min(1.0, Math.max(0.0, parseFloat(item.weight) || 0));
      if (tagName && !existingNames.has(tagName)) {
        newTags.push({
          tag: tagName,
          category,
          weight: Math.round(weight * 100) / 100,
        });
        existingNames.add(tagName);
      }
    }
  }
  return newTags;
}

async function generateSmartTitle(anthropic, imageB64, mediaType) {
  try {
    const resp = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 50,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageB64 } },
          { type: 'text', text: TITLE_PROMPT },
        ],
      }],
    });
    return resp.content[0].text.trim().replace(/^["']|["']$/g, '');
  } catch {
    return null;
  }
}

function shouldReview(tags) {
  if (tags.length < 3) return true;
  if (tags.every(t => (t.weight || 0) < 0.5)) return true;

  const cats = {};
  let highWeight = 0;
  for (const t of tags) {
    cats[t.category] = (cats[t.category] || 0) + 1;
    if ((t.weight || 0) >= 0.6) highWeight++;
  }

  // Confident and diverse — skip review
  if (tags.length >= 8 && highWeight >= 4 && Object.keys(cats).length >= 3) return false;

  return true;
}

async function getApiKey(client, userId) {
  // Try user settings first
  const { data } = await client
    .from('user_settings')
    .select('setting_value')
    .eq('user_id', userId)
    .eq('setting_key', 'anthropic_api_key')
    .single();

  if (data?.setting_value?.key) return data.setting_value.key;

  // Fall back to environment variable
  return process.env.ANTHROPIC_API_KEY || null;
}
