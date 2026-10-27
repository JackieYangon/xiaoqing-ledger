const fs = require('node:fs')
const values = {}
if (fs.existsSync('.env.local'))
  for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*XQ_DESKTOP_API_URL\s*=\s*(.*?)\s*$/)
    if (m) values.url = m[1].replace(/^(['"])(.*)\1$/, '$2')
  }
const url = process.env.XQ_DESKTOP_API_URL || values.url || ''
if (url) {
  const u = new URL(url)
  if (u.protocol !== 'https:' || u.username || u.password || u.hash)
    throw Error('XQ_DESKTOP_API_URL 必须为不带凭证的 HTTPS 地址')
}
fs.writeFileSync('desktop/config.local.json', JSON.stringify({ endpoint: url }, null, 2) + '\n')
console.log(
  url
    ? 'Desktop endpoint configured locally.'
    : 'Desktop endpoint is not configured; the app will display setup guidance.',
)
