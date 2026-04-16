#!/usr/bin/env node
/**
 * Stello — API Server
 *
 * Static file serving + API endpoints for item capture, analysis, and config.
 * Spawns Python scripts for OG fetching and vision enrichment.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const { spawn } = require('child_process');
const crypto = require('crypto');

const ROOT = __dirname;
const PORT = process.env.PORT || 8080;
const ITEMS_DIR = path.join(ROOT, '_items');
const INDEX_FILE = path.join(ROOT, 'index.json');
const CONFIG_FILE = path.join(ROOT, 'config.json');
const PYTHON = '/usr/bin/python3';

// --- MIME types ---
const MIME = {
  '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.otf': 'font/otf',
  '.ttf': 'font/ttf', '.ico': 'image/x-icon',
  '.md': 'text/markdown',
};

// --- Index write mutex ---
let indexWriteQueue = Promise.resolve();
function withIndexLock(fn) {
  indexWriteQueue = indexWriteQueue.then(fn).catch(err => console.error('Index write error:', err));
  return indexWriteQueue;
}

// --- Config ---
function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  } catch {
    // Fallback to env var
    const key = process.env.ANTHROPIC_API_KEY;
    return {
      profiles: key ? { default: { key, label: 'Default' } } : {},
      active_profile: key ? 'default' : null,
    };
  }
}

function saveConfig(config) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

function getActiveApiKey() {
  const config = loadConfig();
  const profile = config.profiles[config.active_profile];
  return profile ? profile.key : process.env.ANTHROPIC_API_KEY || null;
}

// --- Python runner ---
function runPython(scriptPath, args, env = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(PYTHON, [scriptPath, ...args], {
      cwd: ROOT,
      env: { ...process.env, ...env },
    });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', d => stdout += d);
    proc.stderr.on('data', d => stderr += d);
    proc.on('close', code => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`Python exit ${code}: ${stderr}`));
    });
    proc.on('error', reject);
  });
}

// --- Index helpers ---
function readIndex() {
  try {
    return JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'));
  } catch {
    return { items: [], count: 0, built_at: new Date().toISOString() };
  }
}

function addToIndex(item) {
  return withIndexLock(() => {
    const index = readIndex();
    // Remove existing entry for same slug
    index.items = index.items.filter(i => i.slug !== item.slug);
    // Prepend new item
    index.items.unshift(item);
    index.count = index.items.length;
    index.built_at = new Date().toISOString();
    fs.writeFileSync(INDEX_FILE, JSON.stringify(index, null, 2));
  });
}

function updateIndexItem(slug, updates) {
  return withIndexLock(() => {
    const index = readIndex();
    const idx = index.items.findIndex(i => i.slug === slug);
    if (idx >= 0) {
      Object.assign(index.items[idx], updates);
      index.built_at = new Date().toISOString();
      fs.writeFileSync(INDEX_FILE, JSON.stringify(index, null, 2));
    }
  });
}

// --- SSE for bulk capture ---
const activeStreams = new Map(); // batchId -> { clients: [], items: [] }

function sendSSE(batchId, event, data) {
  const stream = activeStreams.get(batchId);
  if (!stream) return;
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  stream.clients.forEach(res => res.write(msg));
}

// --- Request body parser ---
function parseBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      const buf = Buffer.concat(chunks);
      const ct = req.headers['content-type'] || '';
      if (ct.includes('application/json')) {
        try { resolve(JSON.parse(buf.toString())); }
        catch { reject(new Error('Invalid JSON')); }
      } else {
        resolve(buf);
      }
    });
    req.on('error', reject);
  });
}

// --- API handlers ---
function jsonResponse(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(JSON.stringify(data));
}

async function handleCapture(req, res) {
  const body = await parseBody(req);
  const { type, content } = body;

  if (!type || !content) {
    return jsonResponse(res, 400, { error: 'Missing type or content' });
  }

  if (type === 'url') {
    try {
      const output = await runPython(
        path.join(ROOT, 'scripts', 'analyze.py'),
        ['capture', content]
      );
      const item = JSON.parse(output.trim().split('\n').pop());
      if (item.is_duplicate) {
        return jsonResponse(res, 409, { error: 'Duplicate item', existing: item });
      }
      await addToIndex(item);

      // Auto-trigger background analysis
      triggerBackgroundAnalysis(item.slug);

      return jsonResponse(res, 201, item);
    } catch (err) {
      console.error('Capture error:', err.message);
      return jsonResponse(res, 500, { error: 'Capture failed', detail: err.message });
    }
  }

  if (type === 'text') {
    try {
      const words = content.trim().split(/\s+/);
      const title = words.slice(0, 5).join(' ');
      const slug = generateSlug(title);
      const now = new Date().toISOString();

      const itemDir = path.join(ITEMS_DIR, slug);
      fs.mkdirSync(itemDir, { recursive: true });

      const summary = content.slice(0, 200);
      const fm = buildFrontmatter({ title, slug, summary, now });
      fs.writeFileSync(path.join(itemDir, 'item.md'), fm);

      const item = {
        slug, title, source_url: null, domain: null, author: null,
        summary, status: 'active', location: null, added_at: now,
        has_image: false, image_path: null, tags: [],
      };
      await addToIndex(item);
      return jsonResponse(res, 201, item);
    } catch (err) {
      console.error('Text capture error:', err.message);
      return jsonResponse(res, 500, { error: 'Text capture failed' });
    }
  }

  return jsonResponse(res, 400, { error: 'Unknown type: ' + type });
}

async function handleUploadImage(req, res) {
  const buf = await parseBody(req);
  const ct = req.headers['content-type'] || 'image/png';
  const ext = ct.includes('jpeg') || ct.includes('jpg') ? '.jpg'
            : ct.includes('webp') ? '.webp' : '.png';

  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const title = `Image upload — ${dateStr}`;
  const slug = generateSlug(title);
  const itemDir = path.join(ITEMS_DIR, slug);
  fs.mkdirSync(itemDir, { recursive: true });

  const imgName = `og-image${ext}`;
  fs.writeFileSync(path.join(itemDir, imgName), buf);

  const isoNow = now.toISOString();
  const fm = buildFrontmatter({
    title, slug, summary: 'Image pasted from clipboard', now: isoNow,
    og_image: imgName,
  });
  fs.writeFileSync(path.join(itemDir, 'item.md'), fm);

  const item = {
    slug, title, source_url: null, domain: null, author: null,
    summary: 'Image pasted from clipboard', status: 'active',
    location: null, added_at: isoNow,
    has_image: true, image_path: `_items/${slug}/${imgName}`,
    tags: [{ tag: 'image-upload', category: 'format', weight: 0.4 }],
  };
  await addToIndex(item);

  // Trigger vision analysis for smart title + tags
  triggerBackgroundAnalysis(item.slug);

  return jsonResponse(res, 201, item);
}

async function handleCaptureBulk(req, res) {
  const body = await parseBody(req);
  const urls = body.urls || [];
  if (!urls.length) return jsonResponse(res, 400, { error: 'No URLs provided' });

  const batchId = crypto.randomBytes(8).toString('hex');
  activeStreams.set(batchId, { clients: [], items: [] });

  // Process in background, 3 concurrent max
  processBulkCapture(batchId, urls);

  return jsonResponse(res, 202, { batchId, total: urls.length });
}

async function processBulkCapture(batchId, urls) {
  const concurrency = 3;
  let idx = 0;

  async function next() {
    if (idx >= urls.length) return;
    const i = idx++;
    const u = urls[i];
    try {
      const output = await runPython(
        path.join(ROOT, 'scripts', 'analyze.py'),
        ['capture', u]
      );
      const item = JSON.parse(output.trim().split('\n').pop());
      if (!item.is_duplicate) {
        await addToIndex(item);
        triggerBackgroundAnalysis(item.slug);
      }
      sendSSE(batchId, 'item-added', { index: i, item, url: u });
    } catch (err) {
      sendSSE(batchId, 'item-added', { index: i, error: err.message, url: u });
    }
    return next();
  }

  const workers = [];
  for (let w = 0; w < Math.min(concurrency, urls.length); w++) {
    workers.push(next());
  }
  await Promise.all(workers);

  sendSSE(batchId, 'batch-done', { total: urls.length });
  // Clean up after 60s
  setTimeout(() => activeStreams.delete(batchId), 60000);
}

function handleCaptureStream(req, res, query) {
  const batchId = query.batch;
  if (!batchId || !activeStreams.has(batchId)) {
    res.writeHead(404);
    return res.end('Batch not found');
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });
  res.write(':\n\n'); // keepalive

  activeStreams.get(batchId).clients.push(res);
  req.on('close', () => {
    const stream = activeStreams.get(batchId);
    if (stream) stream.clients = stream.clients.filter(c => c !== res);
  });
}

function triggerBackgroundAnalysis(slug) {
  const apiKey = getActiveApiKey();
  if (!apiKey) {
    console.log(`  [analysis] No API key, skipping vision enrichment for ${slug}`);
    return;
  }

  const env = { ANTHROPIC_API_KEY: apiKey };

  // Run vision enrichment
  runPython(
    path.join(ROOT, 'scripts', 'vision_enrich.py'),
    ['enrich-single', slug],
    env
  ).then(output => {
    console.log(`  [analysis] Vision enrichment done for ${slug}`);
    try {
      const result = JSON.parse(output.trim().split('\n').pop());
      if (result.tags || result.title) {
        const updates = {};
        if (result.tags) updates.tags = result.tags;
        if (result.title) updates.title = result.title;
        if (result.needs_review !== undefined) updates.needs_review = result.needs_review;
        updateIndexItem(slug, updates);
      }
    } catch { /* stdout wasn't JSON, that's ok */ }
  }).catch(err => {
    console.log(`  [analysis] Vision enrichment failed for ${slug}: ${err.message}`);
  });
}

