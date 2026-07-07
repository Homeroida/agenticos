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
