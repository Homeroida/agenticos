'use strict';

// AgenticOS dashboard data layer: fail-soft filesystem readers.
// Every reader returns usable (possibly empty) data — never throws.

const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_CONFIG = {
  workdir: '',
  domains: [
    {
      name: 'Examples',
      buttons: [
        {
          id: 'example:deep-research',
          label: 'Deep research',
          prompt: 'Do deep research on the following topic and write a structured report: ',
          input: true,
          description: 'Structured research report on any topic',
        },
      ],
    },
  ],
};

function readJsonl(file, limit) {
  let lines;
  try {
    lines = fs.readFileSync(file, 'utf8').trim().split('\n');
  } catch {
    return [];
  }
  const records = [];
  for (const line of lines) {
    try {
      records.push(JSON.parse(line));
    } catch {
      // skip malformed lines
    }
  }
  return records.slice(-limit).reverse();
}

function readMemory(agentHome) {
  let raw;
  try {
    raw = fs.readFileSync(path.join(agentHome, 'MEMORY.md'), 'utf8');
  } catch {
    return [];
  }
  const facts = [];
  for (const line of raw.split('\n')) {
    const m = line.match(/^- \[([^\]]+)\]\(([^)]+)\)\s*—?\s*(.*)$/);
    if (m) facts.push({ title: m[1], file: m[2], hook: m[3] });
  }
  return facts;
}

function readSessions(agentHome, limit = 50) {
  const entries = readJsonl(path.join(agentHome, 'sessions', 'log.jsonl'), limit);
  let snapshots = [];
  try {
    snapshots = fs
      .readdirSync(path.join(agentHome, 'sessions'))
      .filter((f) => f.endsWith('-snapshot.md'))
      .sort()
      .reverse();
  } catch {}
  return { entries, snapshots };
}

function readStatus(agentHome, pluginRoot) {
  const status = {
    version: 'unknown',
    kernelModules: 0,
    daemons: [],
    filesystem: { memoryOk: false, factCount: 0, sessionCount: 0 },
  };
  try {
    status.version = JSON.parse(
      fs.readFileSync(path.join(pluginRoot, '.claude-plugin', 'plugin.json'), 'utf8')
    ).version;
  } catch {}
  try {
    status.kernelModules = fs
      .readdirSync(path.join(pluginRoot, 'kernel'))
      .filter((f) => f.endsWith('.md')).length;
  } catch {}
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(pluginRoot, 'hooks', 'hooks.json'), 'utf8'));
    status.daemons = Object.keys(cfg.hooks || {});
  } catch {}
  status.filesystem.memoryOk = fs.existsSync(path.join(agentHome, 'MEMORY.md'));
  status.filesystem.factCount = readMemory(agentHome).length;
  status.filesystem.sessionCount = readJsonl(path.join(agentHome, 'sessions', 'log.jsonl'), Infinity).length;
  return status;
}

function readSyscallButtons(pluginRoot) {
  let files = [];
  try {
    files = fs
      .readdirSync(path.join(pluginRoot, 'commands'))
      .filter((f) => f.endsWith('.md') && f !== 'dashboard.md')
      .sort();
  } catch {}
  const buttons = [];
  for (const file of files) {
    const name = file.replace(/\.md$/, '');
    let description = '';
    try {
      const raw = fs.readFileSync(path.join(pluginRoot, 'commands', file), 'utf8');
      const m = raw.match(/^---\n([\s\S]*?)\n---/);
      if (m) {
        const line = m[1].split('\n').find((l) => l.startsWith('description:'));
        if (line) description = line.slice('description:'.length).trim();
      }
    } catch {}
    buttons.push({ id: `syscall:${name}`, label: `/${name}`, prompt: `/${name}`, input: false, description });
  }
  return buttons;
}

function ensureDashboardConfig(agentHome) {
  const file = path.join(agentHome, 'dashboard.json');
  try {
    if (!fs.existsSync(file)) {
      fs.mkdirSync(agentHome, { recursive: true });
      fs.writeFileSync(file, JSON.stringify(DEFAULT_CONFIG, null, 2) + '\n');
    }
  } catch {}
  return file;
}

function validateConfig(config) {
  if (typeof config !== 'object' || config === null || Array.isArray(config)) {
    return 'config must be a JSON object';
  }
  if (config.workdir !== undefined && typeof config.workdir !== 'string') {
    return 'workdir must be a string';
  }
  if (!Array.isArray(config.domains)) return 'domains must be an array';
  const seen = new Set();
  for (const domain of config.domains) {
    if (!domain || typeof domain.name !== 'string' || !domain.name) {
      return 'every domain needs a non-empty name';
    }
    if (!Array.isArray(domain.buttons)) return `domain "${domain.name}" needs a buttons array`;
    for (const b of domain.buttons) {
      if (!b || typeof b.id !== 'string' || !b.id) {
        return `domain "${domain.name}" has a button without an id`;
      }
      if (seen.has(b.id)) return `duplicate button id "${b.id}"`;
      seen.add(b.id);
      if (typeof b.label !== 'string' || !b.label) return `button "${b.id}" needs a label`;
      if (typeof b.prompt !== 'string' || !b.prompt) return `button "${b.id}" needs a prompt`;
    }
  }
  return null;
}

function readButtons(agentHome, pluginRoot) {
  const result = {
    workdir: '',
    groups: [{ name: 'Syscalls', buttons: readSyscallButtons(pluginRoot) }],
    configError: null,
  };
  const file = ensureDashboardConfig(agentHome);
  let config;
  try {
    config = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    result.configError = `dashboard.json unreadable: ${err.message}`;
    return result;
  }
  const problem = validateConfig(config);
  if (problem) {
    result.configError = `dashboard.json invalid: ${problem}`;
    return result;
  }
  result.workdir = config.workdir || '';
  for (const domain of config.domains) {
    result.groups.push({
      name: domain.name,
      buttons: domain.buttons.map((b) => ({
        id: b.id,
        label: b.label,
        prompt: b.prompt,
        input: b.input === true,
        description: b.description || '',
      })),
    });
  }
  return result;
}

function findButton(buttonsResult, id) {
  for (const group of buttonsResult.groups) {
    for (const b of group.buttons) {
      if (b.id === id) return b;
    }
  }
  return null;
}

module.exports = {
  readStatus,
  readMemory,
  readSessions,
  readButtons,
  findButton,
  ensureDashboardConfig,
  validateConfig,
  DEFAULT_CONFIG,
};
