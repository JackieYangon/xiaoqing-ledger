const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')
const vue = require('vue')

const source = ts.transpileModule(fs.readFileSync('src/services/auth.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText
const accountA = 'a'.repeat(64), accountB = 'b'.repeat(64)
const day = 24 * 60 * 60 * 1000
const deferred = () => {
  let resolve, reject
  const promise = new Promise((ok, fail) => { resolve = ok; reject = fail })
  return { promise, resolve, reject }
}
const settle = () => new Promise(resolve => setImmediate(resolve))
async function within(promise) {
  let timer
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('session recovery did not settle')), 2000) }),
    ])
  } finally { clearTimeout(timer) }
}
function createServer() {
  const sessions = new Map(), queued = new Map()
  let sequence = 0
  return {
    now: Date.UTC(2026, 9, 28, 4), user: accountA, offline: false,
    hold(action) {
      const task = deferred()
      queued.set(action, [...(queued.get(action) || []), task.promise])
      return task
    },
    respond(event) {
      if (event.action === 'login') {
        const token = (++sequence).toString(16).padStart(64, '0')
        const session = { accountId: this.user, token, expiresAt: this.now + day }
        sessions.set(token, session)
        return { ok: true, ...session, profile: { name: '我的昵称', avatar: 'private-avatar', version: 1 } }
      }
      if (event.action === 'logout') { sessions.delete(event.token); return { ok: true } }
      const session = sessions.get(event.token)
      if (!session || session.accountId !== this.user || session.expiresAt <= this.now)
        return { ok: false, code: 'AUTH' }
      if (event.action === 'session')
        return { ok: true, accountId: session.accountId, expiresAt: session.expiresAt }
      return { ok: true, accountId: session.accountId }
    },
    async call(event) {
      if (this.offline) throw new Error('网络暂时不可用')
      const next = queued.get(event.action)
      if (next?.length) return next.shift()
      return this.respond(event)
    },
  }
}
function environment({ storage = new Map(), server = createServer(), cloudEnabled = true } = {}) {
  const calls = { cloud: [], reads: [], writes: [], removes: [], routes: [] }
  const flags = { readFails: false, writeFails: false, removeFails: false }
  const interceptors = {}, hooks = []
  const uni = {
    getStorageSync(key) {
      calls.reads.push(key)
      if (flags.readFails) throw new Error('storage read failed')
      return storage.get(key) || ''
    },
    setStorageSync(key, value) {
      calls.writes.push([key, value])
      if (flags.writeFails) throw new Error('storage write failed')
      storage.set(key, value)
    },
    removeStorageSync(key) {
      calls.removes.push(key)
      if (flags.removeFails) throw new Error('storage removal failed')
      storage.delete(key)
    },
    addInterceptor(api, interceptor) { interceptors[api] = interceptor },
    reLaunch(options) { calls.routes.push(options.url); options.complete?.() },
  }
  class Clock extends Date {
    constructor(...args) { super(...(args.length ? args : [server.now])) }
    static now() { return server.now }
  }
  const exports = {}
  vm.runInNewContext(source, {
    exports, Date: Clock, Error, Math, JSON, console, uni,
    getCurrentPages: () => [{ route: 'pages/home/index' }],
    require(request) {
      if (request === 'vue') return vue
      if (request === '@dcloudio/uni-app') return { onLoad: fn => hooks.push(fn), onShow: fn => hooks.push(fn) }
      if (request === './cloud-transport') return {
        cloudEnabled, async callLedger(event) { calls.cloud.push(event); return server.call(event) },
      }
      throw new Error('Unexpected auth import ' + request)
    },
  })
  return { auth: exports, storage, server, flags, calls, interceptors, hooks }
}
async function signedIn() {
  const env = environment()
  await env.auth.initializeAuth()
  assert.equal(await env.auth.login(), true)
  return env
}
function saved(env) { return JSON.parse(env.storage.get(env.auth.SESSION_STORAGE_KEY)) }

