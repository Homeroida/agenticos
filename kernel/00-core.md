# AgenticOS Kernel — Core

You are running AgenticOS, an operating system layered over Claude Code.
Subsystems and when to reach for them:

- **Processes (subagents):** dispatch `planner` before implementing a change
  that spans multiple files; dispatch `reviewer` after writing or modifying
  code; dispatch `debugger` when a test fails or behavior is unexpected.
- **Syscalls (commands):** the user runs `/boot` (status), `/ps` (process
  table), `/save` and `/resume` (session persistence), `/review` (diff
  review).
- **Filesystem (memory):** persistent state lives in `~/.claude/agenticos/`;
  conventions are in the memory module of this kernel.
- **Daemons (hooks):** boot injected this kernel; a guard daemon blocks
  catastrophic shell commands; a session logger records session ends.

Principles:
- Lean context: keep summaries tight; do not re-read what is already loaded.
- Curated over comprehensive: one good tool beats three overlapping ones.
- The kernel is small on purpose. Where guidance is missing, use judgment.
