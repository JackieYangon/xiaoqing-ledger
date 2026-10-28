const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
const vm = require('node:vm')
const modules = {}
function load(name) {
  if (modules[name]) return modules[name]
  const exports = {}
  vm.runInNewContext(
    ts.transpileModule(fs.readFileSync(`src/core/${name}.ts`, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText,
    { exports, require: (path) => load(path.replace('./', '')), console, Date, Math, Set, JSON, Error },
  )
  modules[name] = exports
  return exports
}
const { emptyState, createRepository, MAX_CENTS } = load('ledger')
const { filterEntries, previousMonthBudget, sumCategoryBudget, budgetPace, periodReport } = load('insights')
const plain = (value) => JSON.parse(JSON.stringify(value))
const entry = (id, date, cents, extra = {}) => ({
  id, date, cents, kind: 'expense', category: '餐饮', note: '', version: 1,
  updatedAt: `${date}T12:00:00Z`, ...extra,
})

// Search spans months and retains removed categories, authors and inclusive amount/date limits.
const source = [
  entry('later', '2026-10-03', 2500, { note: 'Coffee' }),
  entry('first', '2026-09-30', 500, { category: '旧分类' }),
  entry('tie', '2026-10-03', 2500, { author: { id: 'a'.repeat(64), name: '青禾', avatar: '' } }),
  entry('salary', '2026-10-01', 50000, { kind: 'income', category: '工资' }),
]
const beforeSearch = JSON.stringify(source)
Object.freeze(source)
source.forEach(Object.freeze)
assert.deepEqual(plain(filterEntries(source, { startDate: '2026-09-30', endDate: '2026-10-03', minAmount: '5', maxAmount: '25', sort: 'amount-asc' }).map((e) => e.id)), ['first', 'later', 'tie'])
assert.deepEqual(plain(filterEntries(source, { category: '旧分类' }).map((e) => e.id)), ['first'])
assert.deepEqual(plain(filterEntries(source, { query: ' coffee ' }).map((e) => e.id)), ['later'])
assert.deepEqual(plain(filterEntries(source, { query: '青禾' }).map((e) => e.id)), ['tie'])
assert.deepEqual(plain(filterEntries(source, { kind: 'income' }).map((e) => e.id)), ['salary'])
assert.deepEqual(plain(filterEntries(source, { sort: 'date-asc' }).map((e) => e.id)), ['first', 'salary', 'later', 'tie'])
assert.deepEqual(plain(filterEntries(source, { sort: 'date-desc' }).map((e) => e.id)), ['later', 'tie', 'salary', 'first'])
assert.deepEqual(plain(filterEntries(source, { sort: 'amount-desc' }).map((e) => e.id)), ['salary', 'later', 'tie', 'first'])
assert.equal(filterEntries(source, { minAmount: '0', maxAmount: '0.00' }).length, 0)
assert.equal(filterEntries(source, { minAmount: '0', maxAmount: '99999999.99' }).length, 4)
assert.equal(filterEntries(source, { startDate: '2026-10-01', endDate: '2026-10-01' }).length, 1)
assert.equal(JSON.stringify(source), beforeSearch)
for (const filter of [
  { startDate: '2025-02-29' }, { endDate: '2026-02-30' },
  { startDate: '2026-11-01', endDate: '2026-10-01' },
  { minAmount: '25.01', maxAmount: '25' },
  ...['-1', '1.001', '1e2', '100000000', '1+', 'NaN', '.1'].map((minAmount) => ({ minAmount })),
  { kind: 'transfer' }, { sort: 'unknown' },
]) assert.throws(() => filterEntries(source, filter))
assert.equal(filterEntries([entry('leap', '2024-02-29', 1)], { startDate: '2024-02-29', endDate: '2024-02-29' }).length, 1)

// Copy only prepares independent fields, including categories no longer selectable for new bills.
const state = emptyState()
state.budgets['2025-12'] = { total: 30000, categories: { 餐饮: 10000, 旧分类: 7000 } }
state.budgets['2026-01'] = { total: 10000, categories: { 交通: 10000 } }
const beforeCopy = JSON.stringify(state)
const copied = previousMonthBudget(state, '2026-01')
assert.deepEqual(plain(copied), { total: 30000, categories: { 餐饮: 10000, 旧分类: 7000 } })
copied.categories.旧分类 = 1
copied.total = 1
assert.equal(JSON.stringify(state), beforeCopy)
assert.equal(previousMonthBudget(state, '2025-12'), null)
assert.throws(() => previousMonthBudget(state, '2026-13'))
assert.equal(sumCategoryBudget({ 餐饮: '0.10', 交通: '0.20', 其他: ' ' }), 30)
assert.equal(sumCategoryBudget({}), 0)
assert.equal(sumCategoryBudget({ 餐饮: '99999999.99' }), MAX_CENTS)
assert.throws(() => sumCategoryBudget({ 餐饮: '99999999.99', 交通: '0.01' }))
assert.throws(() => sumCategoryBudget({ 餐饮: '3.001' }))
assert.throws(() => sumCategoryBudget({ 餐饮: '0' }))
let raw = beforeCopy
const repo = createRepository({ read: () => raw, write: () => { throw new Error('存储失败') } })
assert.throws(() => repo.setBudget('2026-01', previousMonthBudget(repo.read(), '2026-01')))
assert.equal(raw, beforeCopy)

// Remaining daily allowance includes today, uses integer cents, and never becomes negative.
const budget = { total: 10000, categories: {} }
let pace = budgetPace([entry('spent', '2024-02-01', 3000)], budget, '2024-02', '2024-02-28')
assert.equal(pace.phase, 'current')
assert.equal(pace.daysRemaining, 2)
assert.equal(pace.dailyAllowance, 3500)
pace = budgetPace([entry('spent', '2024-02-29', 10001)], budget, '2024-02', '2024-02-29')
assert.equal(pace.remaining, -1)
assert.equal(pace.dailyAllowance, 0)
assert.equal(pace.daysRemaining, 1)
assert.equal(budgetPace([], budget, '2026-11', '2026-10-28').dailyAllowance, 333)
assert.equal(budgetPace([], budget, '2026-09', '2026-10-28').dailyAllowance, null)
assert.equal(budgetPace([], undefined, '2026-10', '2026-10-28').hasBudget, false)
assert.equal(budgetPace([], { total: 0, categories: { 餐饮: 100 } }, '2026-10', '2026-10-28').dailyAllowance, null)
assert.throws(() => budgetPace([], budget, '2026-13', '2026-10-28'))
assert.throws(() => budgetPace([], budget, '2026-10', '2026-02-30'))

// Equal progress comparisons exclude future-dated entries, not just future months.
const reportEntries = [
  entry('previous-in', '2026-09-01', 100000, { kind: 'income' }),
  entry('previous-out', '2026-09-28', 40000),
  entry('previous-later', '2026-09-29', 60000),
  entry('current-in', '2026-10-01', 80000, { kind: 'income' }),
  entry('current-out', '2026-10-28', 100000),
  entry('current-later', '2026-10-29', 5000),
  entry('future', '2026-11-01', 20000),
]
let report = periodReport(reportEntries, '2026-10', 'month', '2026-10-28')
assert.equal(report.endDate, '2026-10-28')
assert.equal(report.previousEndDate, '2026-09-28')
assert.equal(report.current.expense, 100000)
assert.equal(report.previous.expense, 40000)
assert.equal(report.balance, -20000)
assert.equal(report.savingsRate, -25)
assert.equal(report.dailyExpense, 3571)
assert.equal(report.elapsedDays, 28)
assert.equal(report.recordedDays, 2)
assert.equal(report.noExpenseDays, 27)
report = periodReport(reportEntries, '2026-09', 'month', '2026-10-28')
assert.equal(report.endDate, '2026-09-30')
assert.equal(report.previousEndDate, '2026-08-31')
assert.equal(report.current.expense, 100000)
assert.equal(report.elapsedDays, 30)
assert.equal(report.previous.expense, 0)
report = periodReport(reportEntries, '2026-11', 'month', '2026-10-28')
assert.equal(report.currentEntries.length, 0)
assert.equal(report.previousEntries.length, 0)
assert.equal(report.elapsedDays, 0)
assert.equal(report.dailyExpense, 0)
assert.equal(report.noExpenseDays, 0)
assert.equal(report.savingsRate, null)
assert.equal(periodReport([], '2026-01', 'month', '2026-01-02').previousEndDate, '2025-12-02')
assert.equal(periodReport([], '2024-03', 'month', '2024-03-31').previousEndDate, '2024-02-29')
assert.equal(periodReport([], '2025-03', 'month', '2025-03-31').previousEndDate, '2025-02-28')
report = periodReport([
  entry('last-year', '2023-02-28', 100), entry('last-year-later', '2023-03-01', 200),
  entry('leap', '2024-02-29', 300), entry('leap-later', '2024-03-01', 400),
], '2024-07', 'year', '2024-02-29')
assert.equal(report.startDate, '2024-01-01')
assert.equal(report.previousStartDate, '2023-01-01')
assert.equal(report.previousEndDate, '2023-02-28')
assert.equal(report.current.expense, 300)
assert.equal(report.previous.expense, 100)
assert.equal(report.elapsedDays, 60)
assert.equal(report.savingsRate, null)
assert.equal(periodReport([], '2024-12', 'year', '2026-10-28').elapsedDays, 366)
assert.equal(periodReport([], '2025-12', 'year', '2026-10-28').elapsedDays, 365)
assert.equal(periodReport([], '2027-01', 'year', '2026-10-28').elapsedDays, 0)
assert.throws(() => periodReport([], '2026-13', 'month', '2026-10-28'))
assert.throws(() => periodReport([], '2026-10', 'month', '2026-02-30'))
console.log('PASS: inclusive cross-month filters, stable sorting, budget drafts and storage protection, daily allowance, equal-progress comparisons, leap days and future records')
