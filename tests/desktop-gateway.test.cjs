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
  // Provider diagnostics expose only a stage and numeric code, never its raw message or secret.
  const { EventEmitter } = require('node:events')
  const sentQrBodies = []
  async function diagnosticCase(bodies, miniEnv = 'release') {
    const result = {}
    const diagnosticDb = mockDB()
    const diagnostic = {
      ...sandbox,
      exports: result,
      console: { error() {} },
      process: { env: { XQ_WECHAT_APP_SECRET: 'synthetic-do-not-expose', XQ_MINI_ENV: miniEnv } },
    }
    diagnostic.require = (name) => {
      if (name === 'node:https')
        return {
          request(url, options, callback) {
            const req = new EventEmitter()
            req.write = (body) => {
              if (String(url).includes('getwxacodeunlimit')) sentQrBodies.push(JSON.parse(body))
            }
            req.end = () => {
              const res = new EventEmitter()
              res.statusCode = 200
              callback(res)
              res.emit('data', Buffer.from(JSON.stringify(bodies.shift())))
              res.emit('end')
            }
            return req
          },
        }
      if (name === 'wx-server-sdk')
        return { init() {}, DYNAMIC_CURRENT_ENV: 'test', database: () => diagnosticDb }
      return sandbox.require(name)
    }
    vm.runInNewContext(
      fs.readFileSync('cloudfunctions/desktop-gateway/index.js', 'utf8'),
      diagnostic,
    )
    return result.main({
      httpMethod: 'POST',
      body: JSON.stringify({ action: 'desktopBegin', tokenHash: 'd'.repeat(64) }),
    })
  }
  const tokenError = await diagnosticCase([{ errcode: 40125, errmsg: 'synthetic-do-not-expose' }])
  assert.equal(tokenError.statusCode, 503)
  assert.equal(JSON.parse(tokenError.body).stage, 'access_token')
  assert.equal(JSON.parse(tokenError.body).providerCode, 40125)
  assert.equal(tokenError.body.includes('synthetic-do-not-expose'), false)
  const pageError = await diagnosticCase([
    { access_token: 'test-token' },
    { errcode: 41030, errmsg: 'synthetic-do-not-expose' },
  ])
  assert.equal(JSON.parse(pageError.body).stage, 'qr_code')
  assert.equal(JSON.parse(pageError.body).providerCode, 41030)
  assert.equal(pageError.body.includes('synthetic-do-not-expose'), false)
  assert.equal(sentQrBodies.at(-1).check_path, true)
  await diagnosticCase([{ access_token: 'test-token' }, { errcode: 41030 }], 'trial')
  assert.equal(sentQrBodies.at(-1).check_path, false)
  assert.equal(sentQrBodies.at(-1).env_version, 'trial')
  console.log(
    'PASS desktop gateway: flat deployment modules, unsupported methods, forged identities and invalid tickets',
  )
})().catch((e) => {
  console.error(e)
  process.exitCode = 1
})
