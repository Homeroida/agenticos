'use strict';

// Entry point for `node --test tests/` (Node on Windows needs an entry file).
// Auto-loads every *.test.js in this directory — new test files need no registration.

const fs = require('node:fs');
const path = require('node:path');

for (const file of fs.readdirSync(__dirname)) {
  if (file.endsWith('.test.js')) {
    require(path.join(__dirname, file));
  }
}
