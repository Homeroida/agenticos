'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const COMMANDS_DIR = path.resolve(__dirname, '..', 'commands');
const EXPECTED = ['boot.md', 'ps.md', 'save.md', 'resume.md', 'review.md', 'dashboard.md'];

test('syscall table contains exactly the five commands', () => {
  const files = fs.readdirSync(COMMANDS_DIR).filter((f) => f.endsWith('.md')).sort();
  assert.deepStrictEqual(files, [...EXPECTED].sort());
});

for (const file of EXPECTED) {
  test(`${file} has a description and a non-empty body`, () => {
    const raw = fs.readFileSync(path.join(COMMANDS_DIR, file), 'utf8');
    const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]+)$/);
    assert.ok(match, `${file} must have frontmatter and a body`);
    assert.match(match[1], /description:\s*\S+/);
    assert.ok(match[2].trim().length > 50, `${file} body too short to be useful`);
  });
}
