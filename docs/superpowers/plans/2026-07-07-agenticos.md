# AgenticOS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build AgenticOS v0.1.0 — a Claude Code plugin that layers an OS architecture (kernel rules, process subagents, daemon hooks, syscall commands, memory filesystem) over Claude Code, installable via a self-hosted plugin marketplace.

**Architecture:** Everything ships inside one plugin repo. A `SessionStart` hook (boot daemon) injects the kernel rules and memory index into context and lazily creates `~/.claude/agenticos/`. A `PreToolUse` hook (guard) denies an exact-match list of catastrophic Bash commands. A `SessionEnd` hook logs session records. Subagents and slash commands are plain markdown files picked up by the plugin system.

**Tech Stack:** Node.js (CommonJS) for hook scripts, `node:test` + `node:assert` for tests (zero dependencies), GitHub Actions for CI. No build step.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-07-agentic-os-design.md` (approved).
- Plugin name is exactly `agenticos`; version starts at `0.1.0`.
- Kernel is exactly 4 files in `kernel/`; total across them ≤ 150 lines (enforced by test).
- Hook scripts are CommonJS `.js`, runnable by bare `node`, no npm dependencies anywhere (`package.json` has no `dependencies`/`devDependencies`).
- boot and session-log daemons fail **open** (session must never break); guard denies **only** its exact-match patterns — no fuzzy heuristics.
- All hook commands in `hooks/hooks.json` must use `${CLAUDE_PLUGIN_ROOT}` and quote the path.
- Test command everywhere: `node --test tests/` (also wired as `npm test`).
- Commit messages: conventional commits, no attribution footer (user has attribution disabled globally).

---

### Task 1: Plugin manifests and repo scaffolding

**Files:**
- Create: `tests/manifest.test.js`
- Create: `.claude-plugin/plugin.json`
- Create: `.claude-plugin/marketplace.json`
- Create: `package.json`
- Create: `.gitignore`
- Create: `LICENSE`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: `.claude-plugin/plugin.json` with `name: "agenticos"`, `version: "0.1.0"`; repo-root test layout under `tests/`; `npm test` → `node --test tests/`. Later tasks add more test files to `tests/` and rely on `package.json` existing.

- [ ] **Step 1: Write the failing test**

Create `tests/manifest.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

test('plugin.json has required fields', () => {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(ROOT, '.claude-plugin', 'plugin.json'), 'utf8')
  );
  assert.strictEqual(manifest.name, 'agenticos');
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  assert.ok(manifest.description.length > 0, 'description must be non-empty');
});

test('marketplace.json lists the agenticos plugin from repo root', () => {
  const market = JSON.parse(
    fs.readFileSync(path.join(ROOT, '.claude-plugin', 'marketplace.json'), 'utf8')
  );
  assert.strictEqual(market.name, 'agenticos');
  assert.ok(market.owner, 'owner must be present');
  assert.strictEqual(market.plugins.length, 1);
  assert.strictEqual(market.plugins[0].name, 'agenticos');
  assert.strictEqual(market.plugins[0].source, './');
});

