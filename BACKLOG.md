# Backlog

## Stello

### Ready to execute
- [ ] **Visual card variants** — Visually distinguish cards by content type (typefaces, products, articles, tools). Use `domain` tag to determine type. Subtle border/accent/icon differences per type.
- [ ] **Add new item from app** — URL input in the UI, local Python server to fetch metadata + analyze + save to `_items/`. Needs `scripts/serve.py` with Flask.
- [ ] **Tag-based "more like this"** — Dedicated panel showing related items for a selected item. Relatedness index already exists, just needs UI.
- [ ] **User notes on items** — Editable text field on detail page, saved back to item.md. Needs local server.

### Needs planning
- [ ] **Personal authentication/login** — Auth system for Stello. Needs architecture decision: local-only vs cloud, session management, credential storage.
- [ ] **New user account and onboarding** — First-run experience, account creation flow, initial content setup. Depends on auth system.
- [ ] **Integrating Tessor configuration panel** — Bring Tessor design tokens/config UI into Stello. Depends on Tessor project state.
- [ ] **Semantic search** — Embeddings + vector search for fuzzy retrieval. Needs architecture decision: client-side vs server-side, which embedding model.
- [ ] **Smart ranking** — Boost items by tag weight + retrieval frequency. Needs click tracking, storage, ranking algorithm.
- [ ] **Progressive automation** — Paste URL → fully analyzed item with zero manual steps. End-to-end pipeline.

### Quick wins
- [ ] **Reviewing item cards without images** — Audit and fix cards that have no OG image. Improve fallback display or re-fetch images.
- [ ] **Better tag navigation and management** — Improve tag browsing, filtering, bulk editing, and tag cleanup tools.
- [ ] **UI bugs & refinements** — Collect and fix visual glitches, layout issues, and polish rough edges.

### Maintenance (run periodically via Claude Code)
- [ ] `python3 scripts/link_check.py run` — check for dead links (every 7 days)
- [ ] `python3 scripts/refetch.py run` — retry image fetching for items without images
- [ ] `python3 scripts/vision_enrich.py run` — enrich new items with color/style/mood tags

---

## Worktree guide

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

