# Backlog — Stello

## Ready to Execute

| Task | Platform | Model | Status |
|---|---|---|---|
| **Visual card variants** — visually distinguish cards by content type (typefaces, products, articles, tools) using `domain` tag; subtle border/accent/icon differences per type | Desktop | Opus | Open |
| **Add new item from app** — URL input in UI, local Python server to fetch metadata + analyze + save to `_items/`; needs `scripts/serve.py` with Flask | Desktop | Opus | Open |
| **Tag-based "more like this"** — dedicated panel showing related items for a selected item; relatedness index already exists, just needs UI | Desktop | Opus | Open |
| **User notes on items** — editable text field on detail page, saved back to item.md; needs local server | Desktop | Opus | Open |

## Needs Planning

| Task | Platform | Model | Status |
|---|---|---|---|
| **Personal authentication/login** — auth system for Stello; needs architecture decision: local-only vs cloud, session management, credential storage | Either | Opus | Open |
| **New user account and onboarding** — first-run experience, account creation flow, initial content setup; depends on auth system | Either | Opus | Open |
| **Integrating Tessor configuration panel** — bring Tessor design tokens/config UI into Stello; depends on Tessor project state | Desktop | Opus | Open |
| **Semantic search** — embeddings + vector search for fuzzy retrieval; needs architecture decision: client-side vs server-side, which embedding model | Either | Opus | Open |
| **Smart ranking** — boost items by tag weight + retrieval frequency; needs click tracking, storage, ranking algorithm | Either | Opus | Open |
| **Progressive automation** — paste URL to fully analyzed item with zero manual steps; end-to-end pipeline | Either | Opus | Open |

## Quick Wins

| Task | Platform | Model | Status |
|---|---|---|---|
| **Review item cards without images** — audit and fix cards with no OG image; improve fallback display or re-fetch images | Web | Sonnet | Done — PR #6 (`/api/reprocess` + login-time backfill drip) |
| **Better tag navigation and management** — improve tag browsing, filtering, bulk editing, and tag cleanup tools | Desktop | Opus | Open |
| **UI bugs & refinements** — collect and fix visual glitches, layout issues, and polish rough edges | Desktop | Sonnet | Open |
| **Finish Supabase legacy-key rotation** — confirm deployed frontend sends `sb_publishable_*` (Network tab, incognito), then disable legacy JWT keys in the dashboard to kill the previously exposed service_role JWT | Web | Sonnet | Open |
| **Port `link_check.py` + `refetch.py` to Supabase** — they currently read the local `_items/` mirror, so results lag real data; should query Supabase directly or at least note "run backup first" | Either | Sonnet | Open |
| **Extend `verify-supabase.js` to test storage upload as a user** — today it only checks bucket existence, so missing INSERT/UPDATE RLS policies (the root cause of the Week 16 image misses) pass silently. Could sign in as a test account and attempt a 1-byte upload/delete | Either | Sonnet | Open |
| **Update `.claude/launch.json` to use `vercel dev`** — currently points to the retired `node server.js`; once the current preview process dies, `preview_start` will fail | Desktop | Sonnet | Done — PR #6 (points at `scripts/local-dev.js` instead; `vercel dev` requires a Vercel login, not great for fresh clones) |

## Maintenance (run periodically via Claude Code)

| Task | Platform | Model | Status |
|---|---|---|---|
| **Link check** — `python3 scripts/link_check.py run` (every 7 days; reads local `_items/` backup mirror) | Either | Sonnet | Open |
| **Refetch images** — `python3 scripts/refetch.py run` for items without images (reads local `_items/` backup mirror) | Either | Sonnet | Open |
| **Verify Supabase setup** — `node scripts/verify-supabase.js` after any schema change or key rotation | Either | Sonnet | Open |

---

## Worktree Guide

Use a worktree session when the work is **experimental, risky, or parallel-safe**. Use main when it's **sequential, small, or maintenance**.

| Task | Worktree? | Why |
|---|---|---|
| Visual card variants | No | Sequential UI feature, builds on main |
| Tag-based "more like this" | No | Builds on existing relatedIndex in app.js |
| User notes on items | No | Small, contained server + UI change |
| Reviewing cards without images | No | Audit + fixes, low risk |
| Better tag navigation | No | Incremental UI improvement |
| UI bugs & refinements | No | Small targeted fixes |
| Personal auth/login | **Yes** | Adds auth layer across server + frontend, may need iteration, easy to discard if approach changes |
| New user account & onboarding | **Yes** | Depends on auth, large scope, experimental UX flows |
| Tessor config panel integration | **Yes** | Sweeping CSS/component changes, may conflict with UI work on main |
| Semantic search | **Yes** | High uncertainty — embeddings, vector store, new search UI. Prototype in isolation |
| Smart ranking | **Yes** | Needs click tracking infra, algorithm tuning. Experimental |
| Progressive automation | No | Pipeline work, extends existing scripts on main |
| Dark mode / theme system | **Yes** | Broad CSS changes, develop in isolation |
| Performance overhaul | **Yes** | Virtual scrolling, lazy loading — experimental, needs benchmarking |
