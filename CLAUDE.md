# Stello

Personal knowledge base — a rich item analysis and discovery tool with weighted tags, masonry grid UI, and content organization.

## Dev Commands

- `./serve.sh` or `python3 -m http.server 8080` — static file server for browsing
- `node server.js` — full API server (static files + item capture/analysis endpoints, port 8080)
- `python3 scripts/analyze.py` — analyze items
- `python3 scripts/enrich.py` — enrich item metadata

## Architecture

Vanilla HTML/CSS/JS frontend served by a Node.js API server (`server.js`). No build step, no framework.

- **Frontend**: `index.html` (masonry grid), `detail.html` (item detail view), `app.js` (all client logic), `style.css`
- **Server**: `server.js` — Node.js HTTP server with API endpoints for item import, analysis, and config. Spawns Python scripts for OG fetching and vision enrichment.
- **Data**: Items stored as markdown files in `_items/` (~3300 items). Master index in `index.json`.
- **Config**: `config.json` (gitignored) — stores API key profiles for Anthropic Claude.

## Key Files

| File | Purpose |
|---|---|
| `index.html` | Main grid view with search, tag filtering, import modal |
| `detail.html` | Item detail page |
| `app.js` | All frontend logic — filtering, masonry layout, tag system, related items index |
| `style.css` | All styles |
| `server.js` | Node.js API server — static serving, item CRUD, Python script orchestration |
| `index.json` | Master item index (generated, ~5MB) |
| `config.json` | API key config (gitignored) |
| `serve.sh` | Simple static server shortcut |

## Tag System

Items have weighted tags across categories: `format`, `domain`, `style`, `subject`, `tool`, `location`, `mood`, `color`. The app builds a `relatedIndex` mapping each item to related items by shared tags.

## Content Structure

Items stored as markdown files in `_items/` directory with YAML frontmatter metadata. Indexed in `index.json`. Topic collections also exist as top-level `.md` files and directories (e.g., `Figma.md`, `Typography/`).

## Maintenance Scripts

- `python3 scripts/link_check.py run` — check for dead links (every 7 days)
- `python3 scripts/refetch.py run` — retry image fetching for items without images
- `python3 scripts/vision_enrich.py run` — enrich new items with color/style/mood tags

## Active Work
- [ ] (no active tasks — check BACKLOG.md for priorities)

## Decisions Log
- 2026-04-16 · Side-panel comparison UI replaces inline card expansion · supports A/B discovery without blocking grid, persists via URL + localStorage
- 2026-04-16 · Masonry uses CSS `column-count` (not grid/flex) · keeps natural aspect ratios; documented downside: no row gap, cards use margin-bottom
- 2026-04-16 · 3-panel layout defaults to equal viewport/4 split, `state.userResized` flags preserve manual drags · so auto-rebalancing doesn't fight the user
- 2026-04-16 · Header alignment via `text-box-trim: trim-both cap alphabetic` · lets `align-items: flex-end` line the h1 baseline up with the icon buttons
- 2026-04-16 · Container query on `.header` (not viewport media) · header stacks based on its own width, correctly responds to 3-panel squeeze
- 2026-04-16 · Layout margins replaced with padding/flex-gap as a broad rule · exceptions flagged: CSS column-count row spacing, markdown prose, `* { margin: 0 }` reset, sr-only `-1px`
- 2026-04-16 · Phosphor icons inlined as JS string constants (not font/CDN) · zero runtime deps, fully color-controllable via currentColor
- 2026-04-16 · Whole week-title bar is the click target (caret decorative) · lower-precision tap, ARIA role=button + keyboard support
- 2026-04-16 · Radix Colors via copied CSS values (not CDN/npm) · zero deps, works without build step, self-contained
- 2026-04-16 · `--accent-contrast` hardcoded per accent (not `var(--{color}-12)`) · step-12 flips in dark mode, but accent-9 is always bright for Lime/Amber — needs fixed dark text
- 2026-04-16 · Header + expanded week bar use `--accent` as background · accent color drives the app identity, not just buttons/links
- 2026-04-16 · Card highlights use `outline` with 4px offset (not opacity dimming) · accent border is visible without reducing card readability
- 2026-04-16 · Theme stored as `stello.theme` in localStorage (`{mode, accent}`) · trivially syncable to server when auth lands
