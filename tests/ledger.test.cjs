const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
const vm = require('node:vm')
const mod = { exports: {} }
vm.runInNewContext(
  ts.transpileModule(fs.readFileSync('src/core/ledger.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText,
  { exports: mod.exports, console, Date, Math, Set, JSON, Error },
)
const { parseMoney, money, validDate, createRepository, summarize } = mod.exports
assert.equal(parseMoney('0.01'), 1)
assert.equal(parseMoney('12.3'), 1230)
assert.equal(parseMoney('99999999.99'), 9999999999)
for (const value of ['0', '-1', '1.001', '1e3', 'NaN', '100000000', ''])
  assert.throws(() => parseMoney(value))
assert.equal(money(parseMoney('0.10') + parseMoney('0.20')), '0.30')
assert.equal(validDate('2024-02-29'), true)
assert.equal(validDate('2025-02-29'), false)
assert.equal(validDate('2026-13-01'), false)
let raw = ''
let fail = false
const repo = createRepository({
  read: () => raw,
  write: (v) => {
    if (fail) throw new Error('storage full')
    raw = v
  },
})
const draft = { kind: 'expense', cents: 2500, category: '餐饮', date: '2026-10-26', note: '午餐' }
const one = repo.save(draft)
assert.equal(repo.list().length, 1)
assert.equal(repo.list()[0].cents, 2500)
const updated = repo.save({ ...draft, cents: 3000 }, one.id, 1)
assert.equal(updated.version, 2)
assert.equal(repo.list().length, 1)
assert.throws(() => repo.save(draft, one.id, 1))
assert.throws(() => repo.remove(one.id, 1))
const two = repo.save({ ...draft, kind: 'income', category: '工资', cents: 10000 })
assert.equal(summarize(repo.list()).expense, 3000)
assert.equal(summarize(repo.list()).income, 10000)
const previous = raw
fail = true
assert.throws(() => repo.save(draft))
assert.equal(raw, previous)
fail = false
assert.throws(() => repo.save({ ...draft, category: '不存在' }))
assert.equal(raw, previous)
repo.remove(one.id, 2)
assert.equal(repo.list().length, 1)
repo.remove(two.id, 1)
assert.equal(repo.list().length, 0)
raw = 'broken'
assert.throws(() => repo.list())
assert.throws(() => repo.save(draft))
assert.equal(raw, 'broken')
raw = JSON.stringify({ schema: 2, entries: [] })
assert.throws(() => repo.save(draft))
raw = JSON.stringify({ schema: 1, entries: [{ ...one }, { ...one }] })
assert.throws(() => repo.list())
console.log(
  'PASS: money precision, invalid amounts, calendar dates, CRUD, stale edits/deletes, monthly totals, storage failures, corrupt/schema/duplicate data protection',
)

// v0.2: legacy upgrade, budgets, categories, safe backup merge, CSV, calendar and calculator.
const {
  calculateMoney,
  emptyState,
  categoryOptions,
  inMonth,
  calendar,
  groupDays,
  categoryTotals,
  budgetProgress,
  parseBackup,
  toCsv,
  shiftMonth,
} = mod.exports
assert.equal(calculateMoney('18.5+6-2'), 2250)
assert.equal(calculateMoney('0.1+0.2'), 30)
assert.equal(calculateMoney('1-1+2'), 200)
for (const expression of [
  '1+',
  '1--2',
  '2*3',
  '1/2',
  '1e2',
  '1-2',
  '0',
  '1.001',
  'alert(1)',
  '99999999.99+1',
])
  assert.throws(() => calculateMoney(expression))
assert.equal(shiftMonth('2026-01', -1), '2025-12')
assert.equal(shiftMonth('2024-12', 1), '2025-01')
const original = JSON.stringify({
  schema: 1,
  entries: [{ ...one, note: 'old', updatedAt: '2026-10-26T00:00:00Z' }],
})
raw = original
assert.equal(repo.read().schema, 2)
assert.equal(repo.list()[0].note, 'old')
assert.equal(raw, original)
fail = true
assert.throws(() => repo.setBudget('2026-10', { total: 10000, categories: { 餐饮: 4000 } }))
assert.equal(raw, original)
fail = false
repo.setBudget('2026-10', { total: 10000, categories: { 餐饮: 4000 } })
assert.equal(JSON.parse(raw).schema, 2)
assert.equal(repo.list()[0].note, 'old')
assert.equal(repo.read().budgets['2026-10'].total, 10000)
assert.equal(repo.read().budgets['2026-11'], undefined)
assert.throws(() => repo.setBudget('2026-13', { total: 100, categories: {} }))
assert.throws(() => repo.setBudget('2026-11', { total: -1, categories: {} }))
assert.throws(() => repo.setBudget('2026-11', { total: 100, categories: { 餐饮: 0 } }))
assert.equal(budgetProgress(100, 120).over, true)
assert.equal(budgetProgress(100, 120).remaining, -20)
assert.equal(budgetProgress(100, 120).percent, 100)
assert.equal(budgetProgress(0, 120).over, false)
repo.addCategory('expense', '咖啡')
assert.equal(categoryOptions(repo.read(), 'expense').includes('咖啡'), true)
assert.throws(() => repo.addCategory('expense', '咖啡'))
assert.throws(() => repo.addCategory('expense', '__proto__'))
assert.throws(() => repo.addCategory('expense', '餐饮'))
const coffee = repo.save({ ...draft, category: '咖啡', cents: 1900 })
repo.removeCategory('expense', '咖啡')
assert.equal(categoryOptions(repo.read(), 'expense').includes('咖啡'), false)
repo.addCategory('expense', '咖啡')
repo.remove(coffee.id, coffee.version)
repo.setBudget('2026-11', { total: 0, categories: { 咖啡: 5000 } })
repo.removeCategory('expense', '咖啡')
repo.addCategory('expense', '可删除')
repo.removeCategory('expense', '可删除')
assert.equal(categoryOptions(repo.read(), 'expense').includes('可删除'), false)
repo.setHidden(true)
assert.equal(repo.read().hideAmounts, true)
const backup = repo.exportBackup()
assert.equal(parseBackup(backup).entries.length, 1)
assert.equal(repo.previewImport(backup).added, 0)
assert.equal(repo.previewImport(backup).skipped, 1)
const foreign = createRepository({ read: () => '', write: () => {} })
const other = emptyState()
other.entries = [
  { ...one, note: 'remote conflict', updatedAt: '2026-10-27T00:00:00Z' },
  {
    ...one,
    id: 'import-new',
    date: '2026-11-01',
    note: '=SUM(A1:A9)',
    updatedAt: '2026-10-27T00:00:00Z',
  },
]
other.budgets = {
  '2026-10': { total: 500, categories: {} },
  '2026-12': { total: 300, categories: {} },
}
other.customCategories.expense = ['旅行']
const importText = JSON.stringify(other)
const beforeImport = raw
const plan = repo.previewImport(importText)
assert.equal(plan.added, 1)
assert.equal(plan.conflicts, 1)
assert.equal(raw, beforeImport)
fail = true
assert.throws(() => repo.importBackup(importText))
assert.equal(raw, beforeImport)
fail = false
repo.importBackup(importText)
assert.equal(repo.list().length, 2)
assert.equal(repo.list().find((e) => e.id === one.id).note, 'old')
assert.equal(repo.read().budgets['2026-10'].total, 10000)
assert.equal(repo.read().budgets['2026-12'].total, 300)
assert.equal(repo.read().hideAmounts, true)
assert.equal(repo.importBackup(importText).added, 0)
assert.equal(repo.list().length, 2)
const preserved = raw
assert.throws(() => repo.importBackup('{bad json'))
assert.throws(() => repo.importBackup(JSON.stringify({ schema: 2, entries: [] })))
assert.equal(raw, preserved)
const csv = toCsv([
  { ...one, note: '=SUM(A1:A9)' },
  { ...one, note: 'hello,"world"\nnext' },
])
assert.ok(csv.startsWith('\uFEFF'))
assert.ok(csv.includes("'=SUM"))
assert.ok(csv.includes('hello,""world""\nnext'))
const days = calendar('2024-02', [
  { ...one, date: '2024-02-29', cents: 1250 },
  { ...one, id: 'income', kind: 'income', category: '工资', date: '2024-02-29', cents: 5000 },
])
assert.equal(days.length, 32)
assert.equal(days[3].day, 1)
assert.equal(days[31].expense, 1250)
assert.equal(days[31].income, 5000)
assert.equal(calendar('2026-02', []).filter((d) => d.day).length, 28)
assert.equal(calendar('2026-06', [])[0].day, 1)
assert.equal(inMonth(repo.list(), '2026-10').length, 1)
assert.equal(inMonth(repo.list(), '2026-11').length, 1)
assert.equal(groupDays(repo.list())[0].date, '2026-11-01')
assert.equal(categoryTotals(repo.list(), 'expense')[0].percent, 100)
console.log(
  'PASS: v1 non-destructive migration, failed migration writes, month/category budgets, overspending, custom categories, calculator cents, backup validation/preview/idempotent merge/conflicts, CSV injection protection, leap-year calendar and month filtering',
)
