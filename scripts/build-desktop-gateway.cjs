const fs = require('node:fs'),
  path = require('node:path')
require('./prepare-local-config.cjs')
require('./build-cloud.cjs')
const target = 'cloudfunctions/desktop-gateway'
fs.mkdirSync(target, { recursive: true })
for (const file of [
  'handler.js',
  'features.js',
  'core.cjs',
  'desktop-auth.js',
  'local-config.json',
])
  fs.copyFileSync(path.join('cloudfunctions/ledger', file), path.join(target, file))
const localEnv = fs.existsSync('.env.local') ? fs.readFileSync('.env.local', 'utf8') : ''
const configuredMode = localEnv
  .match(/^\s*XQ_MINI_ENV\s*=\s*(.*?)\s*$/m)?.[1]
  ?.replace(/^(['"])(.*)\1$/, '$2')
const miniEnv = process.env.XQ_MINI_ENV || configuredMode || 'release'
if (!['release', 'trial', 'develop'].includes(miniEnv))
  throw new Error('XQ_MINI_ENV 必须是 release、trial 或 develop')
const configFile = path.join(target, 'local-config.json')
const config = JSON.parse(fs.readFileSync(configFile, 'utf8'))
fs.writeFileSync(configFile, JSON.stringify({ ...config, miniEnv }, null, 2) + '\n')
console.log(
  'Desktop gateway prepared with local configuration; generated files are ignored by Git.',
)
