---
description: Save session context as structured reference files in the repo
---

Capture substantive context from this session into structured markdown files:

1. **Scan the session** — review the full conversation and identify blocks where I provided detailed context, explanations, rationale, specs, or background information. Ignore one-liners, yes/no answers, and casual chat — only capture substantive input (roughly 3+ sentences or structured information like lists, specs, requirements).

2. **Group by topic** — cluster the captured context into distinct topics or aspects. Each topic becomes one file. Keep the number of files minimal but modular — if I gave context about two different things (e.g., auth flow + deployment strategy), those are two files, not one. If I gave context about the same thing across multiple messages, consolidate into one file.

3. **Write reference files** — create the `references/` directory in the repo root if it doesn't exist. For each topic, write a markdown file:
   - **Filename**: lowercase, hyphenated, descriptive — e.g., `references/auth-flow-rationale.md`, `references/api-design-constraints.md`
   - **Format**:
     ```markdown
     # [Descriptive Title]

     > Captured from session on [YYYY-MM-DD]

     [Structured content — preserve the substance of what I said, reorganized for clarity. Use headings, lists, or paragraphs as appropriate. This is a reference document, not a transcript — distill and structure, don't copy-paste chat messages verbatim.]
     ```
   - Keep the original meaning and detail intact — don't summarize away specifics
   - If I provided examples, code snippets, or data, include them

4. **Check for duplicates** — before writing, check if `references/` already has files covering the same topic. If so, update the existing file rather than creating a new one. Add a new date-stamped section if the new context extends or revises the original.

5. **Report** — show me:
   - List of files created or updated (with one-line description of each)
   - Count of context blocks captured vs skipped (and why skipped)
   - Confirmation that `references/` is ready to commit

If the session has no substantive context to capture (e.g., purely a coding session with no background provided), say so and skip — don't create empty files.
