'use strict';

// AgenticOS dashboard server. Binds 127.0.0.1 ONLY — this is a local,
// single-user tool; never expose it on 0.0.0.0.

const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const data = require('./data.js');
const { Runner } = require('./runner.js');

const HOST = '127.0.0.1';
const DEFAULT_PORT = 4517;
const MAX_BODY_BYTES = 64 * 1024;
const RUN_PATH = /^\/api\/runs\/([A-Za-z0-9-]+)$/;

function json(res, code, body) {
  res.writeHead(code, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > MAX_BODY_BYTES) {
        reject(new Error('body too large'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function createServer(opts = {}) {
  const agentHome = opts.agentHome || path.join(os.homedir(), '.claude', 'agenticos');
  const pluginRoot = opts.pluginRoot || path.resolve(__dirname, '..');
  const runner = opts.runner || new Runner({ agentHome });

  async function route(req, res) {
    const pathname = new URL(req.url, `http://${HOST}`).pathname;
    if (req.method === 'GET' && pathname === '/') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(fs.readFileSync(path.join(__dirname, 'index.html')));
      return;
    }
    if (req.method === 'GET' && pathname === '/api/status') {
      return json(res, 200, data.readStatus(agentHome, pluginRoot));
    }
    if (req.method === 'GET' && pathname === '/api/buttons') {
      return json(res, 200, data.readButtons(agentHome, pluginRoot));
    }
    if (req.method === 'GET' && pathname === '/api/sessions') {
      return json(res, 200, data.readSessions(agentHome));
    }
    if (req.method === 'GET' && pathname === '/api/memory') {
      return json(res, 200, data.readMemory(agentHome));
    }
    if (req.method === 'GET' && pathname === '/api/runs') {
      return json(res, 200, runner.listRuns());
    }
    const runMatch = pathname.match(RUN_PATH);
    if (req.method === 'GET' && runMatch) {
      const result = runner.getRun(runMatch[1]);
      return result ? json(res, 200, result) : json(res, 404, { error: 'run not found' });
    }
    if (req.method === 'POST' && pathname === '/api/run') {
      let payload;
      try {
        payload = JSON.parse(await readBody(req));
      } catch {
        return json(res, 400, { error: 'invalid JSON body' });
      }
      const buttons = data.readButtons(agentHome, pluginRoot);
      const button = data.findButton(buttons, String(payload.buttonId || ''));
      if (!button) return json(res, 400, { error: 'unknown buttonId' });
      const result = runner.startRun(button, payload.input, buttons.workdir);
      if (result.error === 'too-many-runs') {
        return json(res, 429, { error: 'too many concurrent runs' });
      }
      return json(res, 200, { runId: result.id });
    }
    json(res, 404, { error: 'not found' });
  }

  return http.createServer((req, res) => {
    Promise.resolve()
      .then(() => route(req, res))
      .catch((err) => json(res, 500, { error: err.message }));
  });
}

function main() {
  const port = Number(process.env.AGENTICOS_PORT) || DEFAULT_PORT;
  const server = createServer();
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      process.stderr.write(
        `agenticos dashboard: port ${port} is already in use. Set AGENTICOS_PORT to use another port.\n`
      );
      process.exit(1);
    }
    throw err;
  });
  server.listen(port, HOST, () => {
    process.stdout.write(`AgenticOS dashboard running at http://${HOST}:${port}\n`);
  });
}

module.exports = { createServer, HOST };

if (require.main === module) {
  main();
}
