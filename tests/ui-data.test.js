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
