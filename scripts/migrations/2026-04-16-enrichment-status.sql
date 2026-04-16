-- Stello migration · 2026-04-16
-- Adds enrichment_status column to track where each item is in the
-- two-phase capture flow (text rules → vision).
--
-- Run this in the Supabase SQL editor against an existing database.
-- Fresh installs pick it up from scripts/schema.sql.

ALTER TABLE items
  ADD COLUMN IF NOT EXISTS enrichment_status TEXT
    DEFAULT 'pending'
    CHECK (enrichment_status IN ('pending', 'text_done', 'vision_done', 'error'));

-- Back-fill existing rows:
--   rows with analyzed_at set → vision_done (enrich.js already ran)
--   rows without analyzed_at  → text_done (they at least have the basic OG tags)
UPDATE items
  SET enrichment_status = CASE
    WHEN analyzed_at IS NOT NULL THEN 'vision_done'
    ELSE 'text_done'
  END
  WHERE enrichment_status = 'pending';

-- Used by the re-enrich-on-login query.
CREATE INDEX IF NOT EXISTS idx_items_user_enrichment
  ON items (user_id, enrichment_status);
