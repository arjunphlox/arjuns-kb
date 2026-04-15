#!/usr/bin/env node

/**
 * sync-local.js — Download items from Supabase to local _items/ format
 *
 * Pulls items updated since last sync, writes item.md files with YAML
 * frontmatter, downloads images, and rebuilds index.json.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... USER_ID=... node scripts/sync-local.js
 *
 * Options:
 *   --dir         Path to Stello root (default: cwd)
 *   --full        Ignore last sync timestamp, re-download everything
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { createClient } = require('@supabase/supabase-js');

// --- Config ---
const args = process.argv.slice(2);
const fullSync = args.includes('--full');
const rootDir = (() => {
  const idx = args.indexOf('--dir');
  return idx !== -1 ? path.resolve(args[idx + 1]) : process.cwd();
})();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const USER_ID = process.env.USER_ID;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !USER_ID) {
  console.error('Required env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, USER_ID');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const SYNC_FILE = path.join(rootDir, '.stello-sync');
const ITEMS_DIR = path.join(rootDir, '_items');

// --- Helpers ---

/** Format a tag object as YAML inline */
function tagToYaml(t) {
  return `  - { tag: "${t.tag}", category: "${t.category}", weight: ${t.weight} }`;
}

/** Build YAML frontmatter + body for an item */
function buildItemMd(item) {
  const fm = [
    '---',
    `title: ${JSON.stringify(item.title || '')}`,
    `source_url: ${JSON.stringify(item.source_url || '')}`,
    `slug: "${item.slug}"`,
    `domain: ${JSON.stringify(item.domain || '')}`,
    `author: ${item.author ? JSON.stringify(item.author) : 'null'}`,
    `summary: ${JSON.stringify(item.summary || '')}`,
    `og_image: ${item.og_image_path ? '"og-image' + extFromUrl(item.og_image_path) + '"' : 'null'}`,
    `status: ${item.status || 'active'}`,
    `link_last_checked: ${item.link_last_checked ? `"${item.link_last_checked}"` : 'null'}`,
    `location: ${item.location ? JSON.stringify(item.location) : 'null'}`,
    `added_at: "${item.added_at}"`,
    `analyzed_at: ${item.analyzed_at ? `"${item.analyzed_at}"` : 'null'}`,
    '',
    'tags:',
    ...((item.tags || []).map(tagToYaml)),
    '---',
  ];

  let body = '';
  if (item.body_markdown) {
    body = '\n' + item.body_markdown;
  }

  return fm.join('\n') + body + '\n';
}

/** Extract file extension from a URL or path */
function extFromUrl(url) {
  if (!url) return '.png';
  const m = url.match(/\.(png|jpg|jpeg|gif|webp|svg)(?:\?|$)/i);
  return m ? '.' + m[1].toLowerCase() : '.png';
}

/** Download a file from URL, returns Buffer or null */
function downloadFile(url) {
  return new Promise((resolve) => {
    const mod = url.startsWith('https') ? https : http;
    mod.get(url, { timeout: 15000 }, (res) => {
      if (res.statusCode !== 200) {
        resolve(null);
        return;
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', () => resolve(null));
    }).on('error', () => resolve(null));
  });
}

/** Build index.json entry from a Supabase item row */
function itemToIndex(item) {
  const ext = extFromUrl(item.og_image_path);
  return {
    slug: item.slug,
    title: item.title || '',
    source_url: item.source_url || null,
    domain: item.domain || null,
    author: item.author || null,
    summary: item.summary || null,
    status: item.status || 'active',
    location: item.location || null,
    added_at: item.added_at,
    has_image: !!item.og_image_path,
    image_path: item.og_image_path ? `_items/${item.slug}/og-image${ext}` : null,
    tags: item.tags || [],
    needs_review: item.needs_review || false,
  };
}

// --- Main ---

async function sync() {
  console.log('Stello Sync — Supabase → local');
  console.log(`Root: ${rootDir}`);
  if (fullSync) console.log('Mode: full sync');

  // Read last sync timestamp
  let lastSync = null;
  if (!fullSync && fs.existsSync(SYNC_FILE)) {
    lastSync = fs.readFileSync(SYNC_FILE, 'utf8').trim();
    console.log(`Last sync: ${lastSync}`);
  }

  // Query items from Supabase
  let query = supabase
    .from('items')
    .select('*')
    .eq('user_id', USER_ID)
    .order('added_at', { ascending: false });

  if (lastSync) {
    query = query.gt('updated_at', lastSync);
  }

  const { data: items, error } = await query;
  if (error) {
    console.error('Failed to fetch items:', error.message);
    process.exit(1);
  }

  console.log(`Items to sync: ${items.length}\n`);

  if (items.length === 0) {
    console.log('Already up to date.');
    return;
  }

  // Ensure _items directory exists
  if (!fs.existsSync(ITEMS_DIR)) {
    fs.mkdirSync(ITEMS_DIR, { recursive: true });
  }

  let downloaded = 0;
  let written = 0;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const itemDir = path.join(ITEMS_DIR, item.slug);

    // Create item directory
    if (!fs.existsSync(itemDir)) {
      fs.mkdirSync(itemDir, { recursive: true });
    }

    // Write item.md
    const md = buildItemMd(item);
    fs.writeFileSync(path.join(itemDir, 'item.md'), md, 'utf8');
    written++;

    // Download image if it has one and doesn't already exist locally
    if (item.og_image_path) {
      const ext = extFromUrl(item.og_image_path);
      const imgPath = path.join(itemDir, `og-image${ext}`);

      if (!fs.existsSync(imgPath)) {
        const buf = await downloadFile(item.og_image_path);
        if (buf) {
          fs.writeFileSync(imgPath, buf);
          downloaded++;
        }
      }
    }

    const pct = Math.round(((i + 1) / items.length) * 100);
    process.stdout.write(`\r  Progress: ${i + 1}/${items.length} (${pct}%)`);
  }

  console.log('\n');

  // Rebuild index.json from ALL items (full query)
  console.log('Rebuilding index.json...');
  const { data: allItems, error: allErr } = await supabase
    .from('items')
    .select('*')
    .eq('user_id', USER_ID)
    .order('added_at', { ascending: false });

  if (allErr) {
    console.error('Failed to fetch all items for index:', allErr.message);
  } else {
    const index = { items: allItems.map(itemToIndex) };
    fs.writeFileSync(
      path.join(rootDir, 'index.json'),
      JSON.stringify(index, null, 2),
      'utf8'
    );
    console.log(`  index.json written (${allItems.length} items)`);
  }

  // Save sync timestamp
  const now = new Date().toISOString();
  fs.writeFileSync(SYNC_FILE, now, 'utf8');

  console.log('\n--- Sync Complete ---');
  console.log(`  Items written: ${written}`);
  console.log(`  Images downloaded: ${downloaded}`);
  console.log(`  Sync timestamp saved: ${now}`);
}

sync().catch(err => {
  console.error('Sync failed:', err);
  process.exit(1);
});
