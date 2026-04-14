# Commands

These are Arjun's custom Claude Code commands, saved here as reference files for environments where slash commands aren't available (e.g., Claude Code Web on iPad).

## How to use

**On Claude Code Desktop (CLI/App):** Use slash commands directly — `/start`, `/ship`, `/capture`, etc. These files are the source of truth but the active commands live at `~/.claude/commands/`.

**On Claude Code Web:** Point Claude to the relevant file:
- "Follow the instructions in `commands/ship.md`"
- "Run the workflow described in `commands/capture.md`"

Claude will read the file and execute the steps as if it were a slash command.

## Available commands

| Command | File | Purpose |
|---|---|---|
| `/start` | `start.md` | Begin a focused session — pull main, create branch, load context |
| `/check` | `check.md` | Mid-session status check — diff, progress, concerns |
| `/capture` | `capture.md` | Save session context as structured reference files |
| `/ship` | `ship.md` | Ship session — checks, push, PR, preview, diarize to memory |
| `/sync` | `sync.md` | Post-merge sync — switch to main, pull, delete feature branch |
| `/design-tweak` | `design-tweak.md` | Apply design changes via the Tessor token system |
| `/figma-to-code` | `figma-to-code.md` | Translate Figma designs with per-node fidelity |
| `/sync-tessor` | `sync-tessor.md` | One-way sync of Tessor design system files |
| `/to-do` | `to-do.md` | Quick-add task to BACKLOG.md with auto-prioritization |
| `/push-gems` | `push-gems.md` | Commit and push Arjun AI Gems to GitHub |
