---
description: List current tasks and background agents (process table)
---

Show the AgenticOS process table:

1. Fetch the current task list; include id, subject, and status.
2. List any background agents or background shells started this session,
   with their state.
3. Render a compact table sorted by status (in_progress first, then
   pending, then completed), followed by one summary line:
   `N running, M pending, K completed`.

If there are no tasks and no background agents, report that the system is
idle — nothing else.
