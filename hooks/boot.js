'use strict';

// AgenticOS boot daemon: creates the memory filesystem on first run and
// injects kernel rules + memory index as SessionStart context.
// Fails open — a broken memory dir must never brick a session.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const MEMORY_INDEX_HEADER =
  '# AgenticOS Memory Index\n\n' +
  'One line per fact: `- [Title](memory/<file>.md) — one-line hook`\n';

function ensureFilesystem(agentHome) {
  fs.mkdirSync(path.join(agentHome, 'memory'), { recursive: true });
  fs.mkdirSync(path.join(agentHome, 'sessions'), { recursive: true });
  const index = path.join(agentHome, 'MEMORY.md');
  if (!fs.existsSync(index)) {
    fs.writeFileSync(index, MEMORY_INDEX_HEADER);
  }
}

function readKernel(pluginRoot) {
  const kernelDir = path.join(pluginRoot, 'kernel');
  const files = fs
    .readdirSync(kernelDir)
    .filter((f) => f.endsWith('.md'))
    .sort();
  return files
    .map((f) => fs.readFileSync(path.join(kernelDir, f), 'utf8'))
    .join('\n');
}

function bootstrap(agentHome, pluginRoot) {
  let kernel = '';
  try {
    kernel = readKernel(pluginRoot);
  } catch (err) {
    process.stderr.write(`agenticos boot: kernel unavailable (${err.message})\n`);
  }
  let memoryIndex;
  try {
    ensureFilesystem(agentHome);
    memoryIndex = fs.readFileSync(path.join(agentHome, 'MEMORY.md'), 'utf8');
  } catch (err) {
    process.stderr.write(`agenticos boot: memory unavailable (${err.message}); kernel only\n`);
    return kernel;
  }
  return `${kernel}\n## Memory Index\n\n${memoryIndex}`;
}

function main() {
  let context;
  try {
    const agentHome = path.join(os.homedir(), '.claude', 'agenticos');
    const pluginRoot = path.resolve(__dirname, '..');
    context = bootstrap(agentHome, pluginRoot);
  } catch (err) {
    process.stderr.write(`agenticos boot failed: ${err.message}\n`);
    process.exit(0); // fail open: no context beats a broken session
  }
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext: context,
      },
    })
  );
  process.exit(0);
}

module.exports = { bootstrap, ensureFilesystem, readKernel };

if (require.main === module) {
  main();
}
