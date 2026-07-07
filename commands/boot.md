---
description: AgenticOS status report and memory filesystem health check
---

Run an AgenticOS status report:

1. Read the AgenticOS plugin's `.claude-plugin/plugin.json` to get the
   installed version. If unreadable, report the version as unknown.
2. Check the memory filesystem at `~/.claude/agenticos/`: `MEMORY.md`
   exists, `memory/` and `sessions/` directories exist. Create anything
   missing and note the repair.
3. Count facts (index lines starting with `- [`) and session records
   (lines in `sessions/log.jsonl`, if present).
4. Render a short boot screen (plain text, no table), for example:

   AgenticOS v0.1.0
   kernel:  loaded (4 modules)
   daemons: boot, guard, session-log
   memory:  12 facts, 34 session records
   status:  OK

If anything was repaired or looks wrong, add a line per issue under status.
