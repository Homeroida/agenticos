'use strict';

// AgenticOS session-log daemon: appends a session record on SessionEnd.
// Fails open — logging must never block session shutdown.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function logSession(agentHome, record) {
  const dir = path.join(agentHome, 'sessions');
  fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(path.join(dir, 'log.jsonl'), JSON.stringify(record) + '\n');
}

function main() {
  let input = '';
  process.stdin.on('data', (chunk) => {
    input += chunk;
  });
  process.stdin.on('end', () => {
    try {
      const payload = JSON.parse(input);
      logSession(path.join(os.homedir(), '.claude', 'agenticos'), {
        date: new Date().toISOString(),
        session_id: payload.session_id || 'unknown',
        cwd: payload.cwd || '',
        reason: payload.reason || '',
      });
    } catch (err) {
      process.stderr.write(`agenticos session-log skipped: ${err.message}\n`);
    }
    process.exit(0);
  });
}

module.exports = { logSession };

if (require.main === module) {
  main();
}
