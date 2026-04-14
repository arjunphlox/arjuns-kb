---
description: Ship session — checks, push, PR, preview, diarize to memory, update docs
---

Wrap up this session and ship the work:

1. **Local checks** — run lint, typecheck, build, and tests if any exist. Fix any issues you find.

2. **Final review** — show the full branch diff against main and summarize the change in 3-5 bullet points.

3. **Push and PR** — push the branch and create a pull request using `gh pr create`. Title should be clear and concise. Description should cover: what changed, why, and how to test.

4. **Preview** — wait for the Vercel preview URL, open it, and screenshot the changed pages so I can review visually.

5. **Update project docs**:
   - Mark relevant Active Work items as done in CLAUDE.md
   - Add brief one-line entries to the Decisions Log for non-obvious decisions (date · decision · why — keep these short, they're an index not a narrative)
   - If new tasks were discovered during the session, add them to BACKLOG.md in the appropriate priority section

6. **Diarize to memory** — review the full session and extract anything worth remembering for future conversations. Route each insight to the right scope and type:

   **Project memory** (current project's memory directory):
   - Architectural decisions with reasoning — type: `project`
   - Patterns or approaches that worked or failed in this codebase — type: `project`
   - Dead ends tried and why they didn't work — type: `project`
   - Non-obvious codebase quirks discovered — type: `project`

   **Account-level memory** (parent or account memory directory):
   - Workflow preferences confirmed or discovered — type: `feedback`
   - Cross-project insights or reusable patterns — type: `feedback`
   - User preferences observed during the session — type: `user`
   - External resources or tools discovered — type: `reference`

   For each memory file:
   - Use proper frontmatter (name, description, type)
   - Add a pointer line to that directory's MEMORY.md
   - Check for existing memories first — update rather than duplicate
   - Descriptions should be specific enough to judge relevance in future sessions

   **Skip diarization** if the session was trivial (typo fix, single-line change) with nothing non-obvious to remember.

7. **Report** — give me:
   - PR URL and preview URL
   - One-line summary of what shipped
   - List of memories saved (if any), with their scope and type
   - Confirmation it's ready for me to review and merge

After I merge in GitHub, I'll run `/sync` to clean up locally.
