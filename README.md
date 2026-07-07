# AgenticOS

An operating system for Claude Code. AgenticOS layers a real OS architecture
over Claude Code so every piece of configuration has an obvious home:

| OS concept | AgenticOS component | What it does |
|---|---|---|
| Kernel | `kernel/*.md` | Core behavioral rules, injected at session start |
| Boot loader | `SessionStart` hook | Loads the kernel + your memory index |
| Syscalls | `/boot` `/ps` `/save` `/resume` `/review` | User-invocable commands |
| Processes | `planner` `reviewer` `debugger` | Focused subagents |
| Daemons | boot, guard, session-log hooks | Background automation |
| Filesystem | `~/.claude/agenticos/` | Persistent memory and sessions |
| Monitor | `ui/` dashboard | Local web UI: run buttons + observability |
| Drivers | MCP integrations | Future subsystem |

## Install

```
/plugin marketplace add Homeroida/agenticos
/plugin install agenticos
```

(installing from a fork? use that fork's owner instead of `Homeroida`)

Start a new session. The boot daemon creates `~/.claude/agenticos/` and
injects the kernel. Run `/boot` to see the status screen.

## Quick start

- `/boot` — status report and filesystem health check
- `/save` — snapshot this session's state, decisions, and next steps
- `/resume` — pick up where the last session left off
- `/review` — dispatch the reviewer process on your current diff
- `/ps` — show the process table (tasks and background agents)

## Dashboard

The OS ships with a local web dashboard — observability plus a launcher
that runs your workflows through headless Claude, so teammates never need
the terminal:

```
node ui/server.js        # from the plugin directory, or run /dashboard
```

Open http://127.0.0.1:4517 (localhost only; `AGENTICOS_PORT` overrides the
port). The button grid auto-discovers the five syscalls and adds your own
buttons from `~/.claude/agenticos/dashboard.json` — group them into domains
(Research, Content, Ops…), give each a fixed prompt and an optional input
field. Clicking a button spawns `claude -p` headlessly; output lands in the
Runs panel. Widgets show OS status, session history, and your memory index.
Only buttons defined in the config can run — the browser can never send an
arbitrary prompt.

## Design principles

- **Lean kernel.** The kernel is capped at 150 lines, enforced by a test.
  Context bloat is the failure mode of every config framework; the cap is
  the feature.
- **Fail open.** A broken daemon never bricks a session: boot falls back to
  kernel-only, session-log skips silently. The guard denies only an
  exact-match list of catastrophic commands — no fuzzy heuristics,
  near-zero false positives.
- **Curated, not comprehensive.** Three processes, five syscalls, three
  daemons. The kernel teaches Claude when to use each.

## Development

No dependencies. Tests use Node's built-in runner:

```
node --test tests/
```

See `docs/architecture.md` for how the subsystems fit together.

## License

MIT
