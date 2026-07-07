# AgenticOS Dashboard (v0.2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the AgenticOS dashboard — a zero-dependency local web UI with config-defined buttons that run headless Claude (`claude -p`) plus observability widgets over the OS's memory filesystem.

**Architecture:** One `node:http` server (`ui/server.js`) bound to 127.0.0.1 serving a single self-contained HTML page and a small JSON API. `ui/data.js` holds fail-soft filesystem readers and the button merge (auto-discovered syscalls + `~/.claude/agenticos/dashboard.json`). `ui/runner.js` spawns `claude -p` (args array, no shell) with run records persisted under `~/.claude/agenticos/runs/`. A `/dashboard` syscall launches the server from inside Claude Code.

**Tech Stack:** Node.js CommonJS (`node:http`, `node:child_process`), `node:test` + global `fetch` for tests, zero npm dependencies.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-07-dashboard-design.md` (approved).
- Server binds `127.0.0.1` exclusively; default port `4517`; `AGENTICOS_PORT` overrides.
- Zero npm dependencies anywhere; CommonJS `.js`; tests via `node --test tests/` (existing suite: 65 green; `tests/index.js` auto-discovers `*.test.js` — no registration).
- Only config-defined buttons can run; user input is appended to the fixed prompt and passed via spawn **args array** — never through a shell.
- All filesystem readers fail soft (missing files → empty data, never a crash). Malformed `dashboard.json` → `configError` field, syscall buttons still served.
- Runner: `AGENTICOS_CLAUDE_BIN` overrides the binary; construct with `{bin, binArgs}` for tests (fake script via `process.execPath`). Timeout 10 min (SIGTERM, SIGKILL after 10s). Max 3 concurrent runs → 429.
- Run ids match `/^[A-Za-z0-9-]+$/`; the output endpoint rejects anything else (no path traversal).
- Tests never touch the real HOME — temp dirs via `fs.mkdtempSync` only.
- Commit messages: conventional commits, no attribution footer.

---

### Task 1: Data layer (`ui/data.js`)

**Files:**
- Create: `tests/ui-data.test.js`
- Create: `ui/data.js`

**Interfaces:**
- Consumes: repo layout from v0.1 (`commands/*.md` frontmatter, `kernel/`, `hooks/hooks.json`, `.claude-plugin/plugin.json`; agent-home layout `MEMORY.md`, `sessions/log.jsonl`, `*-snapshot.md`).
- Produces (Tasks 3 uses all of these):
  - `readStatus(agentHome, pluginRoot) -> {version, kernelModules, daemons, filesystem: {memoryOk, factCount, sessionCount}}`
  - `readMemory(agentHome) -> [{title, file, hook}]`
  - `readSessions(agentHome, limit=50) -> {entries: [...newest first], snapshots: [filenames newest first]}`
  - `readButtons(agentHome, pluginRoot) -> {workdir, groups: [{name, buttons: [{id, label, prompt, input, description}]}], configError: string|null}` (group 0 is always "Syscalls"; `dashboard.md` excluded from discovery)
  - `findButton(buttonsResult, id) -> button|null`
  - `validateConfig(config) -> string|null` (error message or null)
  - `ensureDashboardConfig(agentHome) -> configFilePath` (creates `dashboard.json` with `DEFAULT_CONFIG` if missing)
  - `DEFAULT_CONFIG` (exported constant, one "Examples" domain with button id `example:deep-research`)

- [ ] **Step 1: Write the failing tests**

Create `tests/ui-data.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const data = require('../ui/data.js');

const PLUGIN_ROOT = path.resolve(__dirname, '..');

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'agenticos-ui-'));
}

test('readers fail soft on a missing agent home', () => {
  const home = path.join(tempDir(), 'does-not-exist');
  assert.deepStrictEqual(data.readMemory(home), []);
  assert.deepStrictEqual(data.readSessions(home).entries, []);
  const status = data.readStatus(home, PLUGIN_ROOT);
  assert.strictEqual(status.filesystem.memoryOk, false);
  assert.strictEqual(status.filesystem.sessionCount, 0);
});

test('readStatus reports version, kernel modules, and daemons from the plugin', () => {
  const status = data.readStatus(tempDir(), PLUGIN_ROOT);
  assert.match(status.version, /^\d+\.\d+\.\d+$/);
  assert.strictEqual(status.kernelModules, 4);
  assert.deepStrictEqual(
    [...status.daemons].sort(),
    ['PreToolUse', 'SessionEnd', 'SessionStart']
  );
});

test('readMemory parses index lines and ignores non-fact lines', () => {
  const home = tempDir();
  fs.writeFileSync(
    path.join(home, 'MEMORY.md'),
    '# Index\n- [Fact one](memory/fact-one.md) — the hook\nnot a fact\n'
  );
  const facts = data.readMemory(home);
  assert.strictEqual(facts.length, 1);
  assert.deepStrictEqual(facts[0], {
    title: 'Fact one',
    file: 'memory/fact-one.md',
    hook: 'the hook',
  });
});

test('readSessions returns newest first and skips malformed jsonl lines', () => {
  const home = tempDir();
  fs.mkdirSync(path.join(home, 'sessions'), { recursive: true });
  fs.writeFileSync(
    path.join(home, 'sessions', 'log.jsonl'),
    JSON.stringify({ session_id: 'a' }) + '\nnot json\n' + JSON.stringify({ session_id: 'b' }) + '\n'
  );
  fs.writeFileSync(path.join(home, 'sessions', '2026-07-07-1200-snapshot.md'), '# snap');
  const result = data.readSessions(home);
  assert.strictEqual(result.entries.length, 2);
  assert.strictEqual(result.entries[0].session_id, 'b');
  assert.deepStrictEqual(result.snapshots, ['2026-07-07-1200-snapshot.md']);
});

test('readButtons merges syscalls with the auto-created config and excludes dashboard.md', () => {
  const home = tempDir();
  const result = data.readButtons(home, PLUGIN_ROOT);
  assert.strictEqual(result.configError, null);
  assert.strictEqual(result.groups[0].name, 'Syscalls');
  const ids = result.groups[0].buttons.map((b) => b.id);
  assert.ok(ids.includes('syscall:boot'));
  assert.ok(ids.includes('syscall:review'));
  assert.ok(!ids.includes('syscall:dashboard'));
  assert.strictEqual(result.groups[1].name, 'Examples');
  assert.ok(fs.existsSync(path.join(home, 'dashboard.json')));
});

test('syscall buttons carry the command description and a slash prompt', () => {
  const result = data.readButtons(tempDir(), PLUGIN_ROOT);
  const boot = result.groups[0].buttons.find((b) => b.id === 'syscall:boot');
  assert.strictEqual(boot.label, '/boot');
  assert.strictEqual(boot.prompt, '/boot');
  assert.strictEqual(boot.input, false);
  assert.ok(boot.description.length > 0);
});

test('malformed dashboard.json yields configError while syscalls still serve', () => {
  const home = tempDir();
  fs.writeFileSync(path.join(home, 'dashboard.json'), '{not json');
  const result = data.readButtons(home, PLUGIN_ROOT);
  assert.ok(result.configError);
  assert.ok(result.groups[0].buttons.length >= 5);
  assert.strictEqual(result.groups.length, 1);
});

test('validateConfig rejects duplicates and missing fields, accepts the default', () => {
  assert.ok(
    data.validateConfig({
      domains: [
        { name: 'X', buttons: [{ id: 'a', label: 'A', prompt: 'p' }, { id: 'a', label: 'B', prompt: 'p' }] },
      ],
    })
  );
  assert.ok(
    data.validateConfig({ domains: [{ name: 'X', buttons: [{ id: 'a', label: '', prompt: 'p' }] }] })
  );
  assert.ok(data.validateConfig({ domains: 'nope' }));
  assert.strictEqual(data.validateConfig(data.DEFAULT_CONFIG), null);
});

test('findButton locates buttons across groups', () => {
  const buttons = data.readButtons(tempDir(), PLUGIN_ROOT);
  assert.ok(data.findButton(buttons, 'syscall:boot'));
  assert.ok(data.findButton(buttons, 'example:deep-research'));
  assert.strictEqual(data.findButton(buttons, 'nope'), null);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/ui-data.test.js`
Expected: FAIL with `Cannot find module '../ui/data.js'`.

- [ ] **Step 3: Implement ui/data.js**

Create `ui/data.js`:

```js
'use strict';

// AgenticOS dashboard data layer: fail-soft filesystem readers.
// Every reader returns usable (possibly empty) data — never throws.

const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_CONFIG = {
  workdir: '',
  domains: [
    {
      name: 'Examples',
      buttons: [
        {
          id: 'example:deep-research',
          label: 'Deep research',
          prompt: 'Do deep research on the following topic and write a structured report: ',
          input: true,
          description: 'Structured research report on any topic',
        },
      ],
    },
  ],
};

function readJsonl(file, limit) {
  let lines;
  try {
    lines = fs.readFileSync(file, 'utf8').trim().split('\n');
  } catch {
    return [];
  }
  const records = [];
  for (const line of lines) {
    try {
      records.push(JSON.parse(line));
    } catch {
      // skip malformed lines
    }
  }
  return records.slice(-limit).reverse();
}

function readMemory(agentHome) {
  let raw;
  try {
    raw = fs.readFileSync(path.join(agentHome, 'MEMORY.md'), 'utf8');
  } catch {
    return [];
  }
  const facts = [];
  for (const line of raw.split('\n')) {
    const m = line.match(/^- \[([^\]]+)\]\(([^)]+)\)\s*—?\s*(.*)$/);
    if (m) facts.push({ title: m[1], file: m[2], hook: m[3] });
  }
  return facts;
}

function readSessions(agentHome, limit = 50) {
  const entries = readJsonl(path.join(agentHome, 'sessions', 'log.jsonl'), limit);
  let snapshots = [];
  try {
    snapshots = fs
      .readdirSync(path.join(agentHome, 'sessions'))
      .filter((f) => f.endsWith('-snapshot.md'))
      .sort()
      .reverse();
  } catch {}
  return { entries, snapshots };
}

function readStatus(agentHome, pluginRoot) {
  const status = {
    version: 'unknown',
    kernelModules: 0,
    daemons: [],
    filesystem: { memoryOk: false, factCount: 0, sessionCount: 0 },
  };
  try {
    status.version = JSON.parse(
      fs.readFileSync(path.join(pluginRoot, '.claude-plugin', 'plugin.json'), 'utf8')
    ).version;
  } catch {}
  try {
    status.kernelModules = fs
      .readdirSync(path.join(pluginRoot, 'kernel'))
      .filter((f) => f.endsWith('.md')).length;
  } catch {}
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(pluginRoot, 'hooks', 'hooks.json'), 'utf8'));
    status.daemons = Object.keys(cfg.hooks || {});
  } catch {}
  status.filesystem.memoryOk = fs.existsSync(path.join(agentHome, 'MEMORY.md'));
  status.filesystem.factCount = readMemory(agentHome).length;
  status.filesystem.sessionCount = readJsonl(path.join(agentHome, 'sessions', 'log.jsonl'), Infinity).length;
  return status;
}

function readSyscallButtons(pluginRoot) {
  let files = [];
  try {
    files = fs
      .readdirSync(path.join(pluginRoot, 'commands'))
      .filter((f) => f.endsWith('.md') && f !== 'dashboard.md')
      .sort();
  } catch {}
  const buttons = [];
  for (const file of files) {
    const name = file.replace(/\.md$/, '');
    let description = '';
    try {
      const raw = fs.readFileSync(path.join(pluginRoot, 'commands', file), 'utf8');
      const m = raw.match(/^---\n([\s\S]*?)\n---/);
      if (m) {
        const line = m[1].split('\n').find((l) => l.startsWith('description:'));
        if (line) description = line.slice('description:'.length).trim();
      }
    } catch {}
    buttons.push({ id: `syscall:${name}`, label: `/${name}`, prompt: `/${name}`, input: false, description });
  }
  return buttons;
}

function ensureDashboardConfig(agentHome) {
  const file = path.join(agentHome, 'dashboard.json');
  try {
    if (!fs.existsSync(file)) {
      fs.mkdirSync(agentHome, { recursive: true });
      fs.writeFileSync(file, JSON.stringify(DEFAULT_CONFIG, null, 2) + '\n');
    }
  } catch {}
  return file;
}

function validateConfig(config) {
  if (typeof config !== 'object' || config === null || Array.isArray(config)) {
    return 'config must be a JSON object';
  }
  if (config.workdir !== undefined && typeof config.workdir !== 'string') {
    return 'workdir must be a string';
  }
  if (!Array.isArray(config.domains)) return 'domains must be an array';
  const seen = new Set();
  for (const domain of config.domains) {
    if (!domain || typeof domain.name !== 'string' || !domain.name) {
      return 'every domain needs a non-empty name';
    }
    if (!Array.isArray(domain.buttons)) return `domain "${domain.name}" needs a buttons array`;
    for (const b of domain.buttons) {
      if (!b || typeof b.id !== 'string' || !b.id) {
        return `domain "${domain.name}" has a button without an id`;
      }
      if (seen.has(b.id)) return `duplicate button id "${b.id}"`;
      seen.add(b.id);
      if (typeof b.label !== 'string' || !b.label) return `button "${b.id}" needs a label`;
      if (typeof b.prompt !== 'string' || !b.prompt) return `button "${b.id}" needs a prompt`;
    }
  }
  return null;
}

function readButtons(agentHome, pluginRoot) {
  const result = {
    workdir: '',
    groups: [{ name: 'Syscalls', buttons: readSyscallButtons(pluginRoot) }],
    configError: null,
  };
  const file = ensureDashboardConfig(agentHome);
  let config;
  try {
    config = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    result.configError = `dashboard.json unreadable: ${err.message}`;
    return result;
  }
  const problem = validateConfig(config);
  if (problem) {
    result.configError = `dashboard.json invalid: ${problem}`;
    return result;
  }
  result.workdir = config.workdir || '';
  for (const domain of config.domains) {
    result.groups.push({
      name: domain.name,
      buttons: domain.buttons.map((b) => ({
        id: b.id,
        label: b.label,
        prompt: b.prompt,
        input: b.input === true,
        description: b.description || '',
      })),
    });
  }
  return result;
}

function findButton(buttonsResult, id) {
  for (const group of buttonsResult.groups) {
    for (const b of group.buttons) {
      if (b.id === id) return b;
    }
  }
  return null;
}

module.exports = {
  readStatus,
  readMemory,
  readSessions,
  readButtons,
  findButton,
  ensureDashboardConfig,
  validateConfig,
  DEFAULT_CONFIG,
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/ui-data.test.js`
Expected: 9 passing tests, `fail 0`. Then run `node --test tests/` — 74 passing (65 + 9), `fail 0`.

- [ ] **Step 5: Commit**

```bash
git add ui/data.js tests/ui-data.test.js
git commit -m "feat: add dashboard data layer with fail-soft readers and button merge"
```

---

### Task 2: Runner (`ui/runner.js`)

**Files:**
- Create: `tests/ui-runner.test.js`
- Create: `ui/runner.js`

**Interfaces:**
- Consumes: button objects `{id, label, prompt, input}` from Task 1.
- Produces (Task 3 uses):
  - `class Runner` — `new Runner({agentHome, bin, binArgs, timeoutMs, killGraceMs})`. `bin` defaults to `process.env.AGENTICOS_CLAUDE_BIN || 'claude'`; `binArgs` defaults to `[]` (prefix args, so tests can use `bin: process.execPath, binArgs: [fakeScript]`).
  - `runner.startRun(button, input, workdir) -> {id} | {error: 'too-many-runs'}`
  - `runner.listRuns() -> [records newest first, max 50]`
  - `runner.getRun(id) -> {run, output} | null` (null for unknown or invalid-format ids)
  - Run record shape: `{id, buttonId, label, input, startedAt, endedAt, status: 'running'|'done'|'error'|'timeout', exitCode}`
  - `MAX_CONCURRENT` export (3).
  - Files written: `<agentHome>/runs/log.jsonl` (one record per finished run), `<agentHome>/runs/<id>.txt` (combined stdout+stderr).

- [ ] **Step 1: Write the failing tests**

Create `tests/ui-runner.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Runner, MAX_CONCURRENT } = require('../ui/runner.js');

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'agenticos-run-'));
}

// Fake claude: echoes the -p prompt; exits 3 if it contains FAIL; hangs if it contains HANG.
const FAKE = path.join(tempDir(), 'fake-claude.js');
fs.writeFileSync(
  FAKE,
  [
    "const i = process.argv.indexOf('-p');",
    "const prompt = process.argv[i + 1] || '';",
    "process.stdout.write('RAN:' + prompt);",
    "if (prompt.includes('FAIL')) process.exit(3);",
    "else if (prompt.includes('HANG')) setInterval(() => {}, 1000);",
    'else process.exit(0);',
  ].join('\n')
);

function makeRunner(home, opts = {}) {
  return new Runner({ agentHome: home, bin: process.execPath, binArgs: [FAKE], ...opts });
}

function waitFor(check, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const tick = () => {
      if (check()) return resolve();
      if (Date.now() - started > timeoutMs) return reject(new Error('waitFor timed out'));
      setTimeout(tick, 25);
    };
    tick();
  });
}

const BUTTON = { id: 'x:echo', label: 'Echo', prompt: 'hello ', input: true };

test('successful run persists a record and captures output', async () => {
  const home = tempDir();
  const runner = makeRunner(home);
  const { id } = runner.startRun(BUTTON, 'world', home);
  assert.match(id, /^[A-Za-z0-9-]+$/);
  await waitFor(() => runner.getRun(id).run.status !== 'running');
  const { run, output } = runner.getRun(id);
  assert.strictEqual(run.status, 'done');
  assert.strictEqual(run.exitCode, 0);
  assert.strictEqual(output, 'RAN:hello world');
  const logged = fs
    .readFileSync(path.join(home, 'runs', 'log.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l));
  assert.strictEqual(logged.length, 1);
  assert.strictEqual(logged[0].id, id);
});

test('nonzero exit marks the run as error with the exit code', async () => {
  const home = tempDir();
  const runner = makeRunner(home);
  const { id } = runner.startRun({ ...BUTTON, prompt: 'FAIL ' }, 'x', home);
  await waitFor(() => runner.getRun(id).run.status !== 'running');
  const { run } = runner.getRun(id);
  assert.strictEqual(run.status, 'error');
  assert.strictEqual(run.exitCode, 3);
});

test('concurrency cap rejects a fourth run; hung runs time out', async () => {
  const home = tempDir();
  const runner = makeRunner(home, { timeoutMs: 300, killGraceMs: 100 });
  const hang = { id: 'x:hang', label: 'Hang', prompt: 'HANG', input: false };
  const ids = [];
  for (let i = 0; i < MAX_CONCURRENT; i++) ids.push(runner.startRun(hang, '', home).id);
  assert.deepStrictEqual(runner.startRun(hang, '', home), { error: 'too-many-runs' });
  await waitFor(() => ids.every((id) => runner.getRun(id).run.status !== 'running'));
  for (const id of ids) assert.strictEqual(runner.getRun(id).run.status, 'timeout');
});

test('getRun rejects ids that are not [A-Za-z0-9-]', () => {
  const runner = makeRunner(tempDir());
  assert.strictEqual(runner.getRun('../../etc/passwd'), null);
  assert.strictEqual(runner.getRun('a_b'), null);
  assert.strictEqual(runner.getRun('unknown-id'), null);
});

test('input-less buttons ignore the input argument', async () => {
  const home = tempDir();
  const runner = makeRunner(home);
  const { id } = runner.startRun({ id: 'x:fixed', label: 'F', prompt: 'fixed', input: false }, 'IGNORED', home);
  await waitFor(() => runner.getRun(id).run.status !== 'running');
  assert.strictEqual(runner.getRun(id).output, 'RAN:fixed');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/ui-runner.test.js`
Expected: FAIL with `Cannot find module '../ui/runner.js'`.

- [ ] **Step 3: Implement ui/runner.js**

Create `ui/runner.js`:

```js
'use strict';

// AgenticOS dashboard runner: spawns headless Claude for config-defined
// buttons. No shell — args array only. Run records persist to
// <agentHome>/runs/log.jsonl; output to <agentHome>/runs/<id>.txt.

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const MAX_CONCURRENT = 3;
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;
const DEFAULT_KILL_GRACE_MS = 10 * 1000;
const ID_PATTERN = /^[A-Za-z0-9-]+$/;

class Runner {
  constructor(opts = {}) {
    this.agentHome = opts.agentHome || path.join(os.homedir(), '.claude', 'agenticos');
    this.bin = opts.bin || process.env.AGENTICOS_CLAUDE_BIN || 'claude';
    this.binArgs = opts.binArgs || [];
    this.timeoutMs = opts.timeoutMs || DEFAULT_TIMEOUT_MS;
    this.killGraceMs = opts.killGraceMs || DEFAULT_KILL_GRACE_MS;
    this.active = new Map(); // id -> child process
    this.records = new Map(); // id -> record (this process's runs)
  }

  runsDir() {
    return path.join(this.agentHome, 'runs');
  }

  startRun(button, input, workdir) {
    if (this.active.size >= MAX_CONCURRENT) return { error: 'too-many-runs' };
    const id = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const suffix = button.input ? String(input || '').trim() : '';
    const prompt = button.prompt + suffix;
    const record = {
      id,
      buttonId: button.id,
      label: button.label,
      input: suffix,
      startedAt: new Date().toISOString(),
      endedAt: null,
      status: 'running',
      exitCode: null,
    };
    this.records.set(id, record);
    fs.mkdirSync(this.runsDir(), { recursive: true });
    const out = fs.createWriteStream(path.join(this.runsDir(), `${id}.txt`));
    const cwd = workdir && fs.existsSync(workdir) ? workdir : os.homedir();
    const args = [...this.binArgs, '-p', prompt, '--output-format', 'text'];
    let child;
    try {
      child = spawn(this.bin, args, { cwd, windowsHide: true });
    } catch (err) {
      this.finish(record, 'error', null, out, `spawn failed: ${err.message}`);
      return { id };
    }
    this.active.set(id, child);
    child.stdout.pipe(out, { end: false });
    child.stderr.pipe(out, { end: false });
    const timer = setTimeout(() => {
      record.status = 'timeout';
      child.kill('SIGTERM');
      const hardKill = setTimeout(() => {
        if (this.active.has(id)) child.kill('SIGKILL');
      }, this.killGraceMs);
      hardKill.unref();
    }, this.timeoutMs);
    timer.unref();
    child.on('error', (err) => {
      clearTimeout(timer);
      this.active.delete(id);
      this.finish(record, 'error', null, out, `spawn failed: ${err.message}. Set AGENTICOS_CLAUDE_BIN to the full path of your claude binary.`);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      this.active.delete(id);
      const status = record.status === 'timeout' ? 'timeout' : code === 0 ? 'done' : 'error';
      this.finish(record, status, code, out, null);
    });
    return { id };
  }

  finish(record, status, exitCode, out, note) {
    if (record.endedAt) return; // already finished (error + close can both fire)
    record.endedAt = new Date().toISOString();
    if (note) out.write(`\n${note}\n`);
    // The final status flips only after the output file has fully flushed,
    // so anyone who sees a non-running status can safely read the output.
    out.end(() => {
      record.status = status;
      record.exitCode = exitCode;
      try {
        fs.appendFileSync(path.join(this.runsDir(), 'log.jsonl'), JSON.stringify(record) + '\n');
      } catch {}
    });
  }

  listRuns() {
    const persisted = [];
    try {
      for (const line of fs.readFileSync(path.join(this.runsDir(), 'log.jsonl'), 'utf8').trim().split('\n')) {
        try {
          persisted.push(JSON.parse(line));
        } catch {}
      }
    } catch {}
    const running = [...this.records.values()].filter((r) => r.status === 'running');
    return [...running, ...persisted.reverse()].slice(0, 50);
  }

  getRun(id) {
    if (!ID_PATTERN.test(id)) return null;
    const run = this.records.get(id) || this.listRuns().find((r) => r.id === id) || null;
    if (!run) return null;
    let output = '';
    try {
      output = fs.readFileSync(path.join(this.runsDir(), `${id}.txt`), 'utf8');
    } catch {}
    return { run, output };
  }
}

module.exports = { Runner, MAX_CONCURRENT };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/ui-runner.test.js`
Expected: 5 passing tests, `fail 0`. (Windows note: SIGTERM on Windows force-kills the child; the timeout test still sees status `timeout` because the status is set before killing.)

- [ ] **Step 5: Commit**

```bash
git add ui/runner.js tests/ui-runner.test.js
git commit -m "feat: add dashboard runner spawning headless claude with run persistence"
```

---

### Task 3: Server (`ui/server.js`) with placeholder page

**Files:**
- Create: `tests/ui-server.test.js`
- Create: `ui/server.js`
- Create: `ui/index.html` (placeholder — Task 4 replaces it with the real page)

**Interfaces:**
- Consumes: everything from Tasks 1-2 (`data.readStatus/readButtons/readSessions/readMemory/findButton`, `new Runner(...)`, `runner.startRun/listRuns/getRun`).
- Produces: `createServer({agentHome, pluginRoot, runner}) -> http.Server` (exported for tests); `HOST` export (`'127.0.0.1'`). Script mode: listens on `AGENTICOS_PORT || 4517`, EADDRINUSE → stderr message naming the port and env override, exit 1. Routes exactly as in the spec.

- [ ] **Step 1: Write the failing integration test**

Create `tests/ui-server.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createServer } = require('../ui/server.js');
const { Runner } = require('../ui/runner.js');

const PLUGIN_ROOT = path.resolve(__dirname, '..');

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'agenticos-srv-'));
}

const FAKE = path.join(tempDir(), 'fake-claude.js');
fs.writeFileSync(
  FAKE,
  [
    "const i = process.argv.indexOf('-p');",
    "process.stdout.write('RAN:' + (process.argv[i + 1] || ''));",
    'process.exit(0);',
  ].join('\n')
);

async function waitForRun(base, runId, timeoutMs = 8000) {
  const started = Date.now();
  for (;;) {
    const { run } = await (await fetch(`${base}/api/runs/${runId}`)).json();
    if (run.status !== 'running') return run;
    if (Date.now() - started > timeoutMs) throw new Error('run did not finish');
    await new Promise((r) => setTimeout(r, 50));
  }
}

test('server serves the page, all GET endpoints, and executes a run end-to-end', async () => {
  const home = tempDir();
  const runner = new Runner({ agentHome: home, bin: process.execPath, binArgs: [FAKE] });
  const server = createServer({ agentHome: home, pluginRoot: PLUGIN_ROOT, runner });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const page = await (await fetch(`${base}/`)).text();
    assert.ok(page.includes('AgenticOS'));

    const status = await (await fetch(`${base}/api/status`)).json();
    assert.match(status.version, /^\d+\.\d+\.\d+$/);

    const buttons = await (await fetch(`${base}/api/buttons`)).json();
    assert.strictEqual(buttons.groups[0].name, 'Syscalls');
    assert.ok(buttons.groups[0].buttons.length >= 5);

    const sessions = await (await fetch(`${base}/api/sessions`)).json();
    assert.deepStrictEqual(sessions.entries, []);

    const memory = await (await fetch(`${base}/api/memory`)).json();
    assert.deepStrictEqual(memory, []);

    const post = await fetch(`${base}/api/run`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ buttonId: 'example:deep-research', input: 'test topic' }),
    });
    assert.strictEqual(post.status, 200);
    const { runId } = await post.json();
    const run = await waitForRun(base, runId);
    assert.strictEqual(run.status, 'done');
    const { output } = await (await fetch(`${base}/api/runs/${runId}`)).json();
    assert.ok(output.includes('test topic'));

    const runsList = await (await fetch(`${base}/api/runs`)).json();
    assert.ok(runsList.some((r) => r.id === runId));
  } finally {
    server.close();
  }
});

test('server returns clean errors: bad body, unknown button, unknown run, unknown route', async () => {
  const home = tempDir();
  const runner = new Runner({ agentHome: home, bin: process.execPath, binArgs: [FAKE] });
  const server = createServer({ agentHome: home, pluginRoot: PLUGIN_ROOT, runner });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.strictEqual((await fetch(`${base}/api/run`, { method: 'POST', body: 'not json' })).status, 400);
    assert.strictEqual(
      (await fetch(`${base}/api/run`, { method: 'POST', body: JSON.stringify({ buttonId: 'nope' }) })).status,
      400
    );
    assert.strictEqual((await fetch(`${base}/api/runs/no-such-run`)).status, 404);
    assert.strictEqual((await fetch(`${base}/api/nope`)).status, 404);
  } finally {
    server.close();
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/ui-server.test.js`
Expected: FAIL with `Cannot find module '../ui/server.js'`.

- [ ] **Step 3: Implement ui/server.js and the placeholder page**

Create `ui/index.html` (placeholder; Task 4 replaces it):

```html
<h1>AgenticOS dashboard</h1>
<p>Placeholder page — replaced in Task 4.</p>
```

Create `ui/server.js`:

```js
'use strict';

// AgenticOS dashboard server. Binds 127.0.0.1 ONLY — this is a local,
// single-user tool; never expose it on 0.0.0.0.

const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const data = require('./data.js');
const { Runner } = require('./runner.js');

const HOST = '127.0.0.1';
const DEFAULT_PORT = 4517;
const MAX_BODY_BYTES = 64 * 1024;
const RUN_PATH = /^\/api\/runs\/([A-Za-z0-9-]+)$/;

function json(res, code, body) {
  res.writeHead(code, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > MAX_BODY_BYTES) {
        reject(new Error('body too large'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function createServer(opts = {}) {
  const agentHome = opts.agentHome || path.join(os.homedir(), '.claude', 'agenticos');
  const pluginRoot = opts.pluginRoot || path.resolve(__dirname, '..');
  const runner = opts.runner || new Runner({ agentHome });

  async function route(req, res) {
    const pathname = new URL(req.url, `http://${HOST}`).pathname;
    if (req.method === 'GET' && pathname === '/') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(fs.readFileSync(path.join(__dirname, 'index.html')));
      return;
    }
    if (req.method === 'GET' && pathname === '/api/status') {
      return json(res, 200, data.readStatus(agentHome, pluginRoot));
    }
    if (req.method === 'GET' && pathname === '/api/buttons') {
      return json(res, 200, data.readButtons(agentHome, pluginRoot));
    }
    if (req.method === 'GET' && pathname === '/api/sessions') {
      return json(res, 200, data.readSessions(agentHome));
    }
    if (req.method === 'GET' && pathname === '/api/memory') {
      return json(res, 200, data.readMemory(agentHome));
    }
    if (req.method === 'GET' && pathname === '/api/runs') {
      return json(res, 200, runner.listRuns());
    }
    const runMatch = pathname.match(RUN_PATH);
    if (req.method === 'GET' && runMatch) {
      const result = runner.getRun(runMatch[1]);
      return result ? json(res, 200, result) : json(res, 404, { error: 'run not found' });
    }
    if (req.method === 'POST' && pathname === '/api/run') {
      let payload;
      try {
        payload = JSON.parse(await readBody(req));
      } catch {
        return json(res, 400, { error: 'invalid JSON body' });
      }
      const buttons = data.readButtons(agentHome, pluginRoot);
      const button = data.findButton(buttons, String(payload.buttonId || ''));
      if (!button) return json(res, 400, { error: 'unknown buttonId' });
      const result = runner.startRun(button, payload.input, buttons.workdir);
      if (result.error === 'too-many-runs') {
        return json(res, 429, { error: 'too many concurrent runs' });
      }
      return json(res, 200, { runId: result.id });
    }
    json(res, 404, { error: 'not found' });
  }

  return http.createServer((req, res) => {
    Promise.resolve()
      .then(() => route(req, res))
      .catch((err) => json(res, 500, { error: err.message }));
  });
}

function main() {
  const port = Number(process.env.AGENTICOS_PORT) || DEFAULT_PORT;
  const server = createServer();
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      process.stderr.write(
        `agenticos dashboard: port ${port} is already in use. Set AGENTICOS_PORT to use another port.\n`
      );
      process.exit(1);
    }
    throw err;
  });
  server.listen(port, HOST, () => {
    process.stdout.write(`AgenticOS dashboard running at http://${HOST}:${port}\n`);
  });
}

module.exports = { createServer, HOST };

if (require.main === module) {
  main();
}
```

- [ ] **Step 4: Run the full suite**

Run: `node --test tests/`
Expected: all tests pass (65 + 9 + 5 + 2 = 81), `fail 0`.

- [ ] **Step 5: Commit**

```bash
git add ui/server.js ui/index.html tests/ui-server.test.js
git commit -m "feat: add dashboard server with json api and run endpoint"
```

---

### Task 4: The page (`ui/index.html`)

**Files:**
- Modify: `ui/index.html` (replace the placeholder entirely)

**Interfaces:**
- Consumes: the JSON API from Task 3 exactly as specified (`/api/status`, `/api/buttons`, `/api/sessions`, `/api/memory`, `/api/runs`, `/api/runs/<id>`, `POST /api/run`).
- Produces: the complete single-file page. Constraints: inline CSS/JS only, no external requests, must contain the literal text `AgenticOS` (the server test asserts it).

- [ ] **Step 1: Replace ui/index.html with the full page**

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>AgenticOS</title>
<style>
  :root {
    --bg: #0f1115; --panel: #171a21; --border: #262b36; --text: #d7dde7;
    --dim: #8b95a7; --accent: #5b9dd9; --ok: #4caf7d; --err: #d9695b; --warn: #d9b95b;
  }
  * { box-sizing: border-box; margin: 0; }
  body { background: var(--bg); color: var(--text); font: 14px/1.5 system-ui, sans-serif; }
  header { display: flex; align-items: baseline; gap: 12px; padding: 16px 24px; border-bottom: 1px solid var(--border); }
  header h1 { font-size: 18px; }
  header .dim { color: var(--dim); font-size: 12px; }
  main { display: grid; grid-template-columns: 1fr 380px; gap: 16px; padding: 16px 24px; max-width: 1400px; }
  @media (max-width: 900px) { main { grid-template-columns: 1fr; } }
  .panel { background: var(--panel); border: 1px solid var(--border); border-radius: 8px; padding: 14px; margin-bottom: 16px; }
  .panel h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .08em; color: var(--dim); margin-bottom: 10px; }
  .banner { background: #3a2422; border: 1px solid var(--err); border-radius: 8px; padding: 10px 14px; margin-bottom: 16px; display: none; }
  .domain { margin-bottom: 14px; }
  .domain h3 { font-size: 12px; color: var(--dim); margin-bottom: 8px; }
  .grid { display: flex; flex-wrap: wrap; gap: 8px; }
  button.launch { background: #1e2430; color: var(--text); border: 1px solid var(--border); border-radius: 6px; padding: 8px 14px; cursor: pointer; font: inherit; }
  button.launch:hover { border-color: var(--accent); }
  button.launch.busy { opacity: .5; cursor: wait; }
  .inputrow { display: none; gap: 8px; margin-top: 8px; width: 100%; }
  .inputrow input { flex: 1; background: #10141b; border: 1px solid var(--border); border-radius: 6px; color: var(--text); padding: 8px 10px; font: inherit; }
  .inputrow button { background: var(--accent); border: 0; border-radius: 6px; color: #0f1115; padding: 8px 14px; cursor: pointer; font: inherit; }
  ul { list-style: none; }
  li { padding: 6px 0; border-bottom: 1px solid var(--border); font-size: 13px; }
  li:last-child { border-bottom: 0; }
  .dim { color: var(--dim); }
  .status-done { color: var(--ok); }
  .status-error, .status-timeout { color: var(--err); }
  .status-running { color: var(--warn); }
  .run { cursor: pointer; }
  #output { white-space: pre-wrap; background: #10141b; border: 1px solid var(--border); border-radius: 6px; padding: 10px; max-height: 320px; overflow: auto; font: 12px/1.5 ui-monospace, monospace; display: none; }
  dl { display: grid; grid-template-columns: auto 1fr; gap: 2px 12px; font-size: 13px; }
  dt { color: var(--dim); }
</style>
</head>
<body>
<header>
  <h1>AgenticOS</h1>
  <span class="dim" id="version"></span>
  <span class="dim">127.0.0.1 · local only</span>
</header>
<main>
  <section>
    <div class="banner" id="banner"></div>
    <div class="panel">
      <h2>Launcher</h2>
      <div id="domains"></div>
    </div>
    <div class="panel">
      <h2>Run output</h2>
      <div id="output"></div>
      <p class="dim" id="output-hint">Click a run in the Runs panel to see its output.</p>
    </div>
  </section>
  <aside>
    <div class="panel"><h2>Status</h2><dl id="status"></dl></div>
    <div class="panel"><h2>Runs</h2><ul id="runs"></ul></div>
    <div class="panel"><h2>Sessions</h2><ul id="sessions"></ul></div>
    <div class="panel"><h2>Memory</h2><ul id="memory"></ul></div>
  </aside>
</main>
<script>
'use strict';
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let watching = null;

async function api(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.json();
}

async function refreshStatus() {
  const s = await api('/api/status');
  $('version').textContent = 'v' + s.version;
  $('status').innerHTML =
    `<dt>Kernel</dt><dd>${s.kernelModules} modules</dd>` +
    `<dt>Daemons</dt><dd>${s.daemons.map(esc).join(', ') || '—'}</dd>` +
    `<dt>Memory</dt><dd>${s.filesystem.memoryOk ? s.filesystem.factCount + ' facts' : 'not initialized'}</dd>` +
    `<dt>Sessions</dt><dd>${s.filesystem.sessionCount} records</dd>`;
}

async function refreshButtons() {
  const b = await api('/api/buttons');
  const banner = $('banner');
  banner.style.display = b.configError ? 'block' : 'none';
  banner.textContent = b.configError || '';
  $('domains').innerHTML = b.groups
    .map(
      (g) =>
        `<div class="domain"><h3>${esc(g.name)}</h3><div class="grid">` +
        g.buttons
          .map(
            (btn) =>
              `<button class="launch" data-id="${esc(btn.id)}" data-input="${btn.input}" title="${esc(btn.description)}">${esc(btn.label)}</button>` +
              (btn.input
                ? `<span class="inputrow" data-for="${esc(btn.id)}"><input placeholder="input…"><button>Run</button></span>`
                : '')
          )
          .join('') +
        `</div></div>`
    )
    .join('');
}

async function refreshRuns() {
  const runs = await api('/api/runs');
  $('runs').innerHTML = runs
    .map(
      (r) =>
        `<li class="run" data-id="${esc(r.id)}"><span class="status-${esc(r.status)}">●</span> ` +
        `${esc(r.label)} <span class="dim">${esc(r.input)} · ${esc(r.status)} · ${esc((r.startedAt || '').slice(11, 19))}</span></li>`
    )
    .join('') || '<li class="dim">No runs yet.</li>';
}

async function refreshSessions() {
  const s = await api('/api/sessions');
  $('sessions').innerHTML =
    s.entries
      .slice(0, 10)
      .map((e) => `<li>${esc((e.date || '').slice(0, 16))} <span class="dim">${esc(e.cwd || '')} · ${esc(e.reason || '')}</span></li>`)
      .join('') +
    s.snapshots.slice(0, 5).map((f) => `<li class="dim">📄 ${esc(f)}</li>`).join('') || '<li class="dim">No sessions yet.</li>';
}

async function refreshMemory() {
  const facts = await api('/api/memory');
  $('memory').innerHTML =
    facts.map((f) => `<li title="${esc(f.file)}">${esc(f.title)} <span class="dim">${esc(f.hook)}</span></li>`).join('') ||
    '<li class="dim">No facts yet.</li>';
}

async function startRun(id, input) {
  const res = await fetch('/api/run', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ buttonId: id, input }),
  });
  const body = await res.json();
  if (!res.ok) {
    $('banner').style.display = 'block';
    $('banner').textContent = body.error || 'run failed to start';
    return;
  }
  watch(body.runId);
  refreshRuns();
}

async function watch(runId) {
  watching = runId;
  $('output').style.display = 'block';
  $('output-hint').style.display = 'none';
  for (;;) {
    if (watching !== runId) return;
    const { run, output } = await api('/api/runs/' + runId);
    $('output').textContent = `[${run.label}] ${run.status}\n\n${output}`;
    if (run.status !== 'running') {
      refreshRuns();
      return;
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
}

document.addEventListener('click', (ev) => {
  const launch = ev.target.closest('button.launch');
  if (launch) {
    const id = launch.dataset.id;
    if (launch.dataset.input === 'true') {
      const row = document.querySelector(`.inputrow[data-for="${CSS.escape(id)}"]`);
      row.style.display = row.style.display === 'flex' ? 'none' : 'flex';
      row.querySelector('input').focus();
    } else {
      startRun(id, '');
    }
    return;
  }
  const row = ev.target.closest('.inputrow');
  if (row && ev.target.tagName === 'BUTTON') {
    startRun(row.dataset.for, row.querySelector('input').value);
    return;
  }
  const runItem = ev.target.closest('li.run');
  if (runItem) watch(runItem.dataset.id);
});

document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Enter' && ev.target.matches('.inputrow input')) {
    const row = ev.target.closest('.inputrow');
    startRun(row.dataset.for, ev.target.value);
  }
});

function refreshAll() {
  refreshStatus().catch(() => {});
  refreshRuns().catch(() => {});
  refreshSessions().catch(() => {});
  refreshMemory().catch(() => {});
}
refreshButtons().catch(() => {});
refreshAll();
setInterval(refreshAll, 30000);
</script>
</body>
</html>
```

- [ ] **Step 2: Run the full suite (the server test asserts the page still contains "AgenticOS")**

Run: `node --test tests/`
Expected: all tests pass, `fail 0`.

- [ ] **Step 3: Manual smoke check**

Run: `node ui/server.js` — expect `AgenticOS dashboard running at http://127.0.0.1:4517`. Open the URL in a browser: header shows the version; Launcher shows Syscalls + Examples groups; widgets render (possibly empty). Stop the server (Ctrl+C). If a browser isn't available in this environment, `curl http://127.0.0.1:4517/` and confirm the HTML contains `Launcher`, then stop the server.

- [ ] **Step 4: Commit**

```bash
git add ui/index.html
git commit -m "feat: add self-contained dashboard page with launcher and widgets"
```

---

### Task 5: `/dashboard` syscall, README, version bump

**Files:**
- Create: `commands/dashboard.md`
- Modify: `tests/commands.test.js` (EXPECTED list gains `dashboard.md`)
- Modify: `README.md` (add Dashboard section after Quick start; update metaphor table)
- Modify: `docs/architecture.md` (add Dashboard paragraph under Subsystems)
- Modify: `.claude-plugin/plugin.json` (version `0.1.0` → `0.2.0`)
- Modify: `package.json` (version `0.1.0` → `0.2.0`)

**Interfaces:**
- Consumes: `ui/server.js` launch behavior (port 4517, `AGENTICOS_PORT`) from Task 3; `tests/commands.test.js` structure from v0.1 (EXPECTED array + per-file frontmatter test).
- Produces: the released v0.2.0 surface. Note: `ui/data.js` (Task 1) already excludes `dashboard.md` from button discovery.

- [ ] **Step 1: Update the commands test (RED first)**

In `tests/commands.test.js`, change the EXPECTED array:

```js
const EXPECTED = ['boot.md', 'ps.md', 'save.md', 'resume.md', 'review.md', 'dashboard.md'];
```

Run: `node --test tests/commands.test.js`
Expected: FAIL — the file-list test reports `dashboard.md` missing.

- [ ] **Step 2: Create commands/dashboard.md**

```markdown
---
description: Launch the AgenticOS dashboard (local web UI on 127.0.0.1)
---

Launch the AgenticOS dashboard:

1. Determine the port: the `AGENTICOS_PORT` environment variable if set,
   otherwise 4517.
2. Check whether it is already running: request
   `http://127.0.0.1:<port>/api/status`. If it responds, report the URL
   and stop — do not start a second server.
3. Otherwise locate the AgenticOS plugin root (the directory containing
   `ui/server.js`) and start the server as a background process:
   `node <pluginRoot>/ui/server.js`.
4. Confirm it came up (the status endpoint responds), then report:
   - the URL `http://127.0.0.1:<port>`
   - that it binds to localhost only and is not reachable from the network
   - that custom buttons live in `~/.claude/agenticos/dashboard.json`
   - how to stop it (kill the background node process).
```

Run: `node --test tests/commands.test.js`
Expected: PASS (7 tests: file list + 6 per-file checks).

- [ ] **Step 3: Bump versions**

In `.claude-plugin/plugin.json` and `package.json`, change `"version": "0.1.0"` to `"version": "0.2.0"`.

- [ ] **Step 4: Update README.md**

In the metaphor table, change the Drivers row to stay last and insert above it:

```markdown
| Monitor | `ui/` dashboard | Local web UI: run buttons + observability |
```

After the "Quick start" section, insert (note: the outer fence here is four
backticks because the snippet itself contains a three-backtick block):

````markdown
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
````

- [ ] **Step 5: Update docs/architecture.md**

Under `## Subsystems`, append:

```markdown
- **Monitor** (`ui/`) — the dashboard: `server.js` (127.0.0.1-only HTTP,
  JSON API), `data.js` (fail-soft readers + button merge), `runner.js`
  (headless `claude -p` runs, persisted to `~/.claude/agenticos/runs/`),
  `index.html` (single self-contained page). Launched by the `/dashboard`
  syscall.
```

- [ ] **Step 6: Run the full suite**

Run: `node --test tests/`
Expected: all tests pass, `fail 0`. (`tests/ui-data.test.js` still passes: `dashboard.md` is excluded from button discovery.)

- [ ] **Step 7: Commit**

```bash
git add commands/dashboard.md tests/commands.test.js README.md docs/architecture.md .claude-plugin/plugin.json package.json
git commit -m "feat: add /dashboard syscall, docs, and v0.2.0 version bump"
```

---

## Verification checklist (after all tasks)

- [ ] `node --test tests/` — everything green (81+ tests).
- [ ] `node ui/server.js` serves a working dashboard; syscall + example buttons render; widgets render.
- [ ] `~/.claude/agenticos/dashboard.json` is auto-created on first launch with the Examples domain.
- [ ] A custom button run appears in the Runs widget with its output (requires a real `claude` on PATH, or set `AGENTICOS_CLAUDE_BIN`).
- [ ] Push to GitHub; CI green.
