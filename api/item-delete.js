const { authenticateRequest, jsonResponse, handleCors } = require('./_lib/supabase');

/**
 * Delete an item and the storage files it owns.
 *
 * Body: { slug }
 *
 * The frontend surfaces this via the three-dot menu with a two-step
 * confirm, so no additional guard is needed here.
 */
module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (req.method !== 'POST' && req.method !== 'DELETE') {
    return jsonResponse(res, 405, { error: 'Method not allowed' });
  }

  const { user, error, status, client } = await authenticateRequest(req);
  if (error) return jsonResponse(res, status, { error });

  const slug = (req.body && req.body.slug) || req.query.slug;
  if (!slug) return jsonResponse(res, 400, { error: 'Missing slug' });

  const { data: item, error: fetchErr } = await client
    .from('items')
    .select('id, user_id, slug')
    .eq('slug', slug)
    .eq('user_id', user.id)
    .single();
  if (fetchErr || !item) return jsonResponse(res, 404, { error: 'Item not found' });

  // Best-effort storage cleanup: list everything under {user_id}/{slug}/
  // and batch-remove. A single remove failure doesn't block the row delete
  // (orphaned files can be GC'd later; an undeletable row is worse).
  try {
    const prefix = `${user.id}/${slug}`;
    const { data: files } = await client.storage.from('item-images').list(prefix, { limit: 100 });
    if (Array.isArray(files) && files.length) {
      const paths = files.map(f => `${prefix}/${f.name}`);
      const { error: rmErr } = await client.storage.from('item-images').remove(paths);
      if (rmErr) console.warn('item-delete: storage remove failed', slug, rmErr.message);
    }
  } catch (err) {
    console.warn('item-delete: storage cleanup threw', slug, err.message);
  }

  const { error: deleteErr } = await client
    .from('items')
    .delete()
    .eq('id', item.id);
  if (deleteErr) return jsonResponse(res, 500, { error: 'Delete failed', detail: deleteErr.message });

  return jsonResponse(res, 200, { slug, deleted: true });
};