async function handleAnalyze(req, res) {
  const body = await parseBody(req);
  const { slug } = body;
  if (!slug) return jsonResponse(res, 400, { error: 'Missing slug' });

  triggerBackgroundAnalysis(slug);
  return jsonResponse(res, 202, { status: 'analysis-started', slug });
}

async function handleReview(req, res) {
  const body = await parseBody(req);
  const { slug, why_saved, what_works } = body;
  if (!slug) return jsonResponse(res, 400, { error: 'Missing slug' });

  const itemDir = path.join(ITEMS_DIR, slug);
  const itemMd = path.join(itemDir, 'item.md');
  if (!fs.existsSync(itemMd)) return jsonResponse(res, 404, { error: 'Item not found' });

  let content = fs.readFileSync(itemMd, 'utf8');

  // Add intent tags from why_saved
  const newTags = [];
  if (why_saved && why_saved.length > 0) {
    for (const intent of why_saved) {
      const tagLine = `  - { tag: "${intent}", category: "intent", weight: 0.9 }`;
      newTags.push(tagLine);
    }
  }

  if (newTags.length > 0) {
    // Insert after last tag line
    const lines = content.split('\n');
    let lastTagIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim().startsWith('- { tag:')) lastTagIdx = i;
    }
    if (lastTagIdx >= 0) {
      lines.splice(lastTagIdx + 1, 0, ...newTags);
      content = lines.join('\n');
    }
  }

  // Add what_works as a note
  if (what_works && what_works.trim()) {
    content += `\n\n## What Makes It Work\n${what_works.trim()}\n`;
  }

  // Remove needs_review flag
  content = content.replace(/needs_review:\s*true/, 'needs_review: false');

  fs.writeFileSync(itemMd, content);

  // Update index
  const intentTags = (why_saved || []).map(w => ({ tag: w, category: 'intent', weight: 0.9 }));
  await updateIndexItem(slug, { needs_review: false, tags_append: intentTags });

  return jsonResponse(res, 200, { status: 'reviewed', slug });
}

