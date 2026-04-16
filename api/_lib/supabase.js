const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
const {
  runRuleEnrichment, mineSubjectKeywords, formatTagFor,
  STOP_WORDS_EXT, PLATFORM_NOISE,
} = require('./enrich-rules');

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

/** Normalize URL for duplicate comparison */
function normalizeUrl(url) {
  return url
    .replace(/\/+$/, '')
    .replace(/\?.*$/, '')
    .replace(/#.*$/, '')
    .replace('http://', 'https://')
    .replace('www.', '')
    .toLowerCase();
}

/**
 * Decode HTML entities in a string. Handles named (&amp; &quot; &apos; …),
 * decimal (&#39;) and hex (&#x27;) references. Zero-dep; covers the entities
 * that show up in og:title / og:description / og:image attribute values.
 */
const NAMED_ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  copy: '\u00a9', reg: '\u00ae', trade: '\u2122',
  mdash: '\u2014', ndash: '\u2013', hellip: '\u2026',
  ldquo: '\u201c', rdquo: '\u201d', lsquo: '\u2018', rsquo: '\u2019',
  middot: '\u00b7',
};
function decodeHtmlEntities(str) {
  if (typeof str !== 'string' || !str.includes('&')) return str;
  return str.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, ref) => {
    if (ref[0] === '#') {
      const code = ref[1] === 'x' || ref[1] === 'X'
        ? parseInt(ref.slice(2), 16)
        : parseInt(ref.slice(1), 10);
      if (Number.isFinite(code) && code > 0) {
        try { return String.fromCodePoint(code); } catch { return m; }
      }
      return m;
    }
    const name = ref.toLowerCase();
    return Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, name)
      ? NAMED_ENTITIES[name]
      : m;
  });
}

/** Fetch OG metadata from a URL */
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
      meta[`og:${match[1]}`] = decodeHtmlEntities(match[2]);
    }
    while ((match = ogPattern2.exec(html)) !== null) {
      meta[`og:${match[2]}`] = decodeHtmlEntities(match[1]);
    }

    // Extract <title>
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch) meta.title = decodeHtmlEntities(titleMatch[1].trim());

    // Extract meta description
    const descMatch = html.match(/<meta\s+name=["']description["']\s+content=["']([^"']*)["']/i);
    if (descMatch) meta.description = decodeHtmlEntities(descMatch[1]);

    meta._status = 'fetched';
    return meta;
  } catch (err) {
    console.warn('fetchOGMetadata failed', url, err.message);
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

    if (!resp.ok) {
      console.warn('downloadImage: non-ok response', imageUrl, resp.status);
      return null;
    }

    const buffer = Buffer.from(await resp.arrayBuffer());
    // 500-byte floor catches transparent 1x1 trackers while keeping small
    // favicons and minimal SVG exports. The old 1000-byte cutoff was dropping
    // valid hero images served through compressing CDNs.
    if (buffer.length < 500) {
      console.warn('downloadImage: buffer too small', imageUrl, buffer.length);
      return null;
    }

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

/**
 * Build the capture-time tag set.
 *
 * Produces:
 *   - Platform-aware format tag (instagram/tweet/dribbble/… or website/text-note)
 *   - Source-domain tag (URL hostname)
 *   - Up to 5 subject keywords mined from title  (weights 0.8 → 0.5)
 *   - Up to 3 subject keywords mined from description (weight 0.5)
 *   - Rule-matched tool/style/mood/location tags from the combined text
 *
 * Capped at 12 total, sorted by weight desc. Matches the behavior of the
 * archived Python enrich.py + analyze.py pipelines.
 */
function generateTagsFromMetadata({ title, domain, description, sourceUrl }) {
  const tags = [];
  const existingNames = new Set();
  const push = (t) => {
    if (!t || !t.tag || existingNames.has(t.tag)) return;
    existingNames.add(t.tag);
    tags.push(t);
  };

  // Format + domain
  push(formatTagFor({ sourceUrl, domain }));
  if (domain) {
    push({ tag: domain.replace(/^www\./, ''), category: 'domain', weight: 0.6 });
  }

  // Subject keywords from title (short words allowed, tight stops)
  for (const kw of mineSubjectKeywords(title, {
    minLen: 3, limit: 5,
    weightStart: 0.8, weightStep: 0.1, weightFloor: 0.5,
    extraStops: new Set(existingNames),
  })) push(kw);

  // Subject keywords from description (longer words, extra stops)
  for (const kw of mineSubjectKeywords(description, {
    minLen: 4, limit: 3,
    weightStart: 0.5, weightStep: 0, weightFloor: 0.5,
    extraStops: new Set([...existingNames, ...STOP_WORDS_EXT, ...PLATFORM_NOISE]),
  })) push(kw);

  // Rule-based enrichment over title + description + domain
  const ruleText = [title, description].filter(Boolean).join(' ');
  for (const t of runRuleEnrichment(ruleText, existingNames, { domain })) push(t);

  // Cap at 12, sorted by weight desc
  return tags
    .sort((a, b) => (b.weight || 0) - (a.weight || 0))
    .slice(0, 12);
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
  decodeHtmlEntities,
  fetchOGMetadata,
  downloadImage,
  generateTagsFromMetadata,
  extractDomain,
};
