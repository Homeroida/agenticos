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