function handleConfig(req, res, method) {
  if (method === 'GET') {
    const config = loadConfig();
    // Mask keys for frontend
    const masked = { ...config, profiles: {} };
    for (const [name, profile] of Object.entries(config.profiles)) {
      masked.profiles[name] = {
        label: profile.label,
        key_preview: profile.key ? '...' + profile.key.slice(-4) : '',
        has_key: !!profile.key,
      };
    }
    return jsonResponse(res, 200, masked);
  }
  // PUT
  return parseBody(req).then(body => {
    const config = loadConfig();
    const { profile, key, label } = body;
    if (!profile || !key) return jsonResponse(res, 400, { error: 'Missing profile or key' });
    config.profiles[profile] = { key, label: label || profile };
    if (!config.active_profile) config.active_profile = profile;
    saveConfig(config);
    return jsonResponse(res, 200, { status: 'saved', active: config.active_profile });
  });
}

// --- Helpers ---
function generateSlug(title) {
  let slug = (title || 'untitled').toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 50);
  const hash = crypto.createHash('md5').update(title + Date.now()).digest('hex').slice(0, 6);
  return `${slug}-${hash}`;
}

function buildFrontmatter({ title, slug, summary, now, og_image, source_url, domain }) {
  return `---
title: "${(title || '').replace(/"/g, "'")}"
source_url: ${source_url ? `"${source_url}"` : 'null'}
slug: "${slug}"
domain: ${domain ? `"${domain}"` : 'null'}
author: null
summary: "${(summary || '').replace(/"/g, "'").slice(0, 200)}"
og_image: ${og_image ? `"${og_image}"` : 'null'}
status: active
link_last_checked: "${(now || new Date().toISOString()).slice(0, 10)}"
location: null
added_at: "${now || new Date().toISOString()}"
analyzed_at: null
needs_review: true

tags:
  - { tag: "${source_url ? 'website' : 'text-note'}", category: "format", weight: 0.4 }
---

## Summary
${summary || ''}
`;
}

