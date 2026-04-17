const { authenticateRequest, jsonResponse, handleCors } = require('./_lib/supabase');

/**
 * Unified curation endpoint. The panel posts deltas here as the user
 * picks images, adds/removes snippets, toggles why-saved reasons, or
 * uploads a custom image. Each field is optional; only the fields that
 * change are sent.
 *
 * Body:
 *   slug                  (required)
 *   primary_image_path    — promote a path to is_primary=true
 *   add_image_paths[]     — paths that already exist in items.images OR
 *                           candidate URLs to promote into images[]
 *   remove_image_paths[]  — drop these from images[]
 *   new_snippets[]        — strings to append to snippets[]
 *   removed_snippet_ids[] — integer indexes (0-based) to remove
 *   why_saved[]           — reason strings (lowercase-kebab); appended as
 *                           intent tags the first time we see them
 *   what_works            — free-text; rewritten into body_markdown
 *   manual_image_upload   — { base64, mime, label? } — uploaded to storage
 *                           and pushed onto images[] as source='manual'
 *   resolve_candidates    — boolean; if true, clear enrichment_candidates
 */
module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (req.method !== 'POST') return jsonResponse(res, 405, { error: 'Method not allowed' });

  const { user, error, status, client } = await authenticateRequest(req);
  if (error) return jsonResponse(res, status, { error });

  const body = req.body || {};
  const slug = body.slug;
  if (!slug) return jsonResponse(res, 400, { error: 'Missing slug' });

  const { data: item, error: fetchErr } = await client
    .from('items')
    .select('*')
    .eq('slug', slug)
    .eq('user_id', user.id)
    .single();
  if (fetchErr || !item) return jsonResponse(res, 404, { error: 'Item not found' });

  const existingTags = parseJsonField(item.tags, []);
  const existingImages = parseJsonField(item.images, []);
  const existingSnippets = parseJsonField(item.snippets, []);
  const candidates = parseJsonField(item.enrichment_candidates, {});

  let images = existingImages.slice();
  let snippets = existingSnippets.slice();
  let tags = existingTags.slice();

  // Seed images[] with og_image_path once, so curation can manipulate it
  // like any other image.
  if (images.length === 0 && item.og_image_path) {
    images.push({
      path: item.og_image_path,
      source: 'og',
      is_primary: true,
    });
  }

  // --- Manual image upload -> push onto images[] + mark primary if first ---
  // Convert non-WebP uploads to WebP before storing. If the input is
  // already WebP, ensureWebp() is a no-op — no extra work.
  if (body.manual_image_upload && body.manual_image_upload.base64) {
    try {
      const { ensureWebp } = require('./_lib/webp');
      const rawBuffer = Buffer.from(body.manual_image_upload.base64, 'base64');
      const converted = await ensureWebp(rawBuffer, { maxWidth: 2400 });
      const n = images.length;
      const storagePath = `${user.id}/${slug}/manual-${Date.now()}-${n}${converted.ext}`;
      const { error: upErr } = await client.storage
        .from('item-images')
        .upload(storagePath, converted.buffer, { contentType: converted.mime, upsert: true });
      if (!upErr) {
        const { data: urlData } = client.storage.from('item-images').getPublicUrl(storagePath);
        if (urlData?.publicUrl) {
          images.push({
            path: urlData.publicUrl,
            label: body.manual_image_upload.label || null,
            source: 'manual',
            is_primary: images.length === 0,
          });
        }
      } else {
        console.warn('item-update: manual image upload failed', slug, upErr.message);
      }
    } catch (err) {
      console.warn('item-update: manual image conversion failed', slug, err.message);
    }
  }

  // --- Add candidate image paths into images[] ---
  if (Array.isArray(body.add_image_paths)) {
    const have = new Set(images.map(i => i.path));
    for (const path of body.add_image_paths) {
      if (!path || have.has(path)) continue;
      // Look up source label from candidates.images if we have it
      const candMatch = Array.isArray(candidates.images)
        ? candidates.images.find(c => c.path === path || c.url === path)
        : null;
      images.push({
        path,
        label: candMatch?.label || null,
        source: candMatch ? (candMatch.source || 'extracted') : 'extracted',
        is_primary: images.length === 0,
      });
      have.add(path);
    }
  }

  // --- Remove image paths ---
  if (Array.isArray(body.remove_image_paths) && body.remove_image_paths.length) {
    const drop = new Set(body.remove_image_paths);
    images = images.filter(i => !drop.has(i.path));
    // If we removed the primary, promote first remaining.
    if (!images.some(i => i.is_primary) && images.length) {
      images[0].is_primary = true;
    }
    // Best-effort storage cleanup: translate each public URL back to an
    // object path inside the item-images bucket and delete it. Failures
    // are logged but never block the DB update — orphaned files are
    // recoverable, a broken item row is not.
    const storagePaths = body.remove_image_paths
      .map(urlToStoragePath)
      .filter(Boolean);
    if (storagePaths.length) {
      const { error: rmErr } = await client.storage.from('item-images').remove(storagePaths);
      if (rmErr) console.warn('item-update: storage remove failed', slug, rmErr.message);
    }
  }

  // --- Primary image ---
  if (body.primary_image_path) {
    let found = false;
    images = images.map(i => {
      const match = i.path === body.primary_image_path;
      if (match) found = true;
      return { ...i, is_primary: match };
    });
    // If the path wasn't in images[] yet, add it as extracted.
    if (!found) {
      const candMatch = Array.isArray(candidates.images)
        ? candidates.images.find(c => c.path === body.primary_image_path || c.url === body.primary_image_path)
        : null;
      images = images.map(i => ({ ...i, is_primary: false }));
      images.push({
        path: body.primary_image_path,
        label: candMatch?.label || null,
        source: candMatch ? (candMatch.source || 'extracted') : 'extracted',
        is_primary: true,
      });
    }
  }

  // --- Snippet mutations ---
  if (Array.isArray(body.removed_snippet_ids) && body.removed_snippet_ids.length) {
    const drop = new Set(body.removed_snippet_ids.map(Number));
    snippets = snippets.filter((_, i) => !drop.has(i));
  }
  if (Array.isArray(body.new_snippets)) {
    const now = new Date().toISOString();
    for (const text of body.new_snippets) {
      const clean = String(text || '').trim();
      if (!clean) continue;
      // Dedupe exact matches
      if (snippets.some(s => s.text === clean)) continue;
      // Mark source as 'extracted' if the text is in candidates.snippets
      const fromCandidate = Array.isArray(candidates.snippets) && candidates.snippets.includes(clean);
      snippets.push({
        text: clean,
        source: fromCandidate ? 'extracted' : 'manual',
        added_at: now,
      });
    }
  }

  // --- why_saved -> intent tags (append only new ones) ---
  if (Array.isArray(body.why_saved)) {
    const existingIntents = new Set(
      tags.filter(t => t.category === 'intent').map(t => t.tag)
    );
    // Remove dropped intents — canonical list is what the client sends.
    tags = tags.filter(t => t.category !== 'intent' || body.why_saved.includes(t.tag));
    for (const raw of body.why_saved) {
      const reason = String(raw || '').toLowerCase().trim().replace(/\s+/g, '-');
      if (!reason || existingIntents.has(reason)) continue;
      tags.push({ tag: reason, category: 'intent', weight: 0.9 });
      existingIntents.add(reason);
    }
  }

  // --- body_markdown: rebuild Key Snippets + What Makes It Work sections ---
  let bodyMarkdown = stripSections(item.body_markdown || '', [
    'Key Snippets', 'What Makes It Work',
  ]);
  if (snippets.length) {
    const lines = snippets.map(s => `> ${s.text}`).join('\n\n');
    bodyMarkdown = bodyMarkdown.replace(/\s+$/, '') + `\n\n## Key Snippets\n${lines}`;
  }
  // what_works: undefined = leave existing (already stripped, so preserve)
  // empty string = explicitly clear (already stripped, no-op)
  // non-empty = append new section
  if (typeof body.what_works === 'string' && body.what_works.trim()) {
    bodyMarkdown = bodyMarkdown.replace(/\s+$/, '') + `\n\n## What Makes It Work\n${body.what_works.trim()}`;
  }

  // --- Mirror primary image back to legacy og_image_path for grid card ---
  const primary = images.find(i => i.is_primary);
  const ogImagePath = primary ? primary.path : (images[0]?.path || null);

  // --- Resolve candidates (remove ones the user already promoted) ---
  let nextCandidates = candidates;
  if (Array.isArray(candidates.images) && Array.isArray(body.add_image_paths) && body.add_image_paths.length) {
    const promoted = new Set(body.add_image_paths);
    nextCandidates = {
      ...candidates,
      images: candidates.images.filter(c => !promoted.has(c.path || c.url)),
    };
  }
  if (Array.isArray(candidates.snippets) && Array.isArray(body.new_snippets) && body.new_snippets.length) {
    const added = new Set(body.new_snippets.map(t => String(t).trim()));
    nextCandidates = {
      ...nextCandidates,
      snippets: (nextCandidates.snippets || candidates.snippets).filter(s => !added.has(s)),
    };
  }
  if (body.resolve_candidates) {
    nextCandidates = {};
  }

  const updates = {
    images: JSON.stringify(images),
    snippets: JSON.stringify(snippets),
    tags: JSON.stringify(tags),
    body_markdown: bodyMarkdown,
    og_image_path: ogImagePath,
    enrichment_candidates: JSON.stringify(nextCandidates),
  };
  // why_saved being present in the payload (even as []) means the user
  // resolved the capture form (clicked Save or Skip). Flip the review
  // flag off so the form stops appearing on reopen.
  let needsReview = item.needs_review;
  if (Array.isArray(body.why_saved)) {
    needsReview = false;
    updates.needs_review = false;
  }

  const { error: updateErr } = await client
    .from('items')
    .update(updates)
    .eq('id', item.id);
  if (updateErr) return jsonResponse(res, 500, { error: 'Update failed', detail: updateErr.message });

  return jsonResponse(res, 200, {
    slug,
    images,
    snippets,
    tags,
    og_image_path: ogImagePath,
    body_markdown: bodyMarkdown,
    enrichment_candidates: nextCandidates,
    needs_review: needsReview,
  });
};

