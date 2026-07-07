# AgenticOS Dashboard — Design Spec (v0.2)

**Date:** 2026-07-07
**Status:** Approved
**Repo:** github.com/Homeroida/agenticos (extends v0.1.0)

## Summary

A local web dashboard — the OS's observability layer and non-terminal
launcher. `node ui/server.js` starts a zero-dependency HTTP server bound to
127.0.0.1 that serves a single self-contained page: a button grid that runs
workflows through headless Claude (`claude -p`), plus widgets visualizing
the memory filesystem the OS already writes. A new `/dashboard` syscall
launches it from inside Claude Code.

## Goals

- Let non-terminal users (teammates, clients) run codified workflows with
  one click.
- Surface what the OS records — sessions, memory facts, snapshots, runs —
  outside the terminal.
- Preserve the project's constraints: zero npm dependencies, fail-open
  design, tests via `node --test`, everything ships in the one plugin repo.

## Non-Goals (v0.2)

- Usage/cost tracking (5-hour window, token spend). Deferred to v0.3 —
  requires parsing Claude Code's internal transcript files, which is
  fragile.
- Authentication/multi-user. The server binds to 127.0.0.1 only; it is a
  single-user, same-machine tool.
- Arbitrary prompt execution from the browser. Only config-defined buttons
  can run.
- Editing memory/config from the UI (read-only widgets in v0.2).

## Components

```
ui/server.js           — http routing + static serving (node:http)
ui/data.js             — filesystem readers (status, sessions, memory, buttons)
ui/runner.js           — claude -p spawn, run store, timeout handling
ui/index.html          — single self-contained page (inline CSS/JS, no CDN)
commands/dashboard.md  — /dashboard syscall (launch + report URL)
tests/ui-*.test.js     — unit + integration tests
```

### Server (`ui/server.js`)

- Binds `127.0.0.1`, default port `4517`, `AGENTICOS_PORT` env overrides.
- Routes:
  - `GET /` → `ui/index.html`
  - `GET /api/status` → `{version, daemons, kernelModules, filesystem: {memoryOk, factCount, sessionCount}}`
  - `GET /api/buttons` → merged button groups (see Buttons)
  - `GET /api/sessions` → last 50 entries of `sessions/log.jsonl` (newest first) + list of `*-snapshot.md` files
  - `GET /api/memory` → parsed `MEMORY.md` index entries `{title, file, hook}`
  - `GET /api/runs` → run history (newest first)
  - `GET /api/runs/<id>` → `{run, output}` (client polls every 2s while status is `running`)
  - `POST /api/run` `{buttonId, input}` → `{runId}` or 400 for unknown buttonId
- Unknown routes → 404 JSON. All handlers wrapped so an exception returns
  500 JSON and never kills the process.

### Buttons (`ui/data.js`)

Two sources, merged into ordered groups:

1. **Auto-discovered syscalls** — read `<pluginRoot>/commands/*.md`
   frontmatter, excluding `dashboard.md` (a dashboard button inside the
   dashboard is noise); each becomes a button in a built-in "Syscalls"
   domain:
   `{id: "syscall:boot", label: "/boot", prompt: "/boot", input: false,
   description: <frontmatter description>}`. The prompt sent to
   `claude -p` is the slash command itself.
2. **Custom buttons** — `~/.claude/agenticos/dashboard.json`, auto-created
   on first server start with exactly this content (one working example
   domain the user can edit or delete; JSON has no comments, so the example
   is live):

```json
{
  "workdir": "",
  "domains": [
    {
      "name": "Examples",
      "buttons": [
        {
          "id": "example:deep-research",
          "label": "Deep research",
          "prompt": "Do deep research on the following topic and write a structured report: ",
          "input": true,
          "description": "Structured research report on any topic"
        }
      ]
    }
  ]
}
```

- `workdir`: the cwd for spawned runs. Empty string → `os.homedir()`.
- `input: true` renders a text field; the trimmed input is appended to the
  fixed `prompt` string. `input: false` sends the prompt as-is.
