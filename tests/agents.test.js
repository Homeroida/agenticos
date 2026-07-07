'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const AGENTS_DIR = path.resolve(__dirname, '..', 'agents');
const EXPECTED = ['planner.md', 'reviewer.md', 'debugger.md'];

function frontmatter(file) {
  const raw = fs.readFileSync(path.join(AGENTS_DIR, file), 'utf8');
  const match = raw.match(/^---\n([\s\S]*?)\n---/);
  assert.ok(match, `${file} must start with YAML frontmatter`);
  const fields = {};
  for (const line of match[1].split('\n')) {
    const idx = line.indexOf(':');
    if (idx > 0) fields[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return fields;
}

test('process table contains exactly planner, reviewer, debugger', () => {
  const files = fs.readdirSync(AGENTS_DIR).filter((f) => f.endsWith('.md')).sort();
  assert.deepStrictEqual(files, [...EXPECTED].sort());
});

for (const file of EXPECTED) {
  test(`${file} has name, description, and tools frontmatter`, () => {
    const fields = frontmatter(file);
    assert.strictEqual(fields.name, file.replace('.md', ''));
    assert.ok(fields.description && fields.description.length > 20);
    assert.ok(fields.tools && fields.tools.includes('Read'));
  });
}

test('planner and reviewer are read-only (no Write or Edit tools)', () => {
  for (const file of ['planner.md', 'reviewer.md']) {
    const fields = frontmatter(file);
    assert.ok(!fields.tools.includes('Write'), `${file} must not have Write`);
    assert.ok(!fields.tools.includes('Edit'), `${file} must not have Edit`);
  }
});
