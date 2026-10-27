process.env.XQ_APP_ID = 'wx0000000000000000' // Synthetic test identity.
const assert = require('node:assert/strict')
const { mockDB } = require('./mock-db.cjs')
const { createHandler, APP_ID } = require('../cloudfunctions/ledger/handler')
const {
  createFeatures,
  chinaDate,
  dueDate,
  periodOf,
  nextDate,
  cycleId,
  hash,
} = require('../cloudfunctions/ledger/features')
const { emptyState, normalizeState } = require('../cloudfunctions/ledger/core.cjs')
;(async () => {
  const db = mockDB(),
    handler = createHandler(db),
    features = createFeatures(db)
  const A = { OPENID: 'alice', APPID: APP_ID },
    B = { OPENID: 'bob', APPID: APP_ID },
    C = { OPENID: 'charlie', APPID: APP_ID }
  const users = new Map()
  for (const ctx of [A, B, C]) users.set(ctx, await handler({ action: 'login' }, ctx))
  let seq = 0
  const call = (ctx, action, args = {}, bookId = '') =>
    handler(
      { action, args, bookId, token: users.get(ctx).token, accountId: users.get(ctx).accountId },
      ctx,
    )
  const read = (ctx, bookId = '') => call(ctx, 'read', {}, bookId)
  async function mutate(ctx, operation, args, bookId = '') {
    const m = await read(ctx, bookId)
    return handler(
      {
        action: 'mutate',
        operation,
        args,
        bookId,
        token: users.get(ctx).token,
        accountId: m.accountId,
        baseRevision: m.revision,
        requestId: 'features_request_' + ++seq,
      },
      ctx,
    )
  }
  async function entries(ctx, bookId = '') {
    const m = await read(ctx, bookId)
    const p = await handler(
      {
        action: 'page',
        bookId,
        token: users.get(ctx).token,
        accountId: m.accountId,
        revision: m.revision,
      },
      ctx,
    )
    assert.equal(p.ok, true)
    return p.entries
  }
  const now = chinaDate(),
    draft = { kind: 'expense', cents: 1200, category: '居家', date: now, note: 'test' }
  assert.equal((await call(A, 'profileSave', { name: 'Alice', version: 0 })).ok, true)
  assert.equal((await call(B, 'profileSave', { name: 'Bob', version: 0 })).ok, true)
  assert.equal((await call(A, 'profileSave', { name: 'Bad', version: 0 })).code, 'CONFLICT')
  assert.equal(
    (
      await call(A, 'profileSave', {
        name: 'Alice',
        version: 1,
        avatarBase64: Buffer.from('not image').toString('base64'),
      })
    ).code,
    'VALIDATION',
  )
  const g = await call(A, 'groupCreate', { name: '家庭', requestId: 'create_group_id_1' })
  assert.equal(g.ok, true)
  assert.equal(
    (await call(A, 'groupCreate', { name: '家庭', requestId: 'create_group_id_1' })).groupId,
    g.groupId,
  )
  assert.equal((await read(B, g.groupId)).code, 'FORBIDDEN')
  const oldInvite = await call(A, 'groupInvite', { groupId: g.groupId }),
    invite = await call(A, 'groupInvite', { groupId: g.groupId })
  assert.equal((await call(B, 'groupJoin', { code: oldInvite.code })).code, 'VALIDATION')
  assert.equal((await call(B, 'groupJoin', { code: invite.code })).ok, true)
  assert.equal((await call(B, 'groupInvite', { groupId: g.groupId })).code, 'FORBIDDEN')
  assert.equal((await call(B, 'workspace')).groups.length, 1)
  assert.equal(
    (
      await mutate(
        A,
        'setBudget',
        { month: now.slice(0, 7), budget: { total: 100000, categories: {} } },
        g.groupId,
      )
    ).ok,
    true,
  )
  assert.equal((await read(B, g.groupId)).settings.budgets[now.slice(0, 7)].total, 100000)
  assert.equal(
    (
      await mutate(
        B,
        'setBudget',
        { month: now.slice(0, 7), budget: { total: 1, categories: {} } },
        g.groupId,
      )
    ).code,
    'FORBIDDEN',
  )
  const bBill = await mutate(
    B,
    'save',
    {
      draft: {
        ...draft,
        author: { id: users.get(A).accountId, name: 'forged', avatar: '' },
        ruleId: 'rule_' + 'f'.repeat(32),
        period: now,
        automatic: true,
      },
    },
    g.groupId,
  )
  assert.equal(bBill.ok, true)
  assert.equal(bBill.result.author.id, users.get(B).accountId)
  assert.equal(bBill.result.author.name, 'Bob')
  assert.equal(bBill.result.ruleId, undefined)
  assert.equal((await entries(A, g.groupId)).length, 1)
  assert.equal((await entries(A)).length, 0)
  assert.equal((await entries(B)).length, 0)
  assert.equal(
    (await mutate(A, 'remove', { id: bBill.result.id, version: 1 }, g.groupId)).code,
    'FORBIDDEN',
  )
  assert.equal((await read(C, g.groupId)).code, 'FORBIDDEN')
  assert.equal((await call(B, 'groupLeave', { groupId: g.groupId })).ok, true)
  assert.equal((await read(B, g.groupId)).code, 'FORBIDDEN')
  assert.equal((await entries(A, g.groupId)).length, 1)
  assert.equal((await call(A, 'groupDelete', { groupId: g.groupId })).code, 'VALIDATION')
  const emptyGroup = await call(A, 'groupCreate', {
    name: 'empty',
    requestId: 'empty_group_request_1',
  })
  assert.equal((await call(A, 'groupDelete', { groupId: emptyGroup.groupId })).ok, true)
  assert.equal((await read(A, emptyGroup.groupId)).code, 'FORBIDDEN')
  // Calendar semantics do not depend on the server machine's timezone.
  assert.equal(chinaDate(Date.parse('2026-01-31T16:00:00Z')), '2026-02-01')
  assert.equal(dueDate({ frequency: 'monthly', day: 31 }, '2024-02-01'), '2024-02-29')
  assert.equal(dueDate({ frequency: 'monthly', day: 31 }, '2025-02-01'), '2025-02-28')
  assert.equal(periodOf({ frequency: 'weekly' }, '2026-01-04'), '2025-12-29')
  assert.equal(nextDate({ frequency: 'monthly', day: 31 }, '2025-12-31'), '2026-01-31')
  const ruleBase = {
    name: '订阅',
    frequency: 'monthly',
    day: Number(now.slice(8)),
    cents: 1200,
    category: '居家',
    note: '',
  }
  const rule = (await mutate(A, 'createRule', { rule: ruleBase })).result
  assert.ok(rule.id)
  const first = await mutate(A, 'save', { draft, ruleId: rule.id })
  assert.equal(first.ok, true)
  await features.runScheduled(now)
  assert.equal((await entries(A)).length, 1)
  assert.equal((await mutate(A, 'save', { draft, ruleId: rule.id })).code, 'CONFLICT')
  const nextRule = (await mutate(A, 'createRule', { rule: { ...ruleBase, name: '另一订阅' } }))
    .result
  await Promise.all([features.runScheduled(now), features.runScheduled(now)])
  let bills = await entries(A)
  assert.equal(bills.length, 2)
  const auto = bills.find((e) => e.ruleId === nextRule.id)
  assert.equal(auto.automatic, true)
  const manual = await mutate(A, 'save', { draft: { ...draft, cents: 1500 }, ruleId: nextRule.id })
  assert.equal(manual.ok, true)
  assert.equal(manual.result.id, auto.id)
  assert.equal(manual.result.automatic, false)
  assert.equal((await entries(A)).length, 2)
  assert.equal(
    (await mutate(A, 'remove', { id: manual.result.id, version: manual.result.version })).ok,
    true,
  )
  await features.runScheduled(now)
  assert.equal((await entries(A)).length, 1)
  const pauseRule = (await mutate(A, 'createRule', { rule: { ...ruleBase, name: '暂停' } })).result
  await mutate(A, 'toggleRule', { ruleId: pauseRule.id, active: false })
  await features.runScheduled(now)
  assert.equal((await entries(A)).length, 1)
  assert.equal((await mutate(A, 'save', { draft, ruleId: pauseRule.id })).code, 'VALIDATION')
  // Deleting a rule preserves bills, prevents future runs and cannot be reversed by toggle.
  const countBeforeDelete = (await entries(A)).length
  assert.equal((await mutate(C, 'deleteRule', { ruleId: rule.id })).code, 'VALIDATION')
  assert.equal((await mutate(A, 'deleteRule', { ruleId: rule.id })).ok, true)
  assert.equal(
    (await read(A)).rules.some((r) => r.id === rule.id),
    false,
  )
  assert.equal((await entries(A)).length, countBeforeDelete)
  assert.equal(
    (await mutate(A, 'toggleRule', { ruleId: rule.id, active: true })).code,
    'VALIDATION',
  )
  assert.equal((await mutate(A, 'save', { draft, ruleId: rule.id })).code, 'VALIDATION')
  assert.equal(
    (
      await mutate(A, 'save', {
        draft: { ...draft, note: '保留账单仍可编辑' },
        ruleId: rule.id,
        id: first.result.id,
        expectedVersion: first.result.version,
      })
    ).ok,
    true,
  )
  const doomed = (await mutate(A, 'createRule', { rule: ruleBase })).result
  assert.equal((await mutate(A, 'deleteRule', { ruleId: doomed.id })).ok, true)
  await features.runScheduled(now)
  assert.equal((await entries(A)).length, countBeforeDelete)
  assert.equal((await mutate(A, 'deleteRule', { ruleId: doomed.id })).ok, true)
  // A member leaving disables their automatic group bill on the next timer tick.
  await call(B, 'groupJoin', { code: invite.code })
  const groupRule = (await mutate(B, 'createRule', { rule: ruleBase }, g.groupId)).result
  const ownerRule = (await mutate(A, 'createRule', { rule: ruleBase }, g.groupId)).result
  assert.equal(
    (await mutate(B, 'deleteRule', { ruleId: ownerRule.id }, g.groupId)).code,
    'FORBIDDEN',
  )
  assert.equal((await mutate(A, 'deleteRule', { ruleId: ownerRule.id }, g.groupId)).ok, true)
  const memberRule = (await mutate(B, 'createRule', { rule: ruleBase }, g.groupId)).result
  assert.equal((await mutate(A, 'deleteRule', { ruleId: memberRule.id }, g.groupId)).ok, true)
  await call(B, 'groupLeave', { groupId: g.groupId })
  await features.runScheduled(now)
  assert.equal(db.all().get('xq_books/' + groupRule.id).active, false)
  assert.equal((await entries(A, g.groupId)).length, 1)
  // Metadata survives export/normalization, while new imports cannot impersonate another member.
  const normalized = normalizeState({ ...emptyState(), entries: await entries(A) })
  assert.equal(normalized.entries[0].author.name, 'Alice')
  const imported = await mutate(C, 'importBatch', {
    text: JSON.stringify({ ...emptyState(), entries: normalized.entries }),
  })
  assert.equal(imported.ok, true)
  const ci = (await entries(C))[0]
  assert.equal(ci.author.id, users.get(C).accountId)
  assert.equal(ci.ruleId, undefined)
  // All legacy categories are mutable; history remains readable after rename/removal.
  const activeRule = (await mutate(A, 'createRule', { rule: ruleBase })).result
  const oldEntries = await entries(A)
  assert.equal(
    (await mutate(A, 'renameCategory', { kind: 'expense', name: '居家', newName: '家庭' })).ok,
    true,
  )
  let settings = (await read(A)).settings
  assert.ok(settings.categoryList.expense.includes('家庭'))
  assert.ok(!settings.categoryList.expense.includes('居家'))
  assert.equal(db.all().get('xq_books/' + activeRule.id).category, '家庭')
  assert.deepEqual(await entries(A), oldEntries)
  assert.equal((await mutate(A, 'save', { draft })).code, 'VALIDATION')
  assert.equal(
    (await mutate(A, 'renameCategory', { kind: 'expense', name: '家庭', newName: '交通' })).code,
    'VALIDATION',
  )
  assert.equal((await mutate(A, 'removeCategory', { kind: 'expense', name: '家庭' })).ok, true)
  assert.equal(db.all().get('xq_books/' + activeRule.id).active, false)
  assert.equal(
    (await mutate(A, 'toggleRule', { ruleId: activeRule.id, active: true })).code,
    'VALIDATION',
  )
  const old = (await entries(A))[0]
  assert.equal(
    (
      await mutate(A, 'save', {
        id: old.id,
        expectedVersion: old.version,
        ruleId: old.ruleId,
        draft: { ...old, note: '分类删除后编辑' },
      })
    ).ok,
    true,
  )
  for (const name of (await read(A)).settings.categoryList.income)
    assert.equal((await mutate(A, 'removeCategory', { kind: 'income', name })).ok, true)
  assert.deepEqual((await read(A)).settings.categoryList.income, [])
  await call(B, 'groupJoin', { code: invite.code })
  assert.equal(
    (
      await mutate(
        B,
        'renameCategory',
        { kind: 'expense', name: '居家', newName: '家庭' },
        g.groupId,
      )
    ).code,
    'FORBIDDEN',
  )
  const fs = require('node:fs'),
    vm = require('node:vm')
  let runtimeContext = {},
    scheduled = 0,
    marker
  const exports = {}
  const fakeDB = {
    collection: () => ({
      doc: () => ({
        set: async (r) => {
          marker = r.data
        },
      }),
    }),
  }
  vm.runInNewContext(fs.readFileSync('cloudfunctions/ledger/index.js', 'utf8'), {
    exports,
    Date,
    require: (name) => {
      if (name === 'wx-server-sdk')
        return { init: () => {}, database: () => fakeDB, getWXContext: () => runtimeContext }
      if (name === './handler')
        return { createHandler: () => async () => ({ ok: false, code: 'AUTH' }) }
      if (name === './features')
        return {
          createFeatures: () => ({
            runScheduled: async () => {
              scheduled++
              return { failed: 0 }
            },
          }),
        }
    },
  })
  const timerEvent = { Type: 'Timer', TriggerName: 'ledgerRecurring', SOURCE: 'wx_trigger' }
  assert.equal((await exports.main(timerEvent)).code, 'AUTH')
  runtimeContext = { SOURCE: 'wx_client', OPENID: 'fake', APPID: APP_ID }
  assert.equal((await exports.main(timerEvent)).code, 'AUTH')
  assert.equal(scheduled, 0)
  runtimeContext = { SOURCE: 'wx_trigger' }
  await exports.main(timerEvent)
  assert.equal(scheduled, 1)
  assert.equal(marker.healthy, true)
  console.log(
    'PASS features: profiles, group join/invite rotation/membership, shared budget, private separation, author forgery rejection, recurring monthly/weekly boundaries, manual/automatic dedup, concurrent timer retries, pause/deletion/leave safety, import attribution',
  )
})().catch((e) => {
  console.error(e)
  process.exitCode = 1
})
