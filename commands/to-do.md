---
description: Quick-add a task to BACKLOG.md with auto-prioritization by ease vs value
---

Add a task to this project's BACKLOG.md without disrupting current work.

1. **Parse the task** from what I just said. If the description is too vague to act on later, ask one clarifying question (max one).

2. **Assess priority** using ease x value:

   |                          | High Value         | Low Value          |
   |--------------------------|--------------------|--------------------|
   | **Easy (< 1 session)**   | -> High Priority   | -> Quick Wins      |
   | **Hard (2+ sessions)**   | -> Medium Priority | -> Low Priority    |

3. **Classify platform** — which environment can this task be done in?
   - **Desktop** — needs MCPs (Figma, Typefully, browser automation), preview screenshots, hooks, local server interaction with visual verification
   - **Web** — text editing, writing, planning, docs, straightforward code changes, refactoring, analysis
   - **Either** — works on both Desktop and Web

4. **Classify model** — what level of reasoning does this task need?
   - **Opus** — complex multi-file refactors, architectural decisions, ambiguous requirements, creative/nuanced work, large context needed
   - **Sonnet** — well-defined changes, simple fixes, docs, formatting, scripting, straightforward tasks
   - **Either** — works with both models

5. **Read BACKLOG.md** and add a new row to the table in the matching priority section. If BACKLOG.md doesn't exist, create it with the table format below. If it exists but uses list format, convert it to table format first.

6. **Table format** — BACKLOG.md uses tables grouped by priority section:

   ```markdown
   # Backlog — [Project Name]

   ## High Priority

   | Task | Platform | Model | Status |
   |---|---|---|---|
   | **Short title** — description with enough context to act on later | Desktop | Opus | Open |

   ## Medium Priority

   | Task | Platform | Model | Status |
   |---|---|---|---|
   | **Short title** — description | Web | Sonnet | Open |
   ```

   Add the new row at the top of the matching section's table (newest first).

   **Status values:** `Open`, `In Progress`, `Done`

7. **Confirm** — tell me: the title, which section it landed in, the platform and model classifications, and why (one sentence).

**Rules:**
- Do NOT create branches, commits, PRs, or affect any in-progress work
- Do NOT start working on the task — this is a note for later
- Do NOT reorganize or modify existing backlog items
- If BACKLOG.md doesn't exist, create it with the four priority sections (High, Medium, Low, Quick Wins) using the table format above
- If BACKLOG.md exists in list format, convert it to table format before adding the new item
- Preserve any non-task sections (e.g., detail plans, worktree guides) below the tables
