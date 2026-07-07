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
  const home = tempHome();
  execFileSync(process.execPath, [path.resolve(__dirname, '..', 'hooks', 'session-log.js')], {
    input: 'not json',
    env: { ...process.env, HOME: home, USERPROFILE: home },
  });
});

test('script logs a well-formed payload into the overridden home, not the real one', () => {
  const { execFileSync } = require('node:child_process');
  const home = tempHome();
  execFileSync(process.execPath, [path.resolve(__dirname, '..', 'hooks', 'session-log.js')], {
    input: JSON.stringify({ session_id: 'iso-test', cwd: '/tmp/x', reason: 'exit' }),
    env: { ...process.env, HOME: home, USERPROFILE: home },
  });
  const logPath = path.join(home, '.claude', 'agenticos', 'sessions', 'log.jsonl');
  const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n');
  assert.strictEqual(lines.length, 1);
  const record = JSON.parse(lines[0]);
  assert.strictEqual(record.session_id, 'iso-test');
  assert.ok(record.date.includes('T'), 'date must be ISO format');
});