test('package.json declares no dependencies', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.strictEqual(pkg.dependencies, undefined);
  assert.strictEqual(pkg.devDependencies, undefined);
  assert.strictEqual(pkg.scripts.test, 'node --test tests/');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/`
Expected: 3 failing tests, each with `ENOENT: no such file or directory` (plugin.json / marketplace.json / package.json missing).

- [ ] **Step 3: Create the manifests**

Create `.claude-plugin/plugin.json`:

```json
{
  "name": "agenticos",
  "version": "0.1.0",
  "description": "An operating system for Claude Code: kernel rules, process subagents, daemon hooks, syscall commands, and a persistent memory filesystem.",
  "author": {
    "name": "AgenticOS contributors"
  }
}
```

Create `.claude-plugin/marketplace.json`:

```json
{
  "name": "agenticos",
  "owner": {
    "name": "AgenticOS contributors"
  },
  "plugins": [
    {
      "name": "agenticos",
      "source": "./",
      "description": "An operating system for Claude Code: kernel rules, process subagents, daemon hooks, syscall commands, and a persistent memory filesystem."
    }
  ]
}
```

Create `package.json`:

```json
{
  "name": "agenticos",
  "version": "0.1.0",
  "private": true,
  "description": "An operating system for Claude Code.",
  "license": "MIT",
  "scripts": {
    "test": "node --test tests/"
  }
}
```

Create `.gitignore`:

```
node_modules/
*.log
.DS_Store
```

Create `LICENSE` with the standard MIT license text, copyright line:
`Copyright (c) 2026 AgenticOS contributors`

```
MIT License

Copyright (c) 2026 AgenticOS contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/`
Expected: `pass 3`, `fail 0`.

- [ ] **Step 5: Commit**

```bash
git add .claude-plugin package.json .gitignore LICENSE tests/manifest.test.js
git commit -m "feat: scaffold agenticos plugin manifests and test harness"
```

---

### Task 2: Kernel rule files

**Files:**
- Create: `tests/kernel.test.js`
- Create: `kernel/00-core.md`
- Create: `kernel/10-workflow.md`
- Create: `kernel/20-safety.md`
- Create: `kernel/30-memory.md`

**Interfaces:**
- Consumes: nothing.
- Produces: `kernel/` directory containing exactly four `.md` files, ≤ 150 total lines. Task 4's `boot.js` reads `kernel/*.md` sorted by filename and concatenates them.

- [ ] **Step 1: Write the failing test**

Create `tests/kernel.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const KERNEL = path.resolve(__dirname, '..', 'kernel');
const EXPECTED_FILES = ['00-core.md', '10-workflow.md', '20-safety.md', '30-memory.md'];

test('kernel contains exactly the four rule modules', () => {
  const files = fs.readdirSync(KERNEL).filter((f) => f.endsWith('.md')).sort();
  assert.deepStrictEqual(files, EXPECTED_FILES);
});

test('kernel stays within the 150-line budget', () => {
  const total = EXPECTED_FILES.map((f) =>
    fs.readFileSync(path.join(KERNEL, f), 'utf8').split('\n').length
  ).reduce((a, b) => a + b, 0);
  assert.ok(total <= 150, `kernel is ${total} lines; budget is 150`);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/kernel.test.js`
Expected: FAIL with `ENOENT ... kernel` (directory does not exist).

- [ ] **Step 3: Write the kernel files**

Create `kernel/00-core.md`:

```markdown
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
```

Create `kernel/10-workflow.md`:

```markdown
# AgenticOS Kernel — Workflow

Development loop for any non-trivial change:

1. **Understand** — read the relevant code before proposing changes; search
   for existing implementations before writing new ones.
2. **Plan** — for multi-file work, dispatch the `planner` process and confirm
   the plan with the user before implementing.
3. **Implement with tests** — write the failing test first, then the minimal
   implementation that passes. Keep functions small and files focused.
4. **Review** — dispatch the `reviewer` process on the diff; fix CRITICAL and
   HIGH findings before calling the work done.
5. **Commit** — small, frequent commits in conventional-commit form
   (`feat:`, `fix:`, `docs:`, `test:`, `chore:`, `refactor:`).

Skip steps only when the change is trivial (single file, no behavior
change) — and say so explicitly.
```

Create `kernel/20-safety.md`:

```markdown
# AgenticOS Kernel — Safety

- Never hardcode secrets. Use environment variables; flag any credential
  found in code or logs.
- Confirm before destructive or hard-to-reverse operations: deleting files,
  rewriting git history, pushing to shared branches.
- Validate input at system boundaries; never trust external data.
- Report failures honestly: failing tests, skipped steps, and partial work
  are stated plainly, never glossed over.
```

Create `kernel/30-memory.md`:

```markdown
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/`
Expected: all tests pass (manifest + kernel), `fail 0`.

- [ ] **Step 5: Commit**

```bash
git add kernel tests/kernel.test.js
git commit -m "feat: add kernel rule modules within 150-line budget"
```

---

### Task 3: Guard daemon (PreToolUse hook)

**Files:**
- Create: `tests/guard.test.js`
- Create: `hooks/guard.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `hooks/guard.js` exporting `classifyCommand(command: string) -> {deny: boolean, reason: string|null}` and `isRootPath(token: string) -> boolean`. As a script it reads the PreToolUse JSON payload on stdin (`{tool_input: {command}}`) and, on deny, prints `{"hookSpecificOutput": {"hookEventName": "PreToolUse", "permissionDecision": "deny", "permissionDecisionReason": "..."}}` to stdout; otherwise prints nothing. Always exits 0. Task 6 registers it in `hooks.json`.

- [ ] **Step 1: Write the failing tests (both directions, table-driven)**

Create `tests/guard.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { classifyCommand } = require('../hooks/guard.js');

const DENIED = [
  'rm -rf /',
  'rm -fr /',
  'sudo rm -rf /',
  'rm -r -f /',
  'rm -rf C:\\',
  'rm -rf D:/',
  'git push --force origin main',
  'git push -f origin master',
  'git push origin main --force',
  'git reset --hard origin/main',
  'git reset --hard origin/release',
];

const ALLOWED = [
  'rm -rf ./build',
  'rm -rf node_modules',
  'rm -f /tmp/x.lock',
  'rm file.txt',
  'git push --force-with-lease origin main',
  'git push --force origin feature/guard',
  'git push origin main',
  'git reset --hard HEAD~1',
  'git reset --hard',
  'ls -la',
  '',
];

for (const cmd of DENIED) {
  test(`denies: ${cmd}`, () => {
    const verdict = classifyCommand(cmd);
    assert.strictEqual(verdict.deny, true);
    assert.ok(verdict.reason && verdict.reason.length > 0, 'deny must carry a reason');
  });
}

for (const cmd of ALLOWED) {
  test(`allows: ${JSON.stringify(cmd)}`, () => {
    assert.strictEqual(classifyCommand(cmd).deny, false);
  });
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/guard.test.js`
Expected: FAIL with `Cannot find module '../hooks/guard.js'`.

- [ ] **Step 3: Implement guard.js**

Create `hooks/guard.js`:

```js
'use strict';

// AgenticOS guard daemon: denies an exact-match list of catastrophic
// commands. Anything not matched passes through untouched (exit 0, no output).

function isRootPath(token) {
  return token === '/' || /^[A-Za-z]:[\\/]?$/.test(token);
}

function tokens(cmd) {
  return cmd.trim().split(/\s+/);
}

function checkRmRoot(cmd) {
  const parts = tokens(cmd);
  const i = parts.indexOf('rm');
  if (i === -1) return false;
  const rest = parts.slice(i + 1);
  const flags = rest.filter((t) => t.startsWith('-')).join('');
  const targets = rest.filter((t) => !t.startsWith('-'));
  const recursive = flags.includes('r') || flags.includes('R');
  const force = flags.includes('f');
  return recursive && force && targets.some(isRootPath);
}

function checkForcePushProtected(cmd) {
  const parts = tokens(cmd);
  const gi = parts.indexOf('git');
  if (gi === -1 || parts[gi + 1] !== 'push') return false;
  const rest = parts.slice(gi + 2);
  const force = rest.some((t) => t === '--force' || t === '-f');
  const protectedRef = rest.some(
    (t) => t === 'main' || t === 'master' || t.endsWith(':main') || t.endsWith(':master')
  );
  return force && protectedRef;
}

function checkHardResetRemote(cmd) {
  const parts = tokens(cmd);
  const gi = parts.indexOf('git');
  if (gi === -1 || parts[gi + 1] !== 'reset') return false;
  const rest = parts.slice(gi + 2);
  return rest.includes('--hard') && rest.some((t) => t.startsWith('origin/'));
}

function classifyCommand(command) {
  if (typeof command !== 'string' || command.trim() === '') {
    return { deny: false, reason: null };
  }
  if (checkRmRoot(command)) {
    return { deny: true, reason: 'AgenticOS guard: rm -rf targeting a filesystem root is blocked.' };
  }
  if (checkForcePushProtected(command)) {
    return { deny: true, reason: 'AgenticOS guard: force-pushing to main/master is blocked.' };
  }
  if (checkHardResetRemote(command)) {
    return { deny: true, reason: 'AgenticOS guard: git reset --hard to a remote-tracking ref is blocked.' };
  }
  return { deny: false, reason: null };
}

function main() {
  let input = '';
  process.stdin.on('data', (chunk) => {
    input += chunk;
  });
  process.stdin.on('end', () => {
    let command = '';
    try {
      const payload = JSON.parse(input);
      command = (payload.tool_input && payload.tool_input.command) || '';
    } catch {
      process.exit(0); // malformed payload: fail open
    }
    const verdict = classifyCommand(command);
    if (verdict.deny) {
      process.stdout.write(
        JSON.stringify({
          hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            permissionDecision: 'deny',
            permissionDecisionReason: verdict.reason,
          },
        })
      );
    }
    process.exit(0);
  });
}

module.exports = { classifyCommand, isRootPath };

if (require.main === module) {
  main();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/guard.test.js`
Expected: 22 passing tests (11 deny + 11 allow), `fail 0`.

- [ ] **Step 5: Add an end-to-end stdin test for the deny path**

Append to `tests/guard.test.js`:

```js
const { execFileSync } = require('node:child_process');
const path = require('node:path');

test('script emits a PreToolUse deny for a blocked command', () => {
  const out = execFileSync(
    process.execPath,
    [path.resolve(__dirname, '..', 'hooks', 'guard.js')],
    { input: JSON.stringify({ tool_input: { command: 'rm -rf /' } }) }
  ).toString();
  const parsed = JSON.parse(out);
  assert.strictEqual(parsed.hookSpecificOutput.permissionDecision, 'deny');
});

test('script stays silent for an ordinary command', () => {
  const out = execFileSync(
    process.execPath,
    [path.resolve(__dirname, '..', 'hooks', 'guard.js')],
    { input: JSON.stringify({ tool_input: { command: 'ls -la' } }) }
  ).toString();
  assert.strictEqual(out, '');
});
```

- [ ] **Step 6: Run the full suite**

Run: `node --test tests/`
Expected: all tests pass, `fail 0`.

- [ ] **Step 7: Commit**

```bash
git add hooks/guard.js tests/guard.test.js
git commit -m "feat: add guard daemon denying catastrophic bash commands"
```

---

### Task 4: Boot daemon (SessionStart hook)

**Files:**
- Create: `tests/boot.test.js`
- Create: `hooks/boot.js`

**Interfaces:**
- Consumes: `kernel/*.md` from Task 2.
- Produces: `hooks/boot.js` exporting `ensureFilesystem(agentHome: string) -> void`, `readKernel(pluginRoot: string) -> string`, and `bootstrap(agentHome: string, pluginRoot: string) -> string` (the context string). As a script it prints `{"hookSpecificOutput": {"hookEventName": "SessionStart", "additionalContext": "<kernel + memory index>"}}` and always exits 0. Task 6 registers it; the `/boot` command (Task 8) relies on the directories it creates.

- [ ] **Step 1: Write the failing tests**

Create `tests/boot.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { bootstrap, ensureFilesystem } = require('../hooks/boot.js');

const PLUGIN_ROOT = path.resolve(__dirname, '..');

function tempHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'agenticos-test-'));
}

test('first boot creates the memory filesystem', () => {
  const home = tempHome();
  ensureFilesystem(home);
  assert.ok(fs.statSync(path.join(home, 'memory')).isDirectory());
  assert.ok(fs.statSync(path.join(home, 'sessions')).isDirectory());
  assert.ok(fs.statSync(path.join(home, 'MEMORY.md')).isFile());
});

test('bootstrap emits kernel rules plus the memory index', () => {
  const home = tempHome();
  const ctx = bootstrap(home, PLUGIN_ROOT);
  assert.ok(ctx.includes('AgenticOS Kernel — Core'), 'kernel core missing');
  assert.ok(ctx.includes('AgenticOS Kernel — Memory'), 'kernel memory missing');
  assert.ok(ctx.includes('## Memory Index'), 'memory index section missing');
});

test('bootstrap does not overwrite an existing memory index', () => {
  const home = tempHome();
  ensureFilesystem(home);
  fs.writeFileSync(path.join(home, 'MEMORY.md'), '- [Fact](memory/fact.md) — kept\n');
  const ctx = bootstrap(home, PLUGIN_ROOT);
  assert.ok(ctx.includes('— kept'), 'existing index content must survive boot');
});

test('bootstrap fails open when the memory home is unusable', () => {
  const home = tempHome();
  // Make MEMORY.md a directory so reading it as a file throws.
  fs.mkdirSync(path.join(home, 'MEMORY.md'), { recursive: true });
  const ctx = bootstrap(home, PLUGIN_ROOT);
  assert.ok(ctx.includes('AgenticOS Kernel — Core'), 'kernel must still be emitted');
  assert.ok(!ctx.includes('## Memory Index'), 'memory section must be omitted on failure');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/boot.test.js`
Expected: FAIL with `Cannot find module '../hooks/boot.js'`.

- [ ] **Step 3: Implement boot.js**

Create `hooks/boot.js`:

```js
'use strict';

// AgenticOS boot daemon: creates the memory filesystem on first run and
// injects kernel rules + memory index as SessionStart context.
// Fails open — a broken memory dir must never brick a session.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const MEMORY_INDEX_HEADER =
  '# AgenticOS Memory Index\n\n' +
  'One line per fact: `- [Title](memory/<file>.md) — one-line hook`\n';

function ensureFilesystem(agentHome) {
  fs.mkdirSync(path.join(agentHome, 'memory'), { recursive: true });
  fs.mkdirSync(path.join(agentHome, 'sessions'), { recursive: true });
  const index = path.join(agentHome, 'MEMORY.md');
  if (!fs.existsSync(index)) {
    fs.writeFileSync(index, MEMORY_INDEX_HEADER);
  }
}

function readKernel(pluginRoot) {
  const kernelDir = path.join(pluginRoot, 'kernel');
  const files = fs
    .readdirSync(kernelDir)
    .filter((f) => f.endsWith('.md'))
    .sort();
  return files
    .map((f) => fs.readFileSync(path.join(kernelDir, f), 'utf8'))
    .join('\n');
}

function bootstrap(agentHome, pluginRoot) {
  const kernel = readKernel(pluginRoot);
  let memoryIndex;
  try {
    ensureFilesystem(agentHome);
    memoryIndex = fs.readFileSync(path.join(agentHome, 'MEMORY.md'), 'utf8');
  } catch (err) {
    process.stderr.write(`agenticos boot: memory unavailable (${err.message}); kernel only\n`);
    return kernel;
  }
  return `${kernel}\n## Memory Index\n\n${memoryIndex}`;
}

function main() {
  let context;
  try {
    const agentHome = path.join(os.homedir(), '.claude', 'agenticos');
    const pluginRoot = path.resolve(__dirname, '..');
    context = bootstrap(agentHome, pluginRoot);
  } catch (err) {
    process.stderr.write(`agenticos boot failed: ${err.message}\n`);
    process.exit(0); // fail open: no context beats a broken session
  }
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext: context,
      },
    })
  );
  process.exit(0);
}

module.exports = { bootstrap, ensureFilesystem, readKernel };

if (require.main === module) {
  main();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/boot.test.js`
Expected: 4 passing tests, `fail 0`. (The fail-open test also prints an `agenticos boot: memory unavailable` warning to stderr — that is expected.)

- [ ] **Step 5: Commit**

```bash
git add hooks/boot.js tests/boot.test.js
git commit -m "feat: add boot daemon injecting kernel and memory index"
```

---

### Task 5: Session-log daemon (SessionEnd hook)

**Files:**
- Create: `tests/session-log.test.js`
- Create: `hooks/session-log.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `hooks/session-log.js` exporting `logSession(agentHome: string, record: object) -> void`, which appends one JSON line to `<agentHome>/sessions/log.jsonl` (creating the directory if needed). As a script it reads the SessionEnd payload (`{session_id, cwd, reason}`) from stdin and logs `{date, session_id, cwd, reason}`. Always exits 0. The `/resume` command (Task 8) reads `sessions/log.jsonl` as its fallback.

- [ ] **Step 1: Write the failing tests**

Create `tests/session-log.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { logSession } = require('../hooks/session-log.js');

function tempHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'agenticos-test-'));
}

test('logSession appends a JSON line, creating sessions/ if needed', () => {
  const home = tempHome();
  logSession(home, { date: '2026-07-07T12:00:00Z', session_id: 'abc', cwd: '/repo', reason: 'exit' });
  logSession(home, { date: '2026-07-07T13:00:00Z', session_id: 'def', cwd: '/repo', reason: 'clear' });
  const lines = fs
    .readFileSync(path.join(home, 'sessions', 'log.jsonl'), 'utf8')
    .trim()
    .split('\n');
  assert.strictEqual(lines.length, 2);
  assert.strictEqual(JSON.parse(lines[0]).session_id, 'abc');
  assert.strictEqual(JSON.parse(lines[1]).reason, 'clear');
});

test('script exits 0 even on malformed stdin', () => {
  const { execFileSync } = require('node:child_process');
  // Throws on non-zero exit; passing means fail-open works.
  execFileSync(process.execPath, [path.resolve(__dirname, '..', 'hooks', 'session-log.js')], {
    input: 'not json',
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/session-log.test.js`
Expected: FAIL with `Cannot find module '../hooks/session-log.js'`.

- [ ] **Step 3: Implement session-log.js**

Create `hooks/session-log.js`:

```js
'use strict';

// AgenticOS session-log daemon: appends a session record on SessionEnd.
// Fails open — logging must never block session shutdown.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function logSession(agentHome, record) {
  const dir = path.join(agentHome, 'sessions');
  fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(path.join(dir, 'log.jsonl'), JSON.stringify(record) + '\n');
}

function main() {
  let input = '';
  process.stdin.on('data', (chunk) => {
    input += chunk;
  });
  process.stdin.on('end', () => {
    try {
      const payload = JSON.parse(input);
      logSession(path.join(os.homedir(), '.claude', 'agenticos'), {
        date: new Date().toISOString(),
        session_id: payload.session_id || 'unknown',
        cwd: payload.cwd || '',
        reason: payload.reason || '',
      });
    } catch (err) {
      process.stderr.write(`agenticos session-log skipped: ${err.message}\n`);
    }
    process.exit(0);
  });
}

module.exports = { logSession };

if (require.main === module) {
  main();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/session-log.test.js`
Expected: 2 passing tests, `fail 0`.

- [ ] **Step 5: Commit**

```bash
git add hooks/session-log.js tests/session-log.test.js
git commit -m "feat: add session-log daemon recording session ends"
```

---

### Task 6: Hook registration (hooks.json)

**Files:**
- Create: `tests/hooks-config.test.js`
- Create: `hooks/hooks.json`

**Interfaces:**
- Consumes: `hooks/boot.js`, `hooks/guard.js`, `hooks/session-log.js` from Tasks 3–5.
- Produces: `hooks/hooks.json` registering the three daemons. Claude Code's plugin system reads this file; every command string uses `node "${CLAUDE_PLUGIN_ROOT}/hooks/<script>.js"`.

- [ ] **Step 1: Write the failing test**

Create `tests/hooks-config.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const CONFIG = path.join(ROOT, 'hooks', 'hooks.json');

function commandsFor(config, event) {
  return (config.hooks[event] || []).flatMap((entry) => entry.hooks.map((h) => h.command));
}

test('hooks.json registers boot, guard, and session-log daemons', () => {
  const config = JSON.parse(fs.readFileSync(CONFIG, 'utf8'));
  assert.strictEqual(commandsFor(config, 'SessionStart').length, 1);
  assert.strictEqual(commandsFor(config, 'PreToolUse').length, 1);
  assert.strictEqual(commandsFor(config, 'SessionEnd').length, 1);
  assert.match(commandsFor(config, 'SessionStart')[0], /boot\.js/);
  assert.match(commandsFor(config, 'PreToolUse')[0], /guard\.js/);
  assert.match(commandsFor(config, 'SessionEnd')[0], /session-log\.js/);
});

test('guard is scoped to the Bash tool only', () => {
  const config = JSON.parse(fs.readFileSync(CONFIG, 'utf8'));
  assert.strictEqual(config.hooks.PreToolUse[0].matcher, 'Bash');
});

test('every hook command uses CLAUDE_PLUGIN_ROOT and points at a real script', () => {
  const config = JSON.parse(fs.readFileSync(CONFIG, 'utf8'));
  for (const event of Object.keys(config.hooks)) {
    for (const command of commandsFor(config, event)) {
      assert.ok(command.includes('${CLAUDE_PLUGIN_ROOT}'), `${command} must use CLAUDE_PLUGIN_ROOT`);
      const script = command.match(/hooks\/([a-z-]+\.js)/)[1];
      assert.ok(fs.existsSync(path.join(ROOT, 'hooks', script)), `${script} missing`);
    }
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/hooks-config.test.js`
Expected: FAIL with `ENOENT ... hooks/hooks.json`.

- [ ] **Step 3: Write hooks.json**

Create `hooks/hooks.json`:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/boot.js\""
          }
        ]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/guard.js\""
          }
        ]
      }
    ],
    "SessionEnd": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/session-log.js\""
          }
        ]
      }
    ]
  }
}
```

- [ ] **Step 4: Run the full suite**

Run: `node --test tests/`
Expected: all tests pass, `fail 0`.

- [ ] **Step 5: Commit**

```bash
git add hooks/hooks.json tests/hooks-config.test.js
git commit -m "feat: register boot, guard, and session-log hooks"
```

---

### Task 7: Process table (subagents)

**Files:**
- Create: `tests/agents.test.js`
- Create: `agents/planner.md`
- Create: `agents/reviewer.md`
- Create: `agents/debugger.md`

**Interfaces:**
- Consumes: nothing.
- Produces: three agent definition files with YAML frontmatter (`name`, `description`, `tools`). The `/review` command (Task 8) dispatches the `reviewer` agent by name; kernel `00-core.md` references all three names.

- [ ] **Step 1: Write the failing test**

Create `tests/agents.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const AGENTS_DIR = path.resolve(__dirname, '..', 'agents');
const EXPECTED = ['planner.md', 'reviewer.md', 'debugger.md'];

function frontmatter(file) {
  const raw = fs.readFileSync(path.join(AGENTS_DIR, file), 'utf8');
  const match = raw.match(/^---\n([\s\S]*?)\n---/);
  assert.ok(match, `${file} must start with YAML frontmatter`);
  const fields = {};
  for (const line of match[1].split('\n')) {
    const idx = line.indexOf(':');
    if (idx > 0) fields[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return fields;
}

test('process table contains exactly planner, reviewer, debugger', () => {
  const files = fs.readdirSync(AGENTS_DIR).filter((f) => f.endsWith('.md')).sort();
  assert.deepStrictEqual(files, [...EXPECTED].sort());
});

for (const file of EXPECTED) {
  test(`${file} has name, description, and tools frontmatter`, () => {
    const fields = frontmatter(file);
    assert.strictEqual(fields.name, file.replace('.md', ''));
    assert.ok(fields.description && fields.description.length > 20);
    assert.ok(fields.tools && fields.tools.includes('Read'));
  });
}

test('planner and reviewer are read-only (no Write or Edit tools)', () => {
  for (const file of ['planner.md', 'reviewer.md']) {
    const fields = frontmatter(file);
    assert.ok(!fields.tools.includes('Write'), `${file} must not have Write`);
    assert.ok(!fields.tools.includes('Edit'), `${file} must not have Edit`);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/agents.test.js`
Expected: FAIL with `ENOENT ... agents` (directory missing).

- [ ] **Step 3: Write the agent definitions**

Create `agents/planner.md`:

```markdown
---
name: planner
description: Implementation planning specialist. Use PROACTIVELY for features or refactors spanning multiple files. Produces a phased plan with risks and file targets. Read-only.
tools: Read, Grep, Glob
---

You are the AgenticOS `planner` process: a senior engineer who turns a task
into a concrete, phased implementation plan. You never modify files.

Process:
1. Read the relevant code first. Map which files the change touches.
2. Identify constraints and risks: APIs, tests, data migrations, unknowns.
3. Break the work into ordered phases. Each phase names exact files, the
   change to make, and how to verify it (test command or manual check).
4. Flag open questions the user must answer instead of guessing.

Output format:
- **Goal** — one sentence.
- **Phases** — numbered; each lists files, changes, verification.
- **Risks** — what could break and how the plan mitigates it.
- **Open questions** — only if genuinely undecidable from the code.
```

Create `agents/reviewer.md`:

```markdown
---
name: reviewer
description: Code review specialist. Use immediately after writing or modifying code. Reviews diffs for correctness, security, and quality with severity levels. Read-only plus Bash for running checks.
tools: Read, Grep, Glob, Bash
---

You are the AgenticOS `reviewer` process. Review the requested diff or files
for defects. You never modify files; you may run read-only commands
(`git diff`, tests, linters) to verify claims.

Review order:
1. Correctness — logic errors, unhandled failure paths, race conditions.
2. Security — injection, secrets in code, unsafe file or network operations.
3. Quality — naming, dead code, oversized functions, missing tests.

Report every finding as:
`[SEVERITY] file:line — one-sentence defect, plus a concrete failure scenario`

Severities: CRITICAL (security or data loss — must fix), HIGH (bug — should
fix), MEDIUM (maintainability), LOW (style). Verify a finding is real before
reporting it — no speculative nitpicks.

End with a verdict: APPROVE (no CRITICAL/HIGH), WARN (HIGH findings), or
BLOCK (CRITICAL findings).
```

Create `agents/debugger.md`:

```markdown
---
name: debugger
description: Debugging specialist. Use when a test fails or behavior is unexpected. Reproduces first, then forms and verifies a hypothesis before any fix.
tools: Read, Grep, Glob, Bash, Edit
---

You are the AgenticOS `debugger` process. Rules:

1. **Reproduce first.** Run the failing test or command and capture the
   exact error. If you cannot reproduce it, report that — never fix blind.
2. **Hypothesize.** State the single most likely cause based on evidence,
   and what observation would confirm or refute it.
3. **Verify the hypothesis** with a targeted check (log, minimal test)
   before changing any code.
4. **Fix minimally.** Change the least code that makes the failure pass.
   Re-run the reproduction to confirm, then run the wider test suite to
   check for regressions.
5. **Report**: root cause, evidence, fix, and verification output.
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/agents.test.js`
Expected: 6 passing tests, `fail 0`.

- [ ] **Step 5: Commit**

```bash
git add agents tests/agents.test.js
git commit -m "feat: add planner, reviewer, and debugger processes"
```

---

### Task 8: Syscall commands

**Files:**
- Create: `tests/commands.test.js`
- Create: `commands/boot.md`
- Create: `commands/ps.md`
- Create: `commands/save.md`
- Create: `commands/resume.md`
- Create: `commands/review.md`

**Interfaces:**
- Consumes: agent name `reviewer` (Task 7); filesystem layout `~/.claude/agenticos/{MEMORY.md,memory/,sessions/}` (Task 4); `sessions/log.jsonl` (Task 5).
- Produces: five command prompt files with a `description` frontmatter field each.

- [ ] **Step 1: Write the failing test**

Create `tests/commands.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const COMMANDS_DIR = path.resolve(__dirname, '..', 'commands');
const EXPECTED = ['boot.md', 'ps.md', 'save.md', 'resume.md', 'review.md'];

test('syscall table contains exactly the five commands', () => {
  const files = fs.readdirSync(COMMANDS_DIR).filter((f) => f.endsWith('.md')).sort();
  assert.deepStrictEqual(files, [...EXPECTED].sort());
});

for (const file of EXPECTED) {
  test(`${file} has a description and a non-empty body`, () => {
    const raw = fs.readFileSync(path.join(COMMANDS_DIR, file), 'utf8');
    const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]+)$/);
    assert.ok(match, `${file} must have frontmatter and a body`);
    assert.match(match[1], /description:\s*\S+/);
    assert.ok(match[2].trim().length > 50, `${file} body too short to be useful`);
  });
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/commands.test.js`
Expected: FAIL with `ENOENT ... commands` (directory missing).

- [ ] **Step 3: Write the five command files**

Create `commands/boot.md`:

```markdown
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
```

Create `commands/ps.md`:

```markdown
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
```

Create `commands/save.md`:

```markdown
---
description: Save a session snapshot to the AgenticOS filesystem
---

Write a session snapshot so a future session can resume this work:

1. Compose a markdown snapshot with these sections:
   - **Context** — project path and git branch (if a git repo).
   - **State** — what was accomplished this session.
   - **Decisions** — choices made and why.
   - **Next steps** — ordered list of what to do next.
   - **Files touched** — paths modified or central to the work.
2. Save it to `~/.claude/agenticos/sessions/<YYYY-MM-DD-HHmm>-snapshot.md`
   using the current local time (create the directory if missing).
3. Confirm the exact path written and summarize the snapshot in two
   sentences.
```

Create `commands/resume.md`:

```markdown
---
description: Resume work from the latest AgenticOS session snapshot
---

Resume previous work:

1. List `~/.claude/agenticos/sessions/*-snapshot.md` and read the most
   recent by filename.
2. If no snapshot exists, read the last line of `sessions/log.jsonl` (if
   present) and report that only a bare session record is available.
3. Summarize the snapshot: context, state, and next steps.
4. Verify the snapshot still matches reality — the branch exists, the files
   it names are present — and flag anything stale.
5. Propose continuing with the first unfinished next step and wait for the
   user's confirmation before acting.
```

Create `commands/review.md`:

```markdown
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
```

- [ ] **Step 4: Run the full suite**

Run: `node --test tests/`
Expected: all tests pass, `fail 0`.

- [ ] **Step 5: Commit**

```bash
git add commands tests/commands.test.js
git commit -m "feat: add boot, ps, save, resume, and review syscalls"
```

---

### Task 9: CI, README, and architecture doc

**Files:**
- Create: `.github/workflows/ci.yml`
- Create: `README.md`
- Create: `docs/architecture.md`

**Interfaces:**
- Consumes: the full test suite (`node --test tests/`) from Tasks 1–8.
- Produces: CI running the suite on push/PR; user-facing docs.

- [ ] **Step 1: Write the CI workflow**

Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: node --test tests/
```

- [ ] **Step 2: Verify the CI command locally**

Run: `node --test tests/`
Expected: all tests pass, `fail 0` (this is exactly what CI will run).

- [ ] **Step 3: Write the README**

Create `README.md`:

````markdown
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
| Drivers | MCP integrations | Future subsystem |

## Install

```
/plugin marketplace add <owner>/agenticos
/plugin install agenticos
```

Start a new session. The boot daemon creates `~/.claude/agenticos/` and
injects the kernel. Run `/boot` to see the status screen.

## Quick start

- `/boot` — status report and filesystem health check
- `/save` — snapshot this session's state, decisions, and next steps
- `/resume` — pick up where the last session left off
- `/review` — dispatch the reviewer process on your current diff
- `/ps` — show the process table (tasks and background agents)

## Design principles

- **Lean kernel.** The kernel is capped at 150 lines, enforced by a test.
  Context bloat is the failure mode of every config framework; the cap is
  the feature.
- **Fail open.** A broken daemon never bricks a session: boot falls back to
  kernel-only, session-log skips silently. The guard denies only an
  exact-match list of catastrophic commands — no fuzzy heuristics, no
  false positives.
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
````

- [ ] **Step 4: Write the architecture doc**

Create `docs/architecture.md`:

```markdown
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
- **Drivers** — reserved for MCP integrations in a future version.

## Testing

`node --test tests/` — zero dependencies. Manifest/kernel/agent/command
tests are structural validation; guard tests are table-driven in both
directions (denied and allowed); boot tests run against a temp HOME and
cover the fail-open path.
```

- [ ] **Step 5: Run the full suite one final time**

Run: `node --test tests/`
Expected: all tests pass, `fail 0`.

- [ ] **Step 6: Commit**

```bash
git add .github README.md docs/architecture.md
git commit -m "docs: add README, architecture doc, and CI workflow"
```

---

## Verification checklist (after all tasks)

- [ ] `node --test tests/` — everything green.
- [ ] `git log --oneline` shows one commit per task plus the spec/plan commits.
- [ ] Kernel line count ≤ 150 (covered by test, but eyeball it).
- [ ] Manual smoke test (optional but recommended): add the repo as a local
  marketplace (`/plugin marketplace add "E:\old usb\agenticos"`), install
  `agenticos`, start a new session, run `/boot`, and confirm the filesystem
  exists at `~/.claude/agenticos/` and the kernel is in context.
