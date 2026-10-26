const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  vm = require('node:vm'),
  ts = require('typescript')
const { createHandler, APP_ID } = require('../cloudfunctions/ledger/handler')
const ledger = require('../cloudfunctions/ledger/core.cjs')
function mockDB() {
  let docs = new Map(),
    failWrites = false,
    queue = Promise.resolve()
  const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)))
  function collection(name, map = docs) {
    return {
      doc(id) {
        const key = name + '/' + id
        return {
          get: async () => ({ data: clone(map.get(key)) }),
          set: async ({ data }) => {
            if (failWrites) throw new Error('write failed')
            map.set(key, clone({ ...data, _id: id }))
          },
          remove: async () => {
            if (failWrites) throw new Error('write failed')
            map.delete(key)
          },
        }
      },
      where(filter) {
        return {
          orderBy() {
            return this
          },
          limit(n) {
            this.n = n
            return this
          },
          async get() {
            return {
              data: Array.from(map.entries())
                .filter(
                  ([key, value]) =>
                    key.startsWith(name + '/') &&
                    Object.entries(filter).every(([field, condition]) =>
                      condition && typeof condition === 'object'
                        ? 'gt' in condition && value[field] > condition.gt
                        : value[field] === condition,
                    ),
                )
                .map(([, value]) => clone(value))
                .sort((a, b) => a._id.localeCompare(b._id))
                .slice(0, this.n),
            }
          },
        }
      },
    }
  }
  const db = {
    collection: (name) => collection(name),
    command: { gt: (value) => ({ gt: value }) },
    runTransaction(fn) {
      const run = queue.then(async () => {
        const draft = new Map(Array.from(docs, ([k, v]) => [k, clone(v)]))
        const result = await fn({ collection: (name) => collection(name, draft) })
        docs = draft
        return { result }
      })
      queue = run.catch(() => {})
      return run
    },
    setFail: (v) => (failWrites = v),
    all: () => docs,
  }
  return db
}
const db = mockDB(),
  handler = createHandler(db),
  A = { OPENID: 'user-a', APPID: APP_ID },
  B = { OPENID: 'user-b', APPID: APP_ID }
