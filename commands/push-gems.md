---
description: Commit and push any new or changed files in ~/Documents/Personal Projects/AI Workflow to the arjun-ai-gems GitHub repo
---

Push the AI Workflow folder to GitHub:

1. Change directory to `/Users/arjunphlox/Documents/Personal Projects/AI Workflow`.
2. Run `git status` to see what's changed (untracked files, modified files, deleted files).
3. If there's nothing to commit, tell me everything is up to date and stop.
4. Otherwise:
   - Stage all changes with `git add -A`
   - Show me the diff summary so I know what's being committed
   - Create a commit with a clear message describing what changed (e.g., "add new workflow guide", "update session workflow with new commands"). Use a HEREDOC for the commit message and include the Co-Authored-By trailer.
   - Push to `origin main`
5. Report the commit hash and a one-line summary of what was pushed.

The repo is at: https://github.com/arjunphlox/arjun-ai-gems
