const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

/** Admin client (bypasses RLS — for cron jobs and migrations) */
function getAdminClient() {
  return createClient(supabaseUrl, supabaseServiceKey);
}

/** User-scoped client from request auth header */
function getUserClient(req) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  return createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } }
  });
}

/** Extract and verify user from request. Returns { user, error, status }. */
async function authenticateRequest(req) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) {
    return { user: null, error: 'Missing authorization header', status: 401 };
  }
  const client = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } }
  });
  const { data: { user }, error } = await client.auth.getUser(token);
  if (error || !user) {
    return { user: null, error: 'Invalid or expired token', status: 401 };
  }
  return { user, error: null, status: 200, client };
}

/** Standard JSON response with CORS headers */
function jsonResponse(res, status, data) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Content-Type', 'application/json');
  return res.status(status).json(data);
}

/** Handle CORS preflight. Returns true if handled. */
function handleCors(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.status(204).end();
    return true;
  }
  return false;
}

/** Generate a URL-safe slug from a title */
function generateSlug(title) {
  let slug = (title || 'untitled').toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 50);
  const hash = crypto.createHash('md5')
    .update(title + Date.now())
    .digest('hex')
    .slice(0, 6);
  return `${slug}-${hash}`;
}

/** Normalize URL for duplicate comparison (matches analyze.py logic) */
function normalizeUrl(url) {
  return url
    .replace(/\/+$/, '')
    .replace(/\?.*$/, '')
    .replace(/#.*$/, '')
    .replace('http://', 'https://')
    .replace('www.', '')
    .toLowerCase();
}

/** Fetch OG metadata from a URL (ports analyze.py fetch_og_metadata) */
async function fetchOGMetadata(url) {
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

    // Read first 50KB
    const reader = resp.body.getReader();
    const chunks = [];
    let totalSize = 0;
    while (totalSize < 50000) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      totalSize += value.length;
    }
    reader.cancel();

    const html = Buffer.concat(chunks).toString('utf-8');
    const meta = {};

    // Extract OG tags (both attribute orders)
    const ogPattern1 = /<meta\s+(?:property|name)=["']og:(\w+)["']\s+content=["']([^"']*)["']/gi;
    const ogPattern2 = /<meta\s+content=["']([^"']*)["'].*?(?:property|name)=["']og:(\w+)["']/gi;

    let match;
    while ((match = ogPattern1.exec(html)) !== null) {
      meta[`og:${match[1]}`] = match[2];
    }
    while ((match = ogPattern2.exec(html)) !== null) {
      meta[`og:${match[2]}`] = match[1];
    }

    // Extract <title>
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch) meta.title = titleMatch[1].trim();

    // Extract meta description
    const descMatch = html.match(/<meta\s+name=["']description["']\s+content=["']([^"']*)["']/i);
    if (descMatch) meta.description = descMatch[1];

    meta._status = 'fetched';
    return meta;
  } catch (err) {
    return { _status: 'error', _error: err.message };
  }
}

/** Download image from URL and return { buffer, ext } or null */
async function downloadImage(imageUrl) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const resp = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
        'Accept': 'image/webp,image/*,*/*',
      },
      signal: controller.signal,
      redirect: 'follow',
    });
    clearTimeout(timeout);

    if (!resp.ok) return null;

    const buffer = Buffer.from(await resp.arrayBuffer());
    if (buffer.length < 1000) return null; // Skip tiny/broken images

    const contentType = resp.headers.get('content-type') || '';
    let ext = '.jpg';
    if (contentType.includes('png')) ext = '.png';
    else if (contentType.includes('webp')) ext = '.webp';
    else if (imageUrl.match(/\.png(\?|$)/i)) ext = '.png';
    else if (imageUrl.match(/\.webp(\?|$)/i)) ext = '.webp';

    return { buffer, ext };
  } catch {
    return null;
  }
}

/** Generate basic tags from metadata (ports analyze.py generate_tags_from_metadata) */
function generateTagsFromMetadata({ title, domain, description, sourceUrl }) {
  const tags = [];

  // Format tag
  if (sourceUrl) {
    tags.push({ tag: 'website', category: 'format', weight: 0.4 });
  } else {
    tags.push({ tag: 'text-note', category: 'format', weight: 0.4 });
  }

  // Domain tag
  if (domain) {
    const cleanDomain = domain.replace(/^www\./, '');
    tags.push({ tag: cleanDomain, category: 'domain', weight: 0.6 });
  }

  return tags;
}

/** Extract domain from URL */
function extractDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

module.exports = {
  getAdminClient,
  getUserClient,
  authenticateRequest,
  jsonResponse,
  handleCors,
  generateSlug,
  normalizeUrl,
  fetchOGMetadata,
  downloadImage,
  generateTagsFromMetadata,
  extractDomain,
};