- Validation on load: `id` (unique, non-empty), `label`, `prompt` required.
  A malformed file does not crash the server: `GET /api/buttons` returns
  syscall buttons plus `{configError: "<message>"}`, and the UI shows a
  banner.

### Runner (`ui/runner.js`)

- `startRun(button, input, opts)` spawns
  `claude -p <finalPrompt> --output-format text` via `child_process.spawn`
  with an **args array** (no shell), cwd = configured workdir.
- `AGENTICOS_CLAUDE_BIN` env overrides the binary (tests point it at a fake
  echo script; CI never needs credentials).
- Run record: `{id, buttonId, label, input, startedAt, endedAt, status:
  running|done|error|timeout, exitCode}` appended to
  `~/.claude/agenticos/runs/log.jsonl`; stdout+stderr captured to
  `~/.claude/agenticos/runs/<id>.txt`. `id` = timestamp + random suffix.
- Timeout: 10 minutes, then SIGTERM (SIGKILL after 10s grace) and status
  `timeout`.
- At most 3 concurrent runs; a 4th POST returns 429 JSON.

### Page (`ui/index.html`)

Single file, inline CSS/JS, no external requests (works offline). Layout:

- Header: OS name, version, server port.
- Left: button grid grouped by domain; clicking a button with `input: true`
  opens an inline input row; running buttons show a spinner.
- Right: widgets — Status card (boot-screen data), Sessions (recent log
  entries + snapshots), Memory (fact index), Runs (history; clicking a run
  shows its output in a panel, polling while running).
- No framework; fetch + DOM. Auto-refresh widgets every 30s.

### Syscall (`commands/dashboard.md`)

Prompt file instructing Claude to: locate the plugin root, start
`node ui/server.js` as a background process if the port isn't already
serving, then report the URL (`http://127.0.0.1:4517`) and how to stop it.

## Security

- Server binds 127.0.0.1 exclusively — never `0.0.0.0`.
- Only buttons present in the merged config can run; `buttonId` lookup,
  no prompt text accepted from the client beyond the input suffix.
- Spawn uses an args array; user input is never interpolated into a shell
  string.
- Run output files live under `~/.claude/agenticos/runs/`; the output
  endpoint resolves ids strictly (`/^[A-Za-z0-9-]+$/`) — no path traversal.

## Error Handling

- All filesystem readers fail soft: missing dirs/files → empty lists, a
  `configError`/`warning` field where relevant — widgets render empty, the
  server never crashes.
- Failed/timed-out runs are visible in the Runs widget with their status
  and captured output.
- Port already in use → clear startup error message naming the port and the
  env override, exit code 1.

## Testing

- `tests/ui-data.test.js` — readers against a temp HOME + temp plugin root:
  status counts, sessions parsing (skips malformed jsonl lines), memory
  index parsing, button merge (syscalls + custom, malformed config →
  configError, duplicate ids rejected).
- `tests/ui-runner.test.js` — fake binary via `AGENTICOS_CLAUDE_BIN`
  (a node script that echoes and exits): success run persists record +
  output; nonzero exit → status error; concurrency cap returns the 4th as
  rejected; id format enforced.
- `tests/ui-server.test.js` — integration: boot server on port 0 (ephemeral),
  fetch every GET endpoint, POST a run against the fake binary, poll it to
  completion, verify 404/400/429 paths.
- All via `node --test tests/`; no new dependencies; existing 65 tests
  untouched.

## Success Criteria

- `node ui/server.js` on a fresh machine (with the plugin filesystem
  present or absent) serves a working dashboard with empty-but-rendered
  widgets and the five syscall buttons.
- A custom button defined in `dashboard.json` runs `claude -p` and its
  output appears in the Runs widget.
- Full suite green in CI (fake binary, no credentials).
- README gains a Dashboard section; `/dashboard` syscall launches it.
