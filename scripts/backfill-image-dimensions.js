#!/usr/bin/env node

/**
 * backfill-image-dimensions.js
 *
 * One-time maintenance: walk every items row whose images[] entries are
 * missing width/height, fetch each image, sniff dimensions with sharp,
 * and update the row. After this runs, every card has explicit
 * width/height on its <img>, eliminating the column-count reflow that
 * can otherwise visually fragment cards across columns when the image
 * lands at its natural aspect-ratio instead of the OG-default fallback.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/backfill-image-dimensions.js
 *
 * Add --dry-run to log what would change without writing.
 */

const { createClient } = require('@supabase/supabase-js');
const sharp = require('sharp');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DRY_RUN = process.argv.includes('--dry-run');

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Required env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_KEY);

async function sniffDimensions(url) {
  const resp = await fetch(url);
  if (!resp.ok) return null;
  const buf = Buffer.from(await resp.arrayBuffer());
  if (buf.length < 100) return null;
  const meta = await sharp(buf, { failOnError: false }).metadata();
  if (!meta.width || !meta.height) return null;
  return { width: meta.width, height: meta.height };
}

function parseImages(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  try { return JSON.parse(value); } catch { return []; }
}

async function main() {
  console.log(`[backfill] dry-run=${DRY_RUN}`);

  const PAGE = 500;
  let from = 0;
  let scanned = 0;
  let updated = 0;
  let skipped = 0;
  let imageFetchFailed = 0;

  // Pull rows in pages so we don't load the entire table into memory.
  for (;;) {
    const { data, error } = await admin
      .from('items')
      .select('id, slug, images, og_image_path')
      .order('added_at', { ascending: false })
      .range(from, from + PAGE - 1);

    if (error) {
      console.error('[backfill] query failed:', error.message);
      process.exit(1);
    }
    if (!data || data.length === 0) break;

    for (const row of data) {
      scanned++;
      let images = parseImages(row.images);

      // Seed images[] from og_image_path so we can attach dimensions to
      // a real entry. Mirrors the seeding step in api/item-update.js.
      if (images.length === 0 && row.og_image_path) {
        images = [{ path: row.og_image_path, source: 'og', is_primary: true }];
      }

      const needsBackfill = images.some(i => i && i.path && (!i.width || !i.height));
      if (!needsBackfill) { skipped++; continue; }

      let dirty = false;
      for (const entry of images) {
        if (!entry || !entry.path) continue;
        if (entry.width && entry.height) continue;
        try {
          const dims = await sniffDimensions(entry.path);
          if (!dims) { imageFetchFailed++; continue; }
          entry.width = dims.width;
          entry.height = dims.height;
          dirty = true;
        } catch (err) {
          imageFetchFailed++;
        }
      }

      if (!dirty) continue;
      if (DRY_RUN) {
        console.log(`[backfill] would update ${row.slug}: ${images.length} entries`);
      } else {
        const { error: upErr } = await admin
          .from('items')
          .update({ images: JSON.stringify(images) })
          .eq('id', row.id);
        if (upErr) {
          console.warn(`[backfill] update failed for ${row.slug}:`, upErr.message);
          continue;
        }
      }
      updated++;
      if (updated % 25 === 0) console.log(`[backfill] progress: ${updated} rows updated (${scanned} scanned)`);
    }

    if (data.length < PAGE) break;
    from += PAGE;
  }

  console.log(`[backfill] done. scanned=${scanned} updated=${updated} skipped=${skipped} imageFetchFailed=${imageFetchFailed}`);
}

main().catch(err => {
  console.error('[backfill] fatal:', err);
  process.exit(1);
});
