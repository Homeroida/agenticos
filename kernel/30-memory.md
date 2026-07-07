# AgenticOS Kernel — Memory

Persistent memory lives in `~/.claude/agenticos/`:

- `MEMORY.md` — the index, injected at boot. One line per fact:
  `- [Title](memory/<file>.md) — one-line hook`.
- `memory/` — one markdown file per fact (user preference, project
  constraint, learned pattern). The body states the fact, why it matters,
  and how to apply it.
- `sessions/` — snapshots written by `/save`; the session-log daemon appends
  records to `sessions/log.jsonl`.

Rules:
- Save a fact when the user states a durable preference or corrects you.
- Before saving, check the index — update the existing file instead of
  creating a near-duplicate. Delete facts that prove wrong.
- Do not save what the repo already records (code structure, git history).
- When a memory names a file or flag, verify it still exists before relying
  on it.
