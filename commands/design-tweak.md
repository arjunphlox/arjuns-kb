---
description: Apply a design change through the Tessor token system — classifies, reads current state, edits code, verifies via preview
---

Apply a design tweak to this project through the Tessor design token system.

1. **Understand the request** — what design change do I want? (color, spacing, typography, layout, animation, border, shadow, etc.)

2. **Classify the change** into one of three paths:

   **Path A — Panel-configurable** (the tweak is just a token value change that the Tessor admin panel already exposes):
   → Tell me: "This is adjustable via the admin panel → [Tab name] → [Control name]." Only proceed with code if I explicitly want a code change instead.

   **Path B — Token-level code change** (changing a CSS custom property value that the panel doesn't expose, or setting a new default):
   → Read current token values → edit the property → verify via preview.

   **Path C — Structural change** (new token, new CSS rule, new component style, responsive behavior, animation):
   → Plan the change first → follow the project's data-driven pattern → implement → verify.

3. **Read current state** before changing anything:
   - Site tokens: `src/site/site.css` (`--site-*` prefixed)
   - Tessor tokens: `src/styles/tokens.css` (`--t-*` prefixed)
   - Component styles: the specific component file if the tweak is component-scoped
   - SitePanel config: `src/site/SitePanel.tsx` if adding a new configurable control

   Show me the current values that will change.

4. **Apply the change** following these rules:
   - **Colors must be hex** — DynamicColorControl only accepts hex, never rgba. Convert if needed.
   - **Data-driven pattern for SitePanel** — if adding a new control to the admin panel, use `ColorTokenDef[]` / `NumericTokenDef[]` arrays and render via `renderColorGroup()` / `renderNumericGroup()` with `chunk(tokens, 3)`.
   - **Respect sync boundaries** — if the file is in the "Synced 1:1" list in CLAUDE.md's Tessor Sync section, STOP and warn me. Changes to synced files should go through Tessor source, not the consuming project.
   - **Initial values from live CSS** — read via `getComputedStyle`, not from SiteConfig defaults (which may be stale in localStorage).

5. **Verify** — take a preview screenshot of the affected page(s). If making a visual change, show before and after states.

6. **Commit** — if the change looks good, commit as a small atomic change with a clear message.
