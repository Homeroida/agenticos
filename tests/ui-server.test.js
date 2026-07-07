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