let serial = 0
async function meta(context = A) {
  const result = await handler({ action: 'read' }, context)
  assert.equal(result.ok, true)
  return result
}
async function mutate(operation, args, context = A, overrides = {}) {
  const m = await meta(context)
  return handler(
    {
      action: 'mutate',
      accountId: m.accountId,
      baseRevision: m.revision,
      requestId: 'request_test_' + ++serial,
      operation,
      args,
      ...overrides,
    },
    context,
  )
}
const draft = {
  kind: 'expense',
  category: '餐饮',
  cents: 2500,
  date: '2026-10-26',
  note: '云端测试',
}
async function entries(context = A) {
  const m = await meta(context)
  let after = '',
    all = []
  do {
    const p = await handler(
      { action: 'page', accountId: m.accountId, revision: m.revision, after },
      context,
    )
    assert.equal(p.ok, true)
    all.push(...p.entries)
    after = p.next
  } while (after)
  return all
}
function clientFactory() {
  const output = { exports: {} }
  vm.runInNewContext(
    ts.transpileModule(fs.readFileSync('src/core/cloud-client.ts', 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText,
    { exports: output.exports, require: () => ledger, Error, Date, Math, JSON, console },
  )
  return output.exports.createCloudClient
}
function memoryStorage() {
  const map = new Map()
  return {
    map,
    get: (key) => map.get(key) || '',
    set: (key, value) => map.set(key, value),
    remove: (key) => map.delete(key),
  }
}
;(async () => {
  assert.equal((await handler({ action: 'read' }, {})).code, 'AUTH')
  assert.equal((await handler({ action: 'read' }, { ...A, APPID: 'wrong' })).code, 'AUTH')
  const first = await mutate('save', { draft, createId: 'entry_stable_test_1' })
  assert.equal(first.ok, true)
  assert.equal(first.result.cents, 2500)
  assert.equal((await entries(B)).length, 0)
  assert.equal(
    (await handler({ action: 'page', accountId: (await meta(A)).accountId, revision: 1 }, B)).code,
    'AUTH',
  )
  assert.equal(
    (await mutate('save', { draft, id: first.result.id, expectedVersion: 1 }, B)).code,
    'CONFLICT',
  )
  const idempotentMeta = await meta()
  const event = {
    action: 'mutate',
    accountId: idempotentMeta.accountId,
    baseRevision: idempotentMeta.revision,
    requestId: 'request_idempotent',
    operation: 'save',
    args: { draft },
  }
  const response = await handler(event, A)
  assert.equal(response.ok, true)
  assert.deepEqual(await handler(event, A), response)
  assert.equal((await entries()).length, 2)
  assert.equal(
    (await handler({ ...event, args: { draft: { ...draft, cents: 999 } } }, A)).code,
    'VALIDATION',
  )
  assert.equal((await mutate('save', { draft, createId: 'entry_stable_test_1' })).code, 'CONFLICT')
  const before = await meta()
  assert.equal(
    (
      await mutate('setBudget', {
        month: '2026-10',
        budget: { total: 4000, categories: { 餐饮: 3000 } },
      })
    ).ok,
    true,
  )
  assert.equal(
    (await mutate('save', { draft }, A, { baseRevision: before.revision })).code,
    'CONFLICT',
  )
  assert.equal((await mutate('save', { draft: { ...draft, cents: 0 } })).code, 'VALIDATION')
  assert.equal((await mutate('addCategory', { kind: 'expense', name: '咖啡' })).ok, true)
  const coffee = await mutate('save', { draft: { ...draft, category: '咖啡' } })
  assert.equal(coffee.ok, true)
  assert.equal(
    (await mutate('removeCategory', { kind: 'expense', name: '咖啡' })).code,
    'VALIDATION',
  )
  assert.equal(
    (await mutate('remove', { id: coffee.result.id, version: coffee.result.version })).ok,
    true,
  )
  assert.equal((await mutate('removeCategory', { kind: 'expense', name: '咖啡' })).ok, true)
  const stateBefore = await meta()
  db.setFail(true)
  const failed = await mutate('save', { draft })
  assert.equal(failed.ok, false)
  db.setFail(false)
  assert.equal((await meta()).revision, stateBefore.revision)
  const backup = { ...ledger.emptyState(), entries: [{ ...first.result, id: 'legacy-import-1' }] }
  assert.equal((await mutate('importBatch', { text: JSON.stringify(backup) })).result.added, 1)
  assert.equal((await mutate('importBatch', { text: JSON.stringify(backup) })).result.skipped, 1)
  const batch = {
    ...ledger.emptyState(),
    entries: Array.from({ length: 20 }, (_, i) => ({ ...first.result, id: 'batch-entry-' + i })),
  }
  assert.equal((await mutate('importBatch', { text: JSON.stringify(batch) })).result.added, 20)
  for (let i = 0; i < 5; i++) {
    const b = { ...batch, entries: batch.entries.map((e) => ({ ...e, id: e.id + '-' + i })) }
    assert.equal((await mutate('importBatch', { text: JSON.stringify(b) })).ok, true)
  }
  assert.equal((await entries()).length, 123)
  const stale = await meta()
  await mutate('setHidden', { value: true })
  assert.equal(
    (await handler({ action: 'page', accountId: stale.accountId, revision: stale.revision }, A))
      .code,
    'CONFLICT',
  )
  // Two concurrent writers start at the same revision; exactly one may commit.
  const concurrent = await meta()
  const results = await Promise.all(
    [1, 2].map((n) =>
      handler(
        {
          action: 'mutate',
          accountId: concurrent.accountId,
          baseRevision: concurrent.revision,
          requestId: 'concurrent_req_' + n,
          operation: 'save',
          args: { draft },
        },
        A,
      ),
    ),
  )
  assert.equal(results.filter((r) => r.ok).length, 1)
  const makeClient = clientFactory(),
    storage = memoryStorage()
  let dropResponse = false
  const client = makeClient(
    async (event) => {
      const result = await handler(event, A)
      if (event.action === 'mutate' && dropResponse) {
        dropResponse = false
        throw new Error('response lost')
      }
      return result
    },
    storage,
    'env-test',
  )
  await client.load()
  const count = (await entries()).length
  dropResponse = true
  await assert.rejects(client.mutate('save', { draft }))
  assert.ok(client.pending())
  assert.equal((await entries()).length, count + 1)
  assert.throws(() => client.discardPending())
  const restarted = makeClient((event) => handler(event, A), storage, 'env-test')
  const recovered = await restarted.load()
  assert.equal(recovered.state.entries.length, count + 1)
  assert.equal(restarted.pending(), null)
  assert.equal((await entries()).length, count + 1)
  // Changing accounts never sends A's pending operation as B and never exposes A's records.
  const isolated = makeClient((event) => handler(event, B), storage, 'env-test')
  assert.equal((await isolated.load()).state.entries.length, 0)
  const storageFail = makeClient(
    (event) => handler(event, B),
    {
      get: () => '',
      set: () => {
        throw new Error('disk full')
      },
      remove: () => {},
    },
    'env-test',
  )
  await storageFail.load()
  await assert.rejects(storageFail.mutate('save', { draft }))
  assert.equal((await entries(B)).length, 0)
  let offline = true
  const pendingStore = memoryStorage()
  const rejected = makeClient(
    async (event) => {
      if (event.action === 'mutate' && offline) throw new Error('offline')
      return handler(event, B)
    },
    pendingStore,
    'env-test',
  )
  await rejected.load()
  await assert.rejects(rejected.mutate('save', { draft }))
  await mutate('save', { draft }, B)
  offline = false
  await assert.rejects(rejected.load())
  assert.equal(rejected.canDiscard(), true)
  rejected.discardPending()
  assert.ok([...pendingStore.map.keys()].some((k) => k.endsWith('.discarded')))
  await rejected.load()
  console.log(
    'PASS cloud: trusted identity isolation, transactions/rollback, pagination, optimistic conflicts, durable idempotency, stable create IDs, batch migration, interrupted response recovery, account switch and local journal failure',
  )
})().catch((e) => {
  console.error(e)
  process.exitCode = 1
})
