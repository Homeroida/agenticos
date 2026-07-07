# AgenticOS Architecture

## Data flow

1. **Session start** — Claude Code fires the `SessionStart` hook. The boot
   daemon (`hooks/boot.js`) creates `~/.claude/agenticos/` if missing
   (`memory/`, `sessions/`, `MEMORY.md`), concatenates `kernel/*.md` in
   filename order, appends the memory index, and emits everything as
   `additionalContext`. If the memory directory is unusable, it emits the
   kernel alone and warns on stderr — boot never fails a session.
2. **During the session** — every Bash tool call passes through the guard
   daemon (`hooks/guard.js`). Commands matching its exact-match rules
   (rm -rf on a filesystem root, force-push to main/master,
   `git reset --hard origin/...`) are denied with a one-line reason.
   Everything else passes silently.
3. **Session end** — the session-log daemon (`hooks/session-log.js`)
   appends `{date, session_id, cwd, reason}` to `sessions/log.jsonl`.

## Subsystems

- **Kernel** (`kernel/`) — four markdown modules, ≤150 lines total
  (test-enforced): core identity, workflow loop, safety rules, memory
  conventions.
- **Processes** (`agents/`) — planner (read-only planning), reviewer
  (read-only review with severity verdicts), debugger (reproduce-first
  debugging).
- **Syscalls** (`commands/`) — boot, ps, save, resume, review.
- **Filesystem** (`~/.claude/agenticos/`) — `MEMORY.md` index +
  `memory/` fact files + `sessions/` snapshots and log.
- **Monitor** (`ui/`) — the dashboard: `server.js` (127.0.0.1-only HTTP,
  JSON API), `data.js` (fail-soft readers + button merge), `runner.js`
  (headless `claude -p` runs, persisted to `~/.claude/agenticos/runs/`),
  `index.html` (single self-contained page). Launched by the `/dashboard`
  syscall.
- **Drivers** — reserved for MCP integrations in a future version.

## Testing

`node --test tests/` — zero dependencies. Manifest/kernel/agent/command
tests are structural validation; guard tests are table-driven in both
directions (denied and allowed); boot tests run against a temp HOME and
cover the fail-open path.
