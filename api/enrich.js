const { authenticateRequest, jsonResponse, handleCors, downloadImage } = require('./_lib/supabase');
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

const CANDIDATES_PROMPT = `You are curating a designer's personal knowledge base. Given the text of a web page, produce two things the user will choose from:

1. **snippets**: 3–5 short, standalone representative quotes or passages (each ≤ 200 chars) that capture what's interesting about this page for a designer. No ellipses, full sentences when possible.
2. **reasons**: 2–3 short phrases (≤ 4 words each, lowercase kebab-case) suggesting *why* a designer might save this. Examples: "color-palette-inspiration", "grid-system-reference", "typography-pairing", "onboarding-pattern".

Return ONLY valid JSON: {"snippets": ["...", "..."], "reasons": ["...", "..."]}`;

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

  const apiKey = await getApiKey(client, user.id);
  const anthropic = apiKey ? new Anthropic({ apiKey }) : null;
  const result = { slug: item.slug };
  const existingTags = typeof item.tags === 'string' ? JSON.parse(item.tags) : (item.tags || []);
  let currentTags = existingTags;

  // ---- Phase A: Vision tags (requires og_image_path + API key) ----
  if (item.og_image_path && anthropic) {
    try {
      const imgResp = await fetch(item.og_image_path);
      if (!imgResp.ok) throw new Error('Could not fetch image');

      const imgBuffer = Buffer.from(await imgResp.arrayBuffer());
      if (imgBuffer.length > 20 * 1024 * 1024) throw new Error('Image too large');

      const contentType = imgResp.headers.get('content-type') || 'image/jpeg';
      const mediaType = contentType.includes('png') ? 'image/png'
        : contentType.includes('webp') ? 'image/webp' : 'image/jpeg';
      const imageB64 = imgBuffer.toString('base64');

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

      const newTags = mergeNewTags(existingTags, visionResult);
      currentTags = [...existingTags, ...newTags];
      result.tags = currentTags;

      const title = item.title || '';
      if (title.startsWith('Image upload') || title.startsWith('Saved from')) {
        const smartTitle = await generateSmartTitle(anthropic, imageB64, mediaType);
        if (smartTitle) result.title = smartTitle;
      }

      const updates = {
        tags: JSON.stringify(currentTags),
        analyzed_at: new Date().toISOString(),
        enrichment_status: 'vision_done',
      };
      if (result.title) updates.title = result.title;
      await client.from('items').update(updates).eq('id', item.id);
    } catch (err) {
      result.vision_error = (err.message || '').slice(0, 100);
      await client.from('items').update({ enrichment_status: 'error' }).eq('id', item.id);
      return jsonResponse(res, 200, result);
    }
  } else if (!item.og_image_path && item.enrichment_status !== 'text_done') {
    await client.from('items').update({ enrichment_status: 'text_done' }).eq('id', item.id);
  }

  // ---- Phase B: Candidates (requires source_url + API key) ----
  // Extracts additional images, representative snippets, and suggested
  // why-saved reasons for the user to curate in the panel.
  if (item.source_url && anthropic) {
    try {
      const html = await fetchPageHtml(item.source_url);
      if (html) {
        const imageCandidates = await harvestImageCandidates({
          html, sourceUrl: item.source_url,
          client, userId: user.id, slug: item.slug,
          excludePath: item.og_image_path,
        });

        const pageText = extractPageText(html).slice(0, 6000);
        let snippets = [];
        let reasons = [];
        if (pageText.length > 200) {
          try {
            const resp = await anthropic.messages.create({
              model: 'claude-sonnet-4-6',
              max_tokens: 600,
              system: CANDIDATES_PROMPT,
              messages: [{ role: 'user', content: pageText }],
            });
            let raw = resp.content[0].text.trim();
            raw = raw.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
            const parsed = JSON.parse(raw);
            snippets = Array.isArray(parsed.snippets)
              ? parsed.snippets.map(s => String(s).trim()).filter(s => s && s.length <= 400).slice(0, 5)
              : [];
            reasons = Array.isArray(parsed.reasons)
              ? parsed.reasons.map(r => String(r).toLowerCase().trim().replace(/[^a-z0-9\- ]/g, '').replace(/\s+/g, '-')).filter(Boolean).slice(0, 3)
              : [];
          } catch (err) {
            console.warn('candidates prompt failed', item.slug, err.message);
          }
        }

        const candidates = {
          images: imageCandidates,
          snippets,
          reasons,
        };
        result.enrichment_candidates = candidates;

        await client.from('items').update({
          enrichment_candidates: JSON.stringify(candidates),
          enrichment_status: 'candidates_done',
          needs_review: shouldReview(currentTags),
        }).eq('id', item.id);
      } else if (item.enrichment_status === 'pending') {
        // HTML fetch failed — leave status at vision_done (already set above)
        // or set to vision_done here to stop the client poller.
        await client.from('items').update({ enrichment_status: 'vision_done' }).eq('id', item.id);
      }
    } catch (err) {
      console.warn('candidates phase error', item.slug, err.message);
      // Don't flip to 'error' — vision phase already succeeded. Just stop
      // the candidates poll by leaving status at vision_done.
    }
  } else {
    // No API key or no URL — mark review state so poller terminates.
    await client.from('items').update({
      needs_review: shouldReview(currentTags),
    }).eq('id', item.id);
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

  if (tags.length >= 8 && highWeight >= 4 && Object.keys(cats).length >= 3) return false;
  return true;
}

