'use strict';

// Optional manual entry point: `node tests/index.js` runs all suites in one process.
// `node --test tests/` discovers *.test.js files natively and does not load this file.

const fs = require('node:fs');
const path = require('node:path');

for (const file of fs.readdirSync(__dirname)) {
  if (file.endsWith('.test.js')) {
    require(path.join(__dirname, file));
  }
}
