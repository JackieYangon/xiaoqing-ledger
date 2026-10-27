const fs = require('node:fs'),
  path = require('node:path')
require('./prepare-local-config.cjs')
require('./build-cloud.cjs')
const target = 'cloudfunctions/desktop-gateway/ledger'
fs.mkdirSync(target, { recursive: true })
for (const file of [
  'handler.js',
  'features.js',
  'core.cjs',
  'desktop-auth.js',
  'local-config.json',
])
  fs.copyFileSync(path.join('cloudfunctions/ledger', file), path.join(target, file))
console.log(
  'Desktop gateway prepared with local configuration; generated files are ignored by Git.',
)
