---
description: One-way sync of Tessor design system files from source repo to current project
---

Sync Tessor design system files from the source repo to this project.

**Source:** `~/Documents/HueGrid/Tessor/`
**Target:** Current working directory

1. **Read the sync list** — find the "Tessor Sync" section in this project's CLAUDE.md. It defines three categories:
   - **Synced 1:1** — must match source exactly
   - **Partially synced** — only specific parts should match (e.g., token values but not project-specific additions)
   - **Not synced** — project-specific, never overwrite from source

   If no "Tessor Sync" section exists, stop and tell me this project doesn't have a Tessor sync list configured.

2. **Diff each 1:1 synced file** — for every file in the synced list, run a diff between source and target. Build a summary table:

   | File | Status | Lines changed |
   |------|--------|---------------|

   Status values: `identical`, `source newer`, `target newer`, `missing in source`, `missing in target`

3. **Show the table** and wait for my confirmation before copying anything.

4. **Copy confirmed files** — for 1:1 synced files, copy source → target directly.

   For **partially synced** files: show me the diff side-by-side and ask which hunks to take. Never blindly overwrite project-specific sections (like custom breakpoint variants or project-only imports).

5. **Verify** — run `npm run build` to confirm nothing broke. If it fails, show the error and help fix it.

6. **Report** — one-line summary: "Synced N files from Tessor. Build passes."

**Rules:**
- This is a ONE-WAY sync: source → target. Never modify files in `~/Documents/HueGrid/Tessor/`.
- If a target file has local changes not in source, warn me before overwriting.
- If source has changes that look like they'd break the target project, flag them.
