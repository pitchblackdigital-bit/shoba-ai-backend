const fs = require('fs');
const path = require('path');
const required = [
  'package.json','api/_lib.js','api/health.js','api/ready.js','api/listings/index.js','api/discover/index.js'
];
for (const file of required) {
  if (!fs.existsSync(path.join(__dirname, '..', file))) throw new Error(`Missing ${file}`);
}
const pkg = require('../package.json');
if (pkg.version !== '1.2.0') throw new Error('Unexpected package version');
const lib = require('../api/_lib');
if (typeof lib.requireApiKey !== 'function' || typeof lib.cleanListing !== 'function') throw new Error('Library exports missing');
console.log('SHOBA backend v1.2 smoke tests passed.');
