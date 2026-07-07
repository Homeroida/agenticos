'use strict';

// AgenticOS dashboard runner: spawns headless Claude for config-defined
// buttons. No shell — args array only. Run records persist to
// <agentHome>/runs/log.jsonl; output to <agentHome>/runs/<id>.txt.

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const MAX_CONCURRENT = 3;
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;
const DEFAULT_KILL_GRACE_MS = 10 * 1000;
const ID_PATTERN = /^[A-Za-z0-9-]+$/;

class Runner {
  constructor(opts = {}) {
    this.agentHome = opts.agentHome || path.join(os.homedir(), '.claude', 'agenticos');
    this.bin = opts.bin || process.env.AGENTICOS_CLAUDE_BIN || 'claude';
    this.binArgs = opts.binArgs || [];
    this.timeoutMs = opts.timeoutMs || DEFAULT_TIMEOUT_MS;
    this.killGraceMs = opts.killGraceMs || DEFAULT_KILL_GRACE_MS;
    this.active = new Map(); // id -> child process
    this.records = new Map(); // id -> record (this process's runs)
    this.timedOut = new Set(); // ids whose timeout timer has fired
  }

  runsDir() {
    return path.join(this.agentHome, 'runs');
  }

  startRun(button, input, workdir) {
    if (this.active.size >= MAX_CONCURRENT) return { error: 'too-many-runs' };
    const id = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const suffix = button.input ? String(input || '').trim() : '';
    const prompt = button.prompt + suffix;
    const record = {
      id,
      buttonId: button.id,
      label: button.label,
      input: suffix,
      startedAt: new Date().toISOString(),
      endedAt: null,
      status: 'running',
      exitCode: null,
    };
    this.records.set(id, record);
    fs.mkdirSync(this.runsDir(), { recursive: true });
    const out = fs.createWriteStream(path.join(this.runsDir(), `${id}.txt`));
    const cwd = workdir && fs.existsSync(workdir) ? workdir : os.homedir();
    const args = [...this.binArgs, '-p', prompt, '--output-format', 'text'];
    let child;
    try {
      child = spawn(this.bin, args, { cwd, windowsHide: true });
    } catch (err) {
      this.finish(record, 'error', null, out, `spawn failed: ${err.message}`);
      return { id };
    }
    this.active.set(id, child);
    child.stdout.pipe(out, { end: false });
    child.stderr.pipe(out, { end: false });
    const timer = setTimeout(() => {
      // Do NOT touch record.status here: the invariant is that record.status
      // only flips to a terminal value inside finish()'s out.end callback,
      // after the output file has flushed. Recording the timeout separately
      // lets the close handler decide the final status once the child has
      // actually exited and output has been captured.
      this.timedOut.add(id);
      child.kill('SIGTERM');
      const hardKill = setTimeout(() => {
        if (this.active.has(id)) child.kill('SIGKILL');
      }, this.killGraceMs);
      hardKill.unref();
    }, this.timeoutMs);
    timer.unref();
    child.on('error', (err) => {
      clearTimeout(timer);
      this.active.delete(id);
      this.finish(record, 'error', null, out, `spawn failed: ${err.message}. Set AGENTICOS_CLAUDE_BIN to the full path of your claude binary.`);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      this.active.delete(id);
      const status = this.timedOut.has(id) ? 'timeout' : code === 0 ? 'done' : 'error';
      this.timedOut.delete(id);
      this.finish(record, status, code, out, null);
    });
    return { id };
  }

  finish(record, status, exitCode, out, note) {
    if (record.endedAt) return; // already finished (error + close can both fire)
    record.endedAt = new Date().toISOString();
    if (note) out.write(`\n${note}\n`);
    // The final status flips only after the output file has fully flushed,
    // so anyone who sees a non-running status can safely read the output.
    out.end(() => {
      record.status = status;
      record.exitCode = exitCode;
      try {
        fs.appendFileSync(path.join(this.runsDir(), 'log.jsonl'), JSON.stringify(record) + '\n');
      } catch {}
      this.records.delete(record.id);
    });
  }

  listRuns() {
    const persisted = [];
    try {
      for (const line of fs.readFileSync(path.join(this.runsDir(), 'log.jsonl'), 'utf8').trim().split('\n')) {
        try {
          persisted.push(JSON.parse(line));
        } catch {}
      }
    } catch {}
    const running = [...this.records.values()].filter((r) => r.status === 'running');
    return [...running, ...persisted.reverse()].slice(0, 50);
  }

  getRun(id) {
    if (!ID_PATTERN.test(id)) return null;
    const run = this.records.get(id) || this.listRuns().find((r) => r.id === id) || null;
    if (!run) return null;
    let output = '';
    try {
      output = fs.readFileSync(path.join(this.runsDir(), `${id}.txt`), 'utf8');
    } catch {}
    return { run, output };
  }
}

module.exports = { Runner, MAX_CONCURRENT };