/**
 * Public URLs from Supabase storage look like
 *   https://<project>.supabase.co/storage/v1/object/public/<bucket>/<path>
 * The storage .remove() API needs just the <path> portion (scoped to
 * the bucket). Returns null for anything that doesn't look like one of
 * our item-images URLs so we don't try to delete external images.
 */
function urlToStoragePath(url) {
  if (typeof url !== 'string') return null;
  const marker = '/storage/v1/object/public/item-images/';
  const i = url.indexOf(marker);
  if (i < 0) return null;
  return decodeURIComponent(url.slice(i + marker.length).split('?')[0]);
}

function parseJsonField(v, fallback) {
  if (v == null) return fallback;
  if (typeof v === 'string') {
    try { return JSON.parse(v); } catch { return fallback; }
  }
  return v;
}

/**
 * Remove any `## Heading` section (and its contents up to the next `## `)
 * from a markdown string. Used so the panel can rewrite its own sections
 * without duplicating them on every save.
 */
function stripSections(md, headings) {
  if (!md) return '';
  let out = md;
  for (const h of headings) {
    const re = new RegExp(
      `(^|\\n)##\\s+${h.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}\\b[\\s\\S]*?(?=\\n##\\s|$)`,
      'g'
    );
    out = out.replace(re, '');
  }
  return out.replace(/\n{3,}/g, '\n\n').trim();
}
