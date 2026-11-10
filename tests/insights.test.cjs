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
const { filterEntries, previousMonthBudget, sumCategoryBudget, budgetPace, budgetUsage, monthlyCashflow, periodReport } = load('insights')
const plain = (value) => JSON.parse(JSON.stringify(value))
const entry = (id, date, cents, extra = {}) => ({
  id, date, cents, kind: 'expense', category: '餐饮', note: '', version: 1,
  updatedAt: `${date}T12:00:00Z`, ...extra,
})

const cashflowEntries = [
  entry('jan-income', '2026-01-01', 10000, { kind: 'income' }),
  entry('jan-expense', '2026-01-15', 4000),
  entry('march-loss', '2026-03-01', 3000),
  entry('future-day', '2026-03-30', 99000),
  entry('future-month', '2026-04-01', 99000),
  entry('other-year', '2025-01-01', 99000),
]
const cashflowBefore = JSON.stringify(cashflowEntries)
const cashflow = monthlyCashflow(cashflowEntries, '2026', '2026-03-10')
assert.deepEqual(plain(cashflow.map(item => item.label)), [1, 2, 3])
assert.deepEqual(plain(cashflow[0]), { month: '2026-01', label: 1, hasData: true, income: 10000, expense: 4000, balance: 6000 })
assert.equal(cashflow[1].hasData, false, '空月份保留位置但不生成图形数据')
assert.equal(cashflow[2].balance, -3000, '结余可为负且排除未来日期')
assert.equal(monthlyCashflow([], '2025', '2026-03-10').length, 12)
assert.equal(monthlyCashflow([], '2027', '2026-03-10').length, 0)
assert.equal(monthlyCashflow([], '2026', '2026-01-01').length, 1)
assert.equal(monthlyCashflow([], '2026', '2026-12-31').length, 12)
assert.throws(() => monthlyCashflow([], 'oops', '2026-03-10'))
assert.equal(JSON.stringify(cashflowEntries), cashflowBefore)

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

// 每个预算保留原月份和分类，当前周期排除未来账单，不以年度合计掩盖单月超支。
const usageEntries = [
  entry('outside-year', '2025-10-01', 999999),
  entry('category-only', '2026-02-01', 2500, { category: '已停用' }),
  entry('month-without-budget', '2026-03-01', 999999),
  entry('history', '2026-09-30', 500, { category: '旧分类' }),
  entry('month-first', '2026-10-01', 3000),
  entry('month-last', '2026-10-28', 1000, { category: '旧分类' }),
  entry('unbudgeted-category', '2026-10-28', 200, { category: '未设分类' }),
  entry('income', '2026-10-28', 50000, { kind: 'income' }),
  entry('tomorrow', '2026-10-29', 999),
  entry('next-month', '2026-11-01', 999),
]
const usageBudgets = {
  '2025-10': { total: 1, categories: {} },
  '2026-11': { total: 5000, categories: { 餐饮: 1000 } },
  '2026-10': { total: 4000, categories: { 餐饮: 2000, 旧分类: 1000, 未使用: 500 } },
  '2026-08': { total: 0, categories: {} },
  '2026-02': { total: 0, categories: { 已停用: 1000 } },
  '2026-09': { total: 8000, categories: { 旧分类: 5000 } },
  '2027-01': { total: 7000, categories: {} },
}
const beforeUsage = JSON.stringify([usageEntries, usageBudgets])
Object.freeze(usageEntries)
usageEntries.forEach(Object.freeze)
Object.values(usageBudgets).forEach((value) => { Object.freeze(value.categories); Object.freeze(value) })
Object.freeze(usageBudgets)
const monthlyUsage = budgetUsage(usageEntries, usageBudgets, '2026-10', 'month', '2026-10-28')
assert.equal(monthlyUsage.length, 1)
assert.equal(monthlyUsage[0].startDate, '2026-10-01')
assert.equal(monthlyUsage[0].endDate, '2026-10-28')
assert.equal(monthlyUsage[0].phase, 'current')
assert.deepEqual(plain(monthlyUsage[0].rows.map((row) => [row.name, row.limit, row.spent, row.remaining, row.overage, row.percent, row.fillPercent])), [
  ['总预算', 4000, 4200, 0, 200, 105, 100],
  ['餐饮', 2000, 3000, 0, 1000, 150, 100],
  ['旧分类', 1000, 1000, 0, 0, 100, 100],
  ['未使用', 500, 0, 500, 0, 0, 0],
])
const annualUsage = budgetUsage(usageEntries, usageBudgets, '2026-12', 'year', '2026-10-28')
assert.deepEqual(plain(annualUsage.map((item) => item.month)), ['2026-02', '2026-09', '2026-10', '2026-11'])
assert.equal(annualUsage[0].rows.length, 1, '未设总额时保留独立分类预算')
assert.equal(annualUsage[0].rows[0].name, '已停用', '历史分类预算不依赖当前可选分类')
assert.equal(annualUsage[0].rows[0].overage, 1500)
assert.equal(annualUsage[0].rows[0].percent, 250)
assert.equal(annualUsage[0].endDate, '2026-02-28')
assert.equal(annualUsage[1].endDate, '2026-09-30')
assert.deepEqual(plain(annualUsage[2]), plain(monthlyUsage[0]), '年度视图保留同一月的真实使用情况')
assert.equal(annualUsage[3].phase, 'future')
assert.equal(annualUsage[3].rows[0].spent, 0)
assert.equal(annualUsage[3].rows[0].remaining, 5000)
for (const group of annualUsage.filter((item) => item.phase !== 'future')) {
  for (const row of group.rows) {
    const matching = filterEntries(usageEntries, {
      startDate: group.startDate, endDate: group.endDate, kind: 'expense', category: row.category,
    })
    assert.equal(matching.reduce((sum, item) => sum + item.cents, 0), row.spent,
      '预算图与点击后的日期/分类筛选使用同一口径')
  }
}
assert.equal(budgetUsage(usageEntries, usageBudgets, '2026-07', 'month', '2026-10-28').length, 0)
assert.equal(budgetUsage(usageEntries, usageBudgets, '2026-08', 'month', '2026-10-28').length, 0)
assert.equal(budgetUsage(usageEntries, {}, '2026-10', 'year', '2026-10-28').length, 0)
assert.equal(budgetUsage(usageEntries, usageBudgets, '2027-01', 'year', '2026-10-28')[0].rows[0].spent, 0)
const closedYear = budgetUsage(usageEntries, usageBudgets, '2026-01', 'year', '2027-01-01')
assert.equal(closedYear[2].rows[0].spent, 5199, '已结束月份包含整月账单')
assert.equal(closedYear[2].endDate, '2026-10-31')
assert.equal(closedYear[3].rows[0].spent, 999)
assert.equal(budgetUsage([], { '2024-02': { total: 1, categories: {} } }, '2024-02', 'month', '2026-10-28')[0].endDate, '2024-02-29')
assert.equal(JSON.stringify([usageEntries, usageBudgets]), beforeUsage, '统计计算不修改账单或已保存预算')
assert.throws(() => budgetUsage([], {}, '2026-13', 'month', '2026-10-28'))
assert.throws(() => budgetUsage([], {}, '2026-10', 'week', '2026-10-28'))
assert.throws(() => budgetUsage([], {}, '2026-10', 'year', '2026-02-30'))
console.log('PASS: inclusive cross-month filters, stable sorting, budget drafts and storage protection, daily allowance, equal-progress comparisons, leap days and future records')
