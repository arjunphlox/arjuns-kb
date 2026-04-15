#!/usr/bin/env node

/**
 * migrate.js — One-time migration: filesystem → Supabase
 *
 * Reads index.json + _items/{slug}/item.md files, uploads images to
 * Supabase Storage, and inserts item rows into the items table.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... USER_ID=... node scripts/migrate.js
 *
 * Options:
 *   --dry-run     Print what would happen, don't write anything
 *   --batch-size  Items per upsert batch (default: 50)
 *   --dir         Path to Stello root (default: cwd)
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// --- Config ---
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const batchSize = (() => {
  const idx = args.indexOf('--batch-size');
  return idx !== -1 ? parseInt(args[idx + 1], 10) : 50;
})();
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
const BUCKET = 'item-images';

// --- Helpers ---

/** Extract markdown body from item.md (strip YAML frontmatter) */
function extractBody(raw) {
  const match = raw.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/);
  return match ? match[1].trim() : raw.trim();
}

/** Detect image extension from filename */
function imageExt(filename) {
  const m = filename.match(/\.(png|jpg|jpeg|gif|webp|svg)$/i);
  return m ? m[0].toLowerCase() : null;
}

/** Find the OG image file in an item directory */
function findImage(itemDir) {
  try {
    const files = fs.readdirSync(itemDir);
    const img = files.find(f => f.startsWith('og-image'));
    if (img) {
      const ext = imageExt(img);
      if (ext) return { file: img, ext };
    }
  } catch { /* directory might not exist */ }
  return null;
}

/** Sleep helper for rate limiting */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// --- Main ---

async function migrate() {
  console.log(`Stello Migration — filesystem → Supabase`);
  console.log(`Root: ${rootDir}`);
  console.log(`User: ${USER_ID}`);
  console.log(`Batch size: ${batchSize}`);
  if (dryRun) console.log('** DRY RUN — no writes **\n');

  // Load index.json
  const indexPath = path.join(rootDir, 'index.json');
  if (!fs.existsSync(indexPath)) {
    console.error(`index.json not found at ${indexPath}`);
    process.exit(1);
  }
  const { items } = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  console.log(`Found ${items.length} items in index.json\n`);

  let uploaded = 0;
  let skippedImages = 0;
  let errors = 0;
  let inserted = 0;

  // Process in batches
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const rows = [];

    for (const item of batch) {
      const itemDir = path.join(rootDir, '_items', item.slug);

      // Read body markdown
      let bodyMarkdown = null;
      const mdPath = path.join(itemDir, 'item.md');
      if (fs.existsSync(mdPath)) {
        const raw = fs.readFileSync(mdPath, 'utf8');
        bodyMarkdown = extractBody(raw);
      }

      // Upload image to Supabase Storage
      let ogImagePath = null;
      const img = findImage(itemDir);
      if (img && !dryRun) {
        const storagePath = `${USER_ID}/${item.slug}/og-image${img.ext}`;
        const buffer = fs.readFileSync(path.join(itemDir, img.file));

        const { error: uploadErr } = await supabase.storage
          .from(BUCKET)
          .upload(storagePath, buffer, {
            contentType: `image/${img.ext.replace('.', '')}`,
            upsert: true,
          });

        if (uploadErr) {
          // If already exists, that's fine (idempotent)
          if (!uploadErr.message.includes('already exists')) {
            console.error(`  Image upload error for ${item.slug}: ${uploadErr.message}`);
            errors++;
          }
        } else {
          uploaded++;
        }

        // Get public URL regardless
        const { data: urlData } = supabase.storage
          .from(BUCKET)
          .getPublicUrl(storagePath);
        ogImagePath = urlData?.publicUrl || null;
      } else if (img && dryRun) {
        uploaded++;
        ogImagePath = `[dry-run] ${USER_ID}/${item.slug}/og-image${img.ext}`;
      } else {
        skippedImages++;
      }

      rows.push({
        user_id: USER_ID,
        slug: item.slug,
        title: item.title || '',
        source_url: item.source_url || null,
        domain: item.domain || null,
        author: item.author || null,
        summary: item.summary || null,
        body_markdown: bodyMarkdown,
        og_image_path: ogImagePath,
        status: item.status || 'active',
        location: item.location || null,
        needs_review: item.needs_review ?? false,
        added_at: item.added_at || new Date().toISOString(),
        analyzed_at: item.analyzed_at || null,
        tags: item.tags || [],
      });
    }

    // Upsert batch
    if (!dryRun) {
      const { error } = await supabase
        .from('items')
        .upsert(rows, { onConflict: 'user_id,slug' });

      if (error) {
        console.error(`  Batch upsert error (items ${i}-${i + batch.length}): ${error.message}`);
        errors += batch.length;
      } else {
        inserted += rows.length;
      }
    } else {
      inserted += rows.length;
    }

    const pct = Math.round(((i + batch.length) / items.length) * 100);
    process.stdout.write(`\r  Progress: ${i + batch.length}/${items.length} (${pct}%)`);

    // Small delay between batches to avoid rate limits
    if (!dryRun && i + batchSize < items.length) {
      await sleep(100);
    }
  }

  console.log('\n');
  console.log('--- Migration Complete ---');
  console.log(`  Items processed: ${inserted}`);
  console.log(`  Images uploaded: ${uploaded}`);
  console.log(`  Items without images: ${skippedImages}`);
  if (errors > 0) console.log(`  Errors: ${errors}`);
  if (dryRun) console.log('  (dry run — nothing was written)');

  // Verify count
  if (!dryRun) {
    const { count } = await supabase
      .from('items')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', USER_ID);
    console.log(`\n  Supabase item count: ${count}`);
    if (count === items.length) {
      console.log('  Counts match — migration verified.');
    } else {
      console.log(`  WARNING: Expected ${items.length}, got ${count}. Check errors above.`);
    }
  }
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
