---
description: Resume work from the latest AgenticOS session snapshot
---

Resume previous work:

1. List `~/.claude/agenticos/sessions/*-snapshot.md` and read the most
   recent by filename.
2. If no snapshot exists, read the last line of `sessions/log.jsonl` (if
   present) and report that only a bare session record is available.
3. Summarize the snapshot: context, state, and next steps.
4. Verify the snapshot still matches reality — the branch exists, the files
   it names are present — and flag anything stale.
5. Propose continuing with the first unfinished next step and wait for the
   user's confirmation before acting.
