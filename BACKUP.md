# Stello Backups

Supabase is the source of truth for items. `scripts/sync-local.js` mirrors a single user's items into the repo layout (`_items/{slug}/item.md` + `og-image.*`) and rebuilds `index.json`, so a local copy of the data is always a `git`-reachable Postgres outage away.

This mirror is **read-only**. Nothing in the app reads from it, and editing a local `item.md` will be silently overwritten on the next sync.

## Environment variables

All three are required. The service-role key is necessary because RLS would otherwise block a cross-user read — even for your own user id.

| Var | Where to find it |
|---|---|
| `SUPABASE_URL` | Supabase dashboard → Project Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase dashboard → Project Settings → API (keep secret) |
| `USER_ID` | Supabase dashboard → Authentication → Users (copy the `id` of the account you want to back up) |

## Running a backup

```sh
# Incremental (only items changed since last sync)
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... USER_ID=... npm run backup

# Full re-download (ignores .stello-sync timestamp)
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... USER_ID=... npm run backup:full
```

What it produces:
- `_items/{slug}/item.md` — YAML frontmatter (title, source_url, tags, …) plus the stored markdown body
- `_items/{slug}/og-image.{png,jpg,webp,…}` — fetched once, cached on subsequent runs
- `index.json` — regenerated from all of the user's items (not incremental)
- `.stello-sync` — ISO timestamp of the last successful run (gitignored)

## Weekly cron example

```crontab
# Sunday 03:00 — nightly would be fine too, the diff is usually tiny
0 3 * * 0 cd /path/to/stello && SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... USER_ID=... npm run backup >> ~/.stello-backup.log 2>&1
```

Put the env vars in a `~/.stello-backup.env` file and `source` it in a wrapper script if you'd rather not paste secrets into `crontab -e`.

## Verifying the Supabase side

```sh
SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... npm run verify
```

Checks that all expected tables exist, RLS blocks anonymous reads, and the `item-images` storage bucket is public. Run after any schema change or key rotation.
