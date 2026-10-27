const fs = require('node:fs')
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
