#!/usr/bin/env node

/**
 * verify-supabase.js — sanity-check Stello's Supabase setup
 *
 * Confirms all expected tables exist, that RLS blocks anonymous reads,
 * and that the item-images storage bucket is correctly configured. Uses
 * behavioural checks (try to read as anon) rather than pg_catalog
 * queries because PostgREST doesn't expose system tables.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... SUPABASE_ANON_KEY=... \
 *     node scripts/verify-supabase.js
 *
 * Exits 0 if every check passes, 1 otherwise.
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SERVICE_KEY || !ANON_KEY) {
  console.error('Required env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY');
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_KEY);
const anon = createClient(SUPABASE_URL, ANON_KEY);

const EXPECTED_TABLES = ['profiles', 'items', 'user_settings', 'batch_jobs'];
const BUCKET = 'item-images';

let failures = 0;
const CHECK = '\u2713';
const CROSS = '\u2717';

function pass(msg) { console.log(`  ${CHECK}  ${msg}`); }
function fail(msg) { console.log(`  ${CROSS}  ${msg}`); failures++; }

async function checkTable(name) {
  // Service-role client bypasses RLS — confirms the table exists at all
  const { error: adminErr } = await admin
    .from(name)
    .select('*', { count: 'exact', head: true });
  if (adminErr) {
    fail(`Table "${name}" is missing or inaccessible: ${adminErr.message}`);
    return;
  }
  pass(`Table "${name}" exists`);

  // Anon client (no JWT) should either be blocked by a policy or return
  // zero rows. Returning actual data means RLS is off or misconfigured.
  const { data, error: anonErr } = await anon.from(name).select('*').limit(1);
  if (anonErr) {
    pass(`  RLS blocks anonymous reads on "${name}"`);
    return;
  }
  if (!data || data.length === 0) {
    pass(`  Anonymous reads return 0 rows on "${name}" (RLS enforced)`);
  } else {
    fail(`  "${name}" leaked ${data.length} row(s) to the anon client — RLS is missing`);
  }
}

async function checkBucket() {
  const { data: buckets, error } = await admin.storage.listBuckets();
  if (error) {
    fail(`Failed to list storage buckets: ${error.message}`);
    return;
  }
  const b = buckets.find(x => x.name === BUCKET);
  if (!b) {
    fail(`Storage bucket "${BUCKET}" not found`);
    return;
  }
  pass(`Storage bucket "${BUCKET}" exists`);
  if (b.public) {
    pass(`  "${BUCKET}" is public-read`);
  } else {
    fail(`  "${BUCKET}" is not public — item images will 404`);
  }
}

async function main() {
  console.log(`\nVerifying Supabase setup at ${SUPABASE_URL}\n`);

  console.log('Tables + RLS:');
  for (const t of EXPECTED_TABLES) {
    await checkTable(t);
  }

  console.log('\nStorage:');
  await checkBucket();

  console.log('');
  if (failures === 0) {
    console.log('All checks passed.\n');
  } else {
    console.log(`${failures} check(s) failed. Review scripts/schema.sql and re-run it in the Supabase SQL editor, or set the missing bucket policies in the dashboard.\n`);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Verification crashed:', err);
  process.exit(1);
});