async function checkFirstVisitAndReopen() {
  const env = environment()
  const key = env.auth.SESSION_STORAGE_KEY
  env.storage.set('xiaoqing.ledger.v1', 'private original bills')
  assert.equal(await env.auth.initializeAuth(), false)
  assert.equal(await env.auth.resumeSession(), false)
  assert.equal(await env.auth.ensureSession(), false)
  assert.equal(env.auth.guestMode.value, true)
  assert.equal(env.calls.cloud.length, 0, 'a first visit never obtains an identity automatically')
  assert.deepEqual(env.calls.reads, [key], 'startup only inspects the dedicated session key')
  assert.equal(env.calls.writes.length, 0)
  assert.equal(await env.auth.login(), true)
  const record = saved(env)
  assert.deepEqual(Object.keys(record).sort(), ['accountId', 'expiresAt', 'schema', 'token'])
  assert.equal(record.accountId, accountA)
  assert.equal(record.expiresAt, env.server.now + day)
  assert.equal(env.storage.get('xiaoqing.ledger.v1'), 'private original bills')

  // A cold launch must verify saved credentials before showing an authenticated account.
  const cold = environment(env)
  const hold = env.server.hold('session')
  const boot = cold.auth.initializeAuth()
  const concurrentResume = cold.auth.resumeSession()
  const concurrentEnsure = cold.auth.ensureSession()
  assert.equal(cold.auth.authenticated.value, false)
  assert.equal(cold.auth.browseReady.value, false)
  await settle()
  assert.deepEqual(cold.calls.cloud.map(event => event.action), ['session'])
  hold.resolve(env.server.respond({ action: 'session', token: record.token }))
  assert.deepEqual(await within(Promise.all([boot, concurrentResume, concurrentEnsure])), [true, true, true])
  assert.equal(cold.auth.currentUser.value.accountId, accountA)
  assert.equal(cold.auth.authenticated.value, true)
  assert.equal(cold.calls.writes.length, 0, 'unchanged verified credentials need no rewrite')
  assert.equal(cold.calls.routes.length, 0, 'reopening does not force the login page')

  // A foreground listener that asks for a usable session cannot create a recovery loop.
  let foreground = 0
  cold.auth.onForegroundCheck(async ready => {
    if (ready) { foreground++; assert.equal(await cold.auth.ensureSession(), true) }
  })
  assert.equal(await within(cold.auth.resumeSession()), true)
  await settle()
  assert.equal(foreground, 1)
  assert.equal(cold.calls.cloud.length, 2)
}

async function checkExpiryAndIdentity() {
  const env = await signedIn(), original = saved(env)
  env.server.now += day + 1
  const cold = environment(env)
  assert.equal(await within(cold.auth.initializeAuth()), true)
  assert.deepEqual(cold.calls.cloud.map(event => event.action), ['login'])
  assert.equal(cold.auth.currentUser.value.accountId, accountA)
  assert.notEqual(saved(cold).token, original.token)
  assert.equal(saved(cold).expiresAt, env.server.now + day)
  assert.equal(cold.calls.routes.length, 0, 'expiration renews an already chosen login without a prompt')

  // A server-revoked token also renews, while preserving the original account identity.
  await env.server.call({ action: 'logout', token: saved(cold).token })
  assert.equal((await cold.auth.authenticatedCall({ action: 'read' })).accountId, accountA)
  assert.deepEqual(cold.calls.cloud.slice(-4).map(event => event.action), ['read', 'session', 'login', 'read'])
  env.server.user = accountB
  assert.equal(await cold.auth.resumeSession(), false)
  assert.equal(cold.auth.currentUser.value, null)
  assert.equal(cold.auth.guestMode.value, true)
  assert.equal(cold.storage.has(cold.auth.SESSION_STORAGE_KEY), false)
  assert.equal(cold.calls.routes.at(-1), '/pages/home/index')
  assert.equal(await cold.auth.ensureSession(), false, 'mismatched identity is never silently accepted')
}

async function checkOfflineAndRetry() {
  const env = await signedIn(), original = env.storage.get(env.auth.SESSION_STORAGE_KEY)
  env.server.offline = true
  const cold = environment(env)
  assert.equal(await cold.auth.initializeAuth(), false)
  assert.equal(cold.auth.authStatus.value, 'offline')
  assert.equal(cold.auth.guestMode.value, false, 'a temporary outage must not replace a personal ledger with samples')
  assert.equal(cold.auth.authenticated.value, false)
  assert.equal(cold.storage.get(cold.auth.SESSION_STORAGE_KEY), original)
  assert.equal(cold.calls.removes.length, 0)
  assert.equal(cold.calls.routes.length, 0)
  env.server.offline = false
  assert.equal(await within(cold.auth.ensureSession()), true)
  assert.equal(cold.auth.currentUser.value.accountId, accountA)
  assert.equal(cold.auth.authError.value, '')

  // Offline renewal after expiry retains the old credentials for the next retry.
  env.server.now += day + 1
  env.server.offline = true
  assert.equal(await cold.auth.ensureSession(), false)
  assert.equal(cold.storage.get(cold.auth.SESSION_STORAGE_KEY), original)
  env.server.offline = false
  assert.equal(await cold.auth.ensureSession(), true)
  assert.notEqual(cold.storage.get(cold.auth.SESSION_STORAGE_KEY), original)
}

