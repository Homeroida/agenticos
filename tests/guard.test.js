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
  'git push --force main master',
  'git push -f origin HEAD:main',
  'rm --recursive --force /',
  'git push origin +main',
  'git push origin +HEAD:master',
  'git -C repo push --force origin main',
  'git -c user.email=x push -f origin master',
  'git -C repo reset --hard origin/main',
  // Accepted false positive of position-independent token matching: the guard scans
  // for `rm`/flags/root-path tokens anywhere in the string, so this harmless echo
  // still trips the rm -rf / detector. This is current behavior, not a new rule.
  'echo rm -rf /',
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
  'git push --force main feature/x',
  'git push --force main',
  'rm --reference=file /',
  'git push origin +feature/x',
  'git -C repo push origin main',
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
