const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const { mockDB } = require('./mock-db.cjs')
require('../scripts/build-desktop-gateway.cjs')
process.env.XQ_APP_ID = 'wx0000000000000000'
for (const name of ['handler.js', 'features.js', 'core.cjs', 'desktop-auth.js']) {
  assert.equal(
    fs.readFileSync('cloudfunctions/desktop-gateway/' + name, 'utf8'),
    fs.readFileSync('cloudfunctions/ledger/' + name, 'utf8'),
    `stale generated module: ${name}`,
  )
}
const db = mockDB()
const exported = {}
const sandbox = {
  exports: exported,
  process: { env: {} },
  Buffer,
  URL,
  console,
  require(name) {
    if (name === 'node:https') return require('node:https')
    if (name === 'wx-server-sdk')
      return { init() {}, DYNAMIC_CURRENT_ENV: 'test', database: () => db }
    if (name === './desktop-auth') return require('../cloudfunctions/ledger/desktop-auth')
    if (name === './handler') return require('../cloudfunctions/ledger/handler')
    throw new Error('unexpected dependency ' + name)
  },
}
vm.runInNewContext(fs.readFileSync('cloudfunctions/desktop-gateway/index.js', 'utf8'), sandbox)
;(async () => {
  assert.equal((await exported.main({ httpMethod: 'GET' })).statusCode, 405)
  const post = (data) => exported.main({ httpMethod: 'POST', body: JSON.stringify(data) })
  assert.equal((await post({ action: 'login', token: 'a'.repeat(64) })).statusCode, 403)
  assert.equal(
    (await post({ action: 'read', token: 'a'.repeat(64), accountId: 'b'.repeat(64) })).statusCode,
    401,
  )
  const poll = await post({ action: 'desktopPoll', scene: '0'.repeat(24), token: 'c'.repeat(64) })
  assert.equal(JSON.parse(poll.body).ok, false)
  console.log(
    'PASS desktop gateway: flat deployment modules, unsupported methods, forged identities and invalid tickets',
  )
})().catch((e) => {
  console.error(e)
  process.exitCode = 1
})