// --- Static file serving ---
function serveStatic(req, res, pathname) {
  let fp = path.join(ROOT, pathname);
  if (fp.endsWith('/') || pathname === '/') fp = path.join(ROOT, 'index.html');

  fs.stat(fp, (err, stats) => {
    if (err) {
      res.writeHead(404);
      return res.end('Not found');
    }
    if (stats.isDirectory()) fp = path.join(fp, 'index.html');
    const ext = path.extname(fp);
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    fs.createReadStream(fp).pipe(res);
  });
}

// --- Router ---
const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;
  const method = req.method;

  // CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    return res.end();
  }

  try {
    // API routes
    if (pathname === '/api/capture' && method === 'POST') return handleCapture(req, res);
    if (pathname === '/api/upload-image' && method === 'POST') return handleUploadImage(req, res);
    if (pathname === '/api/capture-bulk' && method === 'POST') return handleCaptureBulk(req, res);
    if (pathname === '/api/capture-stream' && method === 'GET') return handleCaptureStream(req, res, parsed.query);
    if (pathname === '/api/analyze' && method === 'POST') return handleAnalyze(req, res);
    if (pathname === '/api/review' && method === 'POST') return handleReview(req, res);
    if (pathname === '/api/config' && (method === 'GET' || method === 'PUT')) return handleConfig(req, res, method);

    // Static files
    serveStatic(req, res, pathname);
  } catch (err) {
    console.error('Server error:', err);
    jsonResponse(res, 500, { error: 'Internal server error' });
  }
});

server.listen(PORT, () => {
  console.log(`KB server running on http://localhost:${PORT}`);
});
