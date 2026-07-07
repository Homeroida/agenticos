'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const KERNEL = path.resolve(__dirname, '..', 'kernel');
const EXPECTED_FILES = ['00-core.md', '10-workflow.md', '20-safety.md', '30-memory.md'];

test('kernel contains exactly the four rule modules', () => {
  const files = fs.readdirSync(KERNEL).filter((f) => f.endsWith('.md')).sort();
  assert.deepStrictEqual(files, EXPECTED_FILES);
});

test('kernel stays within the 150-line budget', () => {
  const total = EXPECTED_FILES.map((f) =>
    fs.readFileSync(path.join(KERNEL, f), 'utf8').split('\n').length
  ).reduce((a, b) => a + b, 0);
  assert.ok(total <= 150, `kernel is ${total} lines; budget is 150`);
});
