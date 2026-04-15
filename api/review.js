const { authenticateRequest, jsonResponse, handleCors } = require('./_lib/supabase');

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (req.method !== 'POST') return jsonResponse(res, 405, { error: 'Method not allowed' });

  const { user, error, status, client } = await authenticateRequest(req);
  if (error) return jsonResponse(res, status, { error });

  const { slug, why_saved, what_works } = req.body || {};
  if (!slug) return jsonResponse(res, 400, { error: 'Missing slug' });

  // Fetch item
  const { data: item, error: fetchErr } = await client
    .from('items')
    .select('*')
    .eq('slug', slug)
    .eq('user_id', user.id)
    .single();

  if (fetchErr || !item) {
    return jsonResponse(res, 404, { error: 'Item not found' });
  }

  const existingTags = typeof item.tags === 'string' ? JSON.parse(item.tags) : (item.tags || []);

  // Add intent tags from why_saved
  if (why_saved && why_saved.length > 0) {
    for (const intent of why_saved) {
      existingTags.push({ tag: intent, category: 'intent', weight: 0.9 });
    }
  }

  // Build updated body_markdown with what_works section
  let bodyMarkdown = item.body_markdown || '';
  if (what_works && what_works.trim()) {
    bodyMarkdown += `\n\n## What Makes It Work\n${what_works.trim()}`;
  }

  // Update item
  const { error: updateErr } = await client
    .from('items')
    .update({
      tags: JSON.stringify(existingTags),
      needs_review: false,
      body_markdown: bodyMarkdown,
    })
    .eq('id', item.id);

  if (updateErr) {
    return jsonResponse(res, 500, { error: 'Update failed', detail: updateErr.message });
  }

  return jsonResponse(res, 200, { status: 'reviewed', slug });
};
