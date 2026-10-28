const fs = require('node:fs')
const { version } = JSON.parse(fs.readFileSync('package.json', 'utf8'))
const parts = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.exec(version)
if (!parts) throw new Error('package.json version must be a semantic version')
const [major, minor, patch] = parts.slice(1).map(Number)
const versionCode = major * 10000 + minor * 100 + patch
if (minor > 99 || patch > 99 || !Number.isSafeInteger(versionCode) || versionCode > 2100000000)
  throw new Error('package.json version cannot be represented as a numeric versionCode')
const values = {}
if (fs.existsSync('.env.local')) {
  for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*(XQ_APP_ID|XQ_CLOUD_ENV)\s*=\s*(.*?)\s*$/)
    if (m) values[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2')
  }
}
const appid = process.env.XQ_APP_ID || values.XQ_APP_ID || ''
const env = process.env.XQ_CLOUD_ENV || values.XQ_CLOUD_ENV || ''
if (appid && !/^wx[0-9a-f]{16}$/.test(appid)) throw new Error('XQ_APP_ID 格式无效')
if (env && !/^[a-zA-Z0-9_-]+$/.test(env)) throw new Error('XQ_CLOUD_ENV 格式无效')
function write(file, content) {
  if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== content)
    fs.writeFileSync(file, content)
}
const manifest = JSON.parse(fs.readFileSync('src/manifest.template.json', 'utf8'))
manifest.versionName = version
manifest.versionCode = String(versionCode)
manifest['mp-weixin'].appid = appid
write('src/manifest.json', JSON.stringify(manifest, null, 2) + '\n')
const project = JSON.parse(fs.readFileSync('project.config.template.json', 'utf8'))
project.appid = appid || 'touristappid'
write('project.config.json', JSON.stringify(project, null, 2) + '\n')
write(
  'src/config/cloud.local.ts',
  '// Generated locally; do not commit.\nexport const CLOUD_ENV = ' + JSON.stringify(env) + '\n',
)
write('cloudfunctions/ledger/local-config.json', JSON.stringify({ appid }, null, 2) + '\n')
console.log(
  appid && env
    ? 'Local deployment configuration prepared (identifiers hidden).'
    : 'Local configuration generated without credentials. Fill .env.local before deployment.',
)
