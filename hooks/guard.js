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
  const shortFlags = rest.filter((t) => /^-[a-zA-Z]+$/.test(t)).join('');
  const targets = rest.filter((t) => !t.startsWith('-'));
  const recursive =
    shortFlags.includes('r') || shortFlags.includes('R') || rest.includes('--recursive');
  const force = shortFlags.includes('f') || rest.includes('--force');
  return recursive && force && targets.some(isRootPath);
}

function isProtectedRefspec(token) {
  return (
    token === 'main' || token === 'master' || token.endsWith(':main') || token.endsWith(':master')
  );
}

function checkForcePushProtected(cmd) {
  const parts = tokens(cmd);
  const gi = parts.indexOf('git');
  if (gi === -1 || parts[gi + 1] !== 'push') return false;
  const rest = parts.slice(gi + 2);
  const force = rest.some((t) => t === '--force' || t === '-f');
  if (!force) return false;
  const nonFlagTokens = rest.filter((t) => !t.startsWith('-'));
  // First non-flag token after `push` is the remote; refspecs follow it.
  const refspecs = nonFlagTokens.slice(1);
  return refspecs.some(isProtectedRefspec);
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
