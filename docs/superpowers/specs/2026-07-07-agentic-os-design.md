# AgenticOS — Design Spec

**Date:** 2026-07-07
**Status:** Approved
**Repo:** `agenticos` (public, open-source, MIT)

## Summary

AgenticOS is an open-source Claude Code **plugin** that layers an operating-system
architecture over Claude Code. Every configuration concept maps to an OS concept,
giving users an instant mental model of where things live and how they compose.
It installs with one command via a self-hosted plugin marketplace and updates
through the plugin system — no install scripts.

## Goals

- A lean, opinionated "OS" for Claude Code: curated, not a kitchen sink.
- One-command install, versioned updates (native plugin distribution).
- The kernel (core rules) stays ~150 lines total. Context bloat is the failure
  mode of existing frameworks; the size cap is a hard design constraint.
- A broken daemon must never brick a session (hooks fail open, except guard's
  exact-match deny patterns).

## Non-Goals (v1)

- MCP integrations ("drivers") — documented as a future subsystem.
- Language-specific rule packs, multi-agent orchestration systems, installers
  that copy files into `~/.claude`.
- Broad heuristic command-blocking. Guard covers a short exact-match list only.

## Metaphor Map

| OS concept | AgenticOS component | Implementation |
|---|---|---|
| Kernel | Core behavioral rules | Markdown injected at session start by boot hook |
| Boot loader | `SessionStart` hook | Concatenates kernel rules + memory index into context |
| Syscalls | Slash commands | `/boot`, `/ps`, `/save`, `/resume`, `/review` |
| Processes | Subagents | `planner`, `reviewer`, `debugger` |
| Daemons | Hooks | boot, command guard, session logger |
| Filesystem | Persistent memory | `~/.claude/agenticos/` (sessions + memory facts) |
| Drivers | MCP integrations | Out of scope for v1 (future) |

## Subsystems

### Kernel (core rules)

Four markdown files in `kernel/`, ~150 lines total, injected at every session
start by the boot daemon:

- `00-core.md` — OS identity: what subsystems exist and when Claude should
  reach for each (dispatch `planner` for complex features, `reviewer` after
  writing code, `debugger` for failures).
- `10-workflow.md` — development loop: understand → plan → implement with
  tests → review → commit.
- `20-safety.md` — no hardcoded secrets, confirm destructive operations,
  validate at boundaries.
- `30-memory.md` — filesystem conventions: when to save a fact, how to update
  the index, session save/resume behavior.

### Processes (subagents)

Three subagent definition files in `agents/`, each a focused system prompt
with tool restrictions:

- **planner** — read-only tools (Read, Grep, Glob); produces a phased
  implementation plan with risks and file targets.
- **reviewer** — read-only tools plus Bash for running checks; reviews diffs
  for correctness, security, and quality with severity levels
  (CRITICAL / HIGH / MEDIUM / LOW).
- **debugger** — read/run tools; must reproduce the failure first, form a
  hypothesis, verify the fix.

### Daemons (hooks)

Three Node.js scripts registered in `hooks/hooks.json`. Node is the runtime
because Claude Code itself runs on Node — no bash/PowerShell portability
issues.

- **boot** (`SessionStart`) — creates `~/.claude/agenticos/` (with `memory/`
  and `sessions/`) on first run; concatenates `kernel/*.md` plus the memory
  index `MEMORY.md`; emits the result as additional context. This is the
  kernel delivery mechanism.
- **guard** (`PreToolUse` on Bash) — denies a short exact-match list of
  catastrophic commands: `rm -rf /` (and drive-root variants), force-push to
  `main`/`master`, `git reset --hard` against a remote branch. Deny responses
  include a one-line explanation. No fuzzy heuristics.
- **session-log** (`SessionEnd`) — appends a session record (date, cwd,
  summary line) to `~/.claude/agenticos/sessions/` so `/resume` has data.

Error policy: boot and session-log fail **open** (on any error, inject kernel
rules only / skip logging, write a warning to stderr). Guard fails **closed**
only when a command matches its exact patterns.

### Filesystem (memory)

```
~/.claude/agenticos/
├── MEMORY.md          # index — one line per fact, loaded at boot
├── memory/            # one markdown file per fact
└── sessions/          # session records from /save and session-log daemon
```

Conventions (taught by `30-memory.md`): check for an existing fact before
creating a new one; update rather than append; keep the index one line per
fact; facts are markdown files with a name, one-line description, and body.

### Syscalls (slash commands)

Five markdown prompt files in `commands/`:

- `/boot` — status report: OS version, subsystems loaded, memory stats,
  filesystem health check (creates missing directories).
- `/ps` — list current tasks and background agents with state.
- `/save` — write a structured session snapshot (task state, decisions, next
  steps) to `sessions/`.
- `/resume` — load the latest session snapshot and continue work.
- `/review` — dispatch the reviewer process on the current git diff.

## Repo Layout

```
agenticos/
├── .claude-plugin/
│   ├── plugin.json        # name, version, description
│   └── marketplace.json   # self-hosted marketplace entry
├── kernel/                # 4 rule files
├── agents/                # 3 subagent definitions
├── commands/              # 5 syscall prompts
├── hooks/
│   ├── hooks.json         # hook registration
│   ├── boot.js
│   ├── guard.js
│   └── session-log.js
├── docs/                  # architecture doc + per-subsystem pages
├── tests/                 # schema validation, guard unit tests, boot smoke test
├── .github/workflows/ci.yml
├── README.md              # install, metaphor map, quick start
└── LICENSE                # MIT
```

## Installation Story

1. `/plugin marketplace add <github-user>/agenticos`
2. `/plugin install agenticos`
3. Next session start, the boot daemon creates the filesystem and injects the
   kernel. `/boot` shows status.

## Testing

- JSON schema validation for `plugin.json`, `hooks.json`, and agent
  frontmatter.
- Unit tests for `guard.js` pattern matching (the one component with real
  logic): both directions — catastrophic commands are denied, ordinary
  commands (including near-misses like `rm -rf ./build`) pass.
- Smoke test for `boot.js` against a temp `HOME`: first run creates the
  filesystem; subsequent runs emit kernel + index; corrupted memory dir still
  emits kernel (fail-open).
- Tests run with Node's built-in `node --test` (no test-framework dependency).
- GitHub Actions CI on push and PR.

## Success Criteria

- Fresh machine: marketplace add + install + new session yields a working OS
  (kernel in context, filesystem created) with no manual steps.
- Kernel total stays ≤ 150 lines.
- All tests green in CI.
- README explains the metaphor map and quick start in under two screens.
