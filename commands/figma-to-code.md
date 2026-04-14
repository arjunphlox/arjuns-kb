---
description: Translate a Figma frame into code using the per-node fidelity methodology
---

Translate a Figma design into code with high visual fidelity.

**Input needed:** A Figma file URL, frame name, or node ID. Ask me if not provided.

**Methodology:** Read and follow `guidelines/FIGMA_TO_CODE.md` in this project. It defines the mandatory 8-step process:

1. **Identify node IDs** for every styled element via `get_metadata`
2. **Pull `get_design_context`** for each node — paste raw output, never paraphrase
3. **Translate line-by-line** — every CSS property must trace to a source line
4. **Build a typography table** from the ground truth
5. **Build a token table** from `get_variable_defs`
6. **Count, don't summarize** — exact item counts for every list/grid
7. **Verify with screenshot diffs** — compare preview screenshot vs `get_screenshot` from Figma. `preview_inspect` is NOT verification.
8. **On pushback, re-pull** `get_design_context` before re-coding — never retry from memory

**Hard rules:**
- No CSS without a `get_design_context` source for that element
- No font assumptions — look up every one
- No "looks right" — only screenshot diffs against Figma count
- Complete the pre-commit checklist in the guideline before committing

If `guidelines/FIGMA_TO_CODE.md` doesn't exist in this project, stop and tell me — this skill requires the full methodology doc.

Read the guideline now, then begin.
