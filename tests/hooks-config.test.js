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
