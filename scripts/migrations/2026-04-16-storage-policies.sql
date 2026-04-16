-- Stello migration · 2026-04-16
-- Ensures the storage.objects policies exist for the item-images bucket.
-- The capture / upload-image / reprocess endpoints all write to
-- {user_id}/{slug}/og-image.{ext} — if the INSERT policy is missing, every
-- upload fails with "new row violates row-level security policy".
--
-- Run this in the Supabase SQL editor. Idempotent (drop-then-create).

-- Drop any previous iteration so re-running this file always lands the
-- exact rules below (Supabase policies can't be ALTERed in place).
DROP POLICY IF EXISTS "stello item-images public read"    ON storage.objects;
DROP POLICY IF EXISTS "stello item-images user insert"    ON storage.objects;
DROP POLICY IF EXISTS "stello item-images user update"    ON storage.objects;
DROP POLICY IF EXISTS "stello item-images user delete"    ON storage.objects;

-- Public SELECT — the app renders card thumbnails via getPublicUrl(), which
-- requires unauthenticated read. RLS already scopes writes to the owner.
CREATE POLICY "stello item-images public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'item-images');

-- Users can upload to their own folder only.
-- storage.foldername(name) returns the path segments as a text[]; the first
-- element must match the authenticated user's UUID.
CREATE POLICY "stello item-images user insert"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'item-images'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- UPDATE is needed because every capture path calls upload() with
-- upsert: true — when the file already exists at that path the SDK issues
-- UPDATE, not INSERT. Without this policy upserts silently fail the
-- second-time a slug is re-captured (e.g. by /api/reprocess).
CREATE POLICY "stello item-images user update"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'item-images'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Optional — lets the client delete its own thumbnails (not wired yet,
-- added here so future cleanup code doesn't trip RLS).
CREATE POLICY "stello item-images user delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'item-images'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
