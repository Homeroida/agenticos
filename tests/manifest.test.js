'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

test('plugin.json has required fields', () => {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(ROOT, '.claude-plugin', 'plugin.json'), 'utf8')
  );
  assert.strictEqual(manifest.name, 'agenticos');
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  assert.ok(manifest.description.length > 0, 'description must be non-empty');
});

test('marketplace.json lists the agenticos plugin from repo root', () => {
  const market = JSON.parse(
    fs.readFileSync(path.join(ROOT, '.claude-plugin', 'marketplace.json'), 'utf8')
  );
  assert.strictEqual(market.name, 'agenticos');
  assert.ok(market.owner, 'owner must be present');
  assert.strictEqual(market.plugins.length, 1);
  assert.strictEqual(market.plugins[0].name, 'agenticos');
  assert.strictEqual(market.plugins[0].source, './');
});

test('package.json declares no dependencies', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.strictEqual(pkg.dependencies, undefined);
  assert.strictEqual(pkg.devDependencies, undefined);
  assert.strictEqual(pkg.scripts.test, 'node --test tests/');
});
