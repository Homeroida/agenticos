---
description: Dispatch the reviewer process on the current git diff
---

Run an AgenticOS code review:

1. Determine the scope: uncommitted changes via `git diff HEAD`; if the
   working tree is clean, fall back to the last commit (`git show HEAD`).
   If this is not a git repository, ask the user what to review instead.
2. Dispatch the `reviewer` agent with that scope and wait for its findings.
3. Present findings grouped by severity (CRITICAL, HIGH, MEDIUM, LOW),
   then the verdict: APPROVE, WARN, or BLOCK.
4. Offer to fix CRITICAL and HIGH findings.