async function getApiKey(client, userId) {
  const { data } = await client
    .from('user_settings')
    .select('setting_value')
    .eq('user_id', userId)
    .eq('setting_key', 'anthropic_api_key')
    .single();

  if (data?.setting_value?.key) return data.setting_value.key;
  return process.env.ANTHROPIC_API_KEY || null;
}

// ---- HTML fetch + extraction helpers ----

async function fetchPageHtml(url) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const resp = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml',
      },
      signal: controller.signal,
      redirect: 'follow',
    });
    clearTimeout(timeout);
    if (!resp.ok) return null;

    // Read up to 500KB — enough for most articles' body + image URLs.
    const reader = resp.body.getReader();
    const chunks = [];
    let total = 0;
    while (total < 500_000) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      total += value.length;
    }
    reader.cancel();
    return Buffer.concat(chunks).toString('utf-8');
  } catch (err) {
    console.warn('fetchPageHtml failed', url, err.message);
    return null;
  }
}

function extractPageText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Pull candidate <img> URLs out of the HTML body.
 * Filters:
 *  - Absolute-able (http/https after resolution).
 *  - Skip tracking pixels (1x1), sprites, data: URIs, and obvious logos/avatars.
 *  - Dedupe; keep first N.
 */
function extractImageUrls(html, baseUrl) {
  const urls = new Set();
  const out = [];
  const imgRe = /<img\b[^>]*>/gi;
  let match;
  while ((match = imgRe.exec(html)) !== null && out.length < 20) {
    const tag = match[0];
    const srcMatch = tag.match(/\bsrc=["']([^"']+)["']/i);
    const srcsetMatch = tag.match(/\bsrcset=["']([^"']+)["']/i);
    const altMatch = tag.match(/\balt=["']([^"']*)["']/i);
    const widthMatch = tag.match(/\bwidth=["']?(\d+)/i);
    const heightMatch = tag.match(/\bheight=["']?(\d+)/i);
    let src = srcMatch ? srcMatch[1] : null;

    if (!src && srcsetMatch) {
      // Take the largest from srcset
      const entries = srcsetMatch[1].split(',').map(s => s.trim());
      const last = entries[entries.length - 1];
      src = last ? last.split(/\s+/)[0] : null;
    }
    if (!src) continue;
    if (src.startsWith('data:')) continue;

    // Resolve relative
    let abs;
    try { abs = new URL(src, baseUrl).href; } catch { continue; }
    if (!/^https?:/i.test(abs)) continue;

    // Dimension filter
    const w = widthMatch ? parseInt(widthMatch[1]) : null;
    const h = heightMatch ? parseInt(heightMatch[1]) : null;
    if ((w && w < 100) || (h && h < 100)) continue;

    // Path heuristic — skip obvious icons/avatars/logos/pixels
    if (/(\bicon\b|\bavatar\b|\bpixel\b|\btracking\b|\bsprite\b|\bbadge\b|\bfavicon\b|\blogo-?small\b|1x1|spacer)/i.test(abs)) continue;

    if (urls.has(abs)) continue;
    urls.add(abs);
    out.push({ url: abs, label: altMatch ? altMatch[1].slice(0, 80) : null });
  }
  return out;
}

/**
 * Download up to 5 candidate images and upload to Supabase storage.
 * Returns [{ path, label, source: 'extracted' }].
 * Skips any URL that matches `excludePath` (the OG image, already stored).
 */
async function harvestImageCandidates({ html, sourceUrl, client, userId, slug, excludePath }) {
  const candidates = extractImageUrls(html, sourceUrl);
  const out = [];
  let n = 0;
  for (const cand of candidates) {
    if (out.length >= 5) break;
    if (excludePath && cand.url === excludePath) continue;

    const img = await downloadImage(cand.url);
    if (!img) continue;

    const storagePath = `${userId}/${slug}/candidate-${n}${img.ext}`;
    const { error: uploadErr } = await client.storage
      .from('item-images')
      .upload(storagePath, img.buffer, {
        contentType: img.ext === '.png' ? 'image/png'
          : img.ext === '.webp' ? 'image/webp' : 'image/jpeg',
        upsert: true,
      });
    if (uploadErr) {
      console.warn('candidate upload failed', slug, uploadErr.message);
      continue;
    }
    const { data: urlData } = client.storage.from('item-images').getPublicUrl(storagePath);
    if (urlData?.publicUrl) {
      out.push({ path: urlData.publicUrl, label: cand.label, source: 'extracted' });
      n++;
    }
  }
  return out;
}
