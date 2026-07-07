---
description: Save a session snapshot to the AgenticOS filesystem
---

Write a session snapshot so a future session can resume this work:

1. Compose a markdown snapshot with these sections:
   - **Context** — project path and git branch (if a git repo).
   - **State** — what was accomplished this session.
   - **Decisions** — choices made and why.
   - **Next steps** — ordered list of what to do next.
   - **Files touched** — paths modified or central to the work.
2. Save it to `~/.claude/agenticos/sessions/<YYYY-MM-DD-HHmm>-snapshot.md`
   using the current local time (create the directory if missing).
3. Confirm the exact path written and summarize the snapshot in two
   sentences.
