# Backlog

Plan features in Claude Chat (mobile), execute in Claude Code (desktop).
GitHub is the source of truth for all projects.

## Workflow

1. **Plan** (Claude Chat, mobile) — brainstorm, spec, design. Reference repo via GitHub URL.
   End each Chat session with a ready-to-execute prompt for Claude Code.
2. **Execute** (Claude Code, desktop) — paste the prompt, implement, test, commit, push.
3. **Review** (either) — check the live site, note issues, add to backlog.

---

## Arjun's KB

### Ready to execute
- [ ] **Visual card variants** — Visually distinguish cards by content type (typefaces, products, articles, tools). Use `domain` tag to determine type. Subtle border/accent/icon differences per type.
- [ ] **Add new item from app** — URL input in the UI, local Python server to fetch metadata + analyze + save to `_items/`. Needs `scripts/serve.py` with Flask.
- [ ] **Tag-based "more like this"** — Dedicated panel showing related items for a selected item. Relatedness index already exists, just needs UI.
- [ ] **User notes on items** — Editable text field on detail page, saved back to item.md. Needs local server.

### Needs planning (do in Claude Chat first)
- [ ] **Semantic search** — Embeddings + vector search for fuzzy retrieval. Needs architecture decision: client-side vs server-side, which embedding model.
- [ ] **Smart ranking** — Boost items by tag weight + retrieval frequency. Needs click tracking, storage, ranking algorithm.
- [ ] **Progressive automation** — Paste URL → fully analyzed item with zero manual steps. End-to-end pipeline.

### Maintenance (run periodically via Claude Code)
- [ ] `python3 scripts/link_check.py run` — check for dead links (every 7 days)
- [ ] `python3 scripts/refetch.py run` — retry image fetching for items without images
- [ ] `python3 scripts/vision_enrich.py run` — enrich new items with color/style/mood tags

---

## Other Projects (to import from Replit)

_Add projects here as you migrate them. For each, note:_
- [ ] **Project name** — one-line description. Replit URL: `...` → GitHub repo: `...`

---

## How to use this file

**From Claude Chat (mobile):**
> "I want to plan the visual card variants feature for arjuns-kb.
> Here's the repo: github.com/arjunphlox/arjuns-kb
> Here's the backlog item: [paste the item]
> Give me a ready-to-execute prompt for Claude Code."

**From Claude Code (desktop):**
> Paste the prompt from Chat. Claude Code has full local context and executes it.

**After completing a task:**
> Check it off in this file, commit, push.
