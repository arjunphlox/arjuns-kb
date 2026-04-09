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
