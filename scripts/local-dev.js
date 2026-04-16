#!/usr/bin/env node
/**
 * Stello — local dev router.
 *
 * Tiny zero-dep server that routes /api/:path to api/:path.js and serves
 * every other request as a static file. Intended only for local testing
 * when vercel dev is inconvenient (e.g. no Vercel login).
 *
 * Each handler still runs authenticateRequest from api/_lib/supabase.js,
 * so auth isn't bypassed — we just skip the Vercel CLI's credential gate
 * for the local loopback.
 *
 *   PORT=8080 node scripts/local-dev.js
 *
 * Loads env vars from .env.local if present.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT || 8080);

// --- .env.local loader (minimal, no dep) --------------------------------
(() => {
  const envFile = path.join(ROOT, '.env.local');
  if (!fs.existsSync(envFile)) return;
  for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (!(key in process.env)) process.env[key] = val;
  }
})();

// --- MIME map (just what Stello serves) ---------------------------------
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.otf': 'font/otf',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

// --- Handler loader cache -----------------------------------------------
const handlerCache = new Map();
function loadHandler(apiPath) {
  if (handlerCache.has(apiPath)) return handlerCache.get(apiPath);
  const candidates = [
    path.join(ROOT, 'api', apiPath + '.js'),
    path.join(ROOT, 'api', apiPath, 'index.js'),
  ];
  for (const file of candidates) {
    if (fs.existsSync(file)) {
      // Clear Node's require cache so handler edits pick up on refresh
      delete require.cache[require.resolve(file)];
      const mod = require(file);
      const handler = typeof mod === 'function' ? mod : mod.default;
      handlerCache.set(apiPath, handler);
      return handler;
    }
  }
  return null;
}

// --- Body parser --------------------------------------------------------
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// --- Main request dispatcher -------------------------------------------
const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);
  const pathname = decodeURIComponent(parsed.pathname || '/');

  // API routes
  if (pathname.startsWith('/api/')) {
    const apiPath = pathname.slice(5); // strip /api/
    const handler = loadHandler(apiPath);
    if (!handler) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'API route not found: ' + apiPath }));
    }

    // Shim the Vercel-style req/res: req.body, req.query, res.status().json()
    try {
      const buf = (req.method !== 'GET' && req.method !== 'HEAD') ? await readBody(req) : Buffer.alloc(0);
      const ct = (req.headers['content-type'] || '').toLowerCase();
      if (buf.length && ct.includes('application/json')) {
        try { req.body = JSON.parse(buf.toString('utf8')); } catch { req.body = {}; }
      } else if (buf.length) {
        req.body = buf;
      }
      req.query = parsed.query;
      // Vercel-style res.status().json()
      res.status = (code) => { res.statusCode = code; return res; };
      res.json = (data) => {
        if (!res.getHeader('Content-Type')) res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(data));
        return res;
      };
      await handler(req, res);
      if (!res.writableEnded) res.end();
    } catch (err) {
      console.error('[local-dev] handler threw:', apiPath, err);
      if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Handler error', detail: err.message }));
    }
    return;
  }

  // Static files
  let rel = pathname === '/' ? '/index.html' : pathname;
  // Strip trailing slash from bare routes (e.g. /login → /login.html)
  if (rel.endsWith('/')) rel = rel.slice(0, -1);
  const candidates = [
    path.join(ROOT, rel),
    path.join(ROOT, rel + '.html'),
  ];
  for (const file of candidates) {
    if (fs.existsSync(file) && fs.statSync(file).isFile()) {
      const ext = path.extname(file).toLowerCase();
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
      return fs.createReadStream(file).pipe(res);
    }
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found: ' + pathname);
});

server.listen(PORT, () => {
  console.log(`[local-dev] listening on http://localhost:${PORT}`);
  const envBits = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'ANTHROPIC_API_KEY']
    .map(k => `${k}=${process.env[k] ? '✓' : '✗'}`).join(' ');
  console.log(`[local-dev] env: ${envBits}`);
});
