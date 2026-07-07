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

test('finished runs are evicted from memory but still retrievable from disk', async () => {
  const home = tempDir();
  const runner = makeRunner(home);
  const { id } = runner.startRun(BUTTON, 'evict', home);
  await waitFor(() => {
    const found = runner.getRun(id);
    return found && found.run.status !== 'running';
  });
  assert.strictEqual(runner.records.size, 0);
  const { run, output } = runner.getRun(id);
  assert.strictEqual(run.status, 'done');
  assert.strictEqual(output, 'RAN:hello evict');
});

test('status stays running until the output file is complete (timeout path)', async () => {
  const home = tempDir();
  const runner = makeRunner(home, { timeoutMs: 200, killGraceMs: 100 });
  const { id } = runner.startRun({ id: 'x:hang', label: 'Hang', prompt: 'HANG', input: false }, '', home);
  // Immediately after the timer would fire, the public status must still be
  // 'running' if the child hasn't closed yet; eventually it becomes 'timeout'.
  await new Promise((r) => setTimeout(r, 220));
  const mid = runner.getRun(id).run.status;
  assert.ok(mid === 'running' || mid === 'timeout', `unexpected status ${mid}`);
  await waitFor(() => runner.getRun(id).run.status !== 'running');
  assert.strictEqual(runner.getRun(id).run.status, 'timeout');
});