async function checkLogoutAndStaleRecovery() {
  const env = await signedIn(), key = env.auth.SESSION_STORAGE_KEY
  env.server.now += day + 1
  const heldRenewal = env.server.hold('login')
  const renewal = env.auth.ensureSession()
  const protectedCall = env.auth.authenticatedCall({ action: 'workspace' })
  const rejectedCall = assert.rejects(protectedCall, /登录状态已变化/)
  await settle()
  await env.auth.logout()
  assert.equal(env.storage.has(key), false)
  heldRenewal.resolve(env.server.respond({ action: 'login' }))
  assert.equal(await within(renewal), false)
  await within(rejectedCall)
  assert.equal(env.auth.guestMode.value, true)
  assert.equal(env.auth.currentUser.value, null)
  assert.equal(env.storage.has(key), false, 'an old renewal cannot recreate credentials after logout')
  assert.deepEqual(env.calls.routes, ['/pages/home/index'], 'a stale protected request cannot redirect logout back to login')
  const reopened = environment(env)
  assert.equal(await reopened.auth.initializeAuth(), false)
  assert.equal(reopened.calls.cloud.length, 0)

  // The same generation check applies when logout and recovery happen in one event turn.
  assert.equal(await env.auth.login(), true)
  const before = env.calls.cloud.length
  const started = env.auth.resumeSession()
  const exiting = env.auth.logout()
  await within(Promise.all([started, exiting]))
  assert.equal(env.auth.guestMode.value, true)
  assert.equal(env.storage.has(key), false)
  assert.equal(env.calls.cloud.slice(before).filter(event => event.action === 'login').length, 0)

  assert.equal(await env.auth.login(), true)
  const beforeCall = env.calls.cloud.length, beforeRoutes = env.calls.routes.length
  const sameTurnCall = env.auth.authenticatedCall({ action: 'read' })
  const sameTurnRejected = assert.rejects(sameTurnCall, /登录状态已变化/)
  await env.auth.logout()
  await within(sameTurnRejected)
  assert.deepEqual(env.calls.cloud.slice(beforeCall).map(event => event.action), ['logout'])
  assert.deepEqual(env.calls.routes.slice(beforeRoutes), ['/pages/home/index'])
}

async function checkInvalidCacheAndStorageFailures() {
  const seed = await signedIn(), key = seed.auth.SESSION_STORAGE_KEY
  const invalidValues = ['{', JSON.stringify({ schema: 1 }), JSON.stringify({ ...saved(seed), token: 'wrong' }),
    JSON.stringify({ ...saved(seed), expiresAt: -1 }), JSON.stringify({ ...saved(seed), schema: 2 })]
  for (const raw of invalidValues) {
    const storage = new Map([[key, raw], ['xiaoqing.ledger.v1', 'protected bills']])
    const env = environment({ storage })
    assert.equal(await env.auth.initializeAuth(), false)
    assert.equal(env.auth.guestMode.value, true)
    assert.equal(env.calls.cloud.length, 0)
    assert.equal(storage.get(key), raw, 'invalid cache is not silently overwritten')
    assert.equal(storage.get('xiaoqing.ledger.v1'), 'protected bills')
  }
  seed.storage.delete(key)
  const cleared = environment(seed)
  assert.equal(await cleared.auth.initializeAuth(), false)
  assert.equal(cleared.calls.cloud.length, 0, 'clearing the app cache ends remembered login')

  const failedRead = environment()
  failedRead.flags.readFails = true
  assert.equal(await failedRead.auth.initializeAuth(), false)
  assert.equal(failedRead.auth.authStatus.value, 'offline')
  assert.equal(failedRead.calls.cloud.length, 0)
  failedRead.flags.readFails = false
  assert.equal(await failedRead.auth.ensureSession(), false)
  assert.equal(failedRead.auth.guestMode.value, true, 'an empty cache becomes browsable after a read retry')

  const failedWrite = environment()
  await failedWrite.auth.initializeAuth()
  failedWrite.flags.writeFails = true
  assert.equal(await failedWrite.auth.login(), false)
  assert.equal(failedWrite.auth.authenticated.value, false)
  assert.equal(failedWrite.storage.has(key), false)
  assert.match(failedWrite.auth.authError.value, /保存登录状态/)

  const renewal = await signedIn(), previous = renewal.storage.get(key)
  renewal.server.now += day + 1
  renewal.flags.writeFails = true
  assert.equal(await renewal.auth.ensureSession(), false)
  assert.equal(renewal.auth.authStatus.value, 'offline')
  assert.equal(renewal.storage.get(key), previous, 'a failed renewal cache write preserves the original credentials')
  renewal.flags.writeFails = false
  assert.equal(await renewal.auth.ensureSession(), true)
  assert.notEqual(renewal.storage.get(key), previous)

  renewal.flags.removeFails = true
  await renewal.auth.logout()
  assert.equal(renewal.storage.get(key), '', 'logout uses an empty dedicated key if removal fails')
  const afterFallback = environment(renewal)
  assert.equal(await afterFallback.auth.initializeAuth(), false)
  assert.equal(afterFallback.calls.cloud.length, 0)

  const web = environment({ storage: new Map([[key, previous]]), cloudEnabled: false })
  assert.equal(await web.auth.initializeAuth(), false)
  assert.equal(web.calls.cloud.length, 0)
  assert.equal(web.calls.reads.length, 0, 'web preview never restores mini-program account credentials')
}

;(async () => {
  await checkFirstVisitAndReopen()
  await checkExpiryAndIdentity()
  await checkOfflineAndRetry()
  await checkLogoutAndStaleRecovery()
  await checkInvalidCacheAndStorageFailures()
  console.log('PASS auth persistence: consent-only first login, minimal dedicated cache, cold reopen verification, renewal, identity isolation, offline retries, logout races, invalid cache and storage failures')
})().catch(error => { console.error(error); process.exitCode = 1 })
