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
