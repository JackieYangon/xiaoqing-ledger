import {
  MAX_CENTS,
  inMonth,
  monthDays,
  parseMoney,
  shiftMonth,
  summarize,
  today,
  validDate,
  validMonth,
  type Budget,
  type Entry,
  type Kind,
  type LedgerState,
} from './ledger'

export type EntrySort = 'date-desc' | 'date-asc' | 'amount-desc' | 'amount-asc'
export interface EntryFilter {
  startDate?: string
  endDate?: string
  kind?: Kind | 'all'
  category?: string
  query?: string
  minAmount?: string
  maxAmount?: string
  sort?: EntrySort
}

function amountBound(value: string | undefined): number | undefined {
  const text = value?.trim() || ''
  if (!text) return undefined
  if (!/^\d{1,8}(\.\d{1,2})?$/.test(text))
    throw new Error('筛选金额需为非负数，最多两位小数')
  return Number(text) === 0 ? 0 : parseMoney(text)
}

/** Filter and sort a new list. Historical categories and authors remain searchable. */
export function filterEntries(entries: Entry[], filter: EntryFilter = {}): Entry[] {
  const start = filter.startDate || ''
  const end = filter.endDate || ''
  if ((start && !validDate(start)) || (end && !validDate(end)))
    throw new Error('请选择有效的起止日期')
  if (start && end && start > end) throw new Error('开始日期不能晚于结束日期')
  if (filter.kind && !['all', 'expense', 'income'].includes(filter.kind))
    throw new Error('收支筛选类型无效')
  const sort = filter.sort || 'date-desc'
  if (!['date-desc', 'date-asc', 'amount-desc', 'amount-asc'].includes(sort))
    throw new Error('排序方式无效')
  const min = amountBound(filter.minAmount)
  const max = amountBound(filter.maxAmount)
  if (min !== undefined && max !== undefined && min > max)
    throw new Error('最低金额不能大于最高金额')
  const query = (filter.query || '').trim().toLowerCase()
  const matching = entries.filter(
    (entry) =>
      (!start || entry.date >= start) &&
      (!end || entry.date <= end) &&
      (!filter.kind || filter.kind === 'all' || entry.kind === filter.kind) &&
      (!filter.category || entry.category === filter.category) &&
      (min === undefined || entry.cents >= min) &&
      (max === undefined || entry.cents <= max) &&
      (!query ||
        `${entry.category} ${entry.note} ${entry.author?.name || ''}`
          .toLowerCase()
          .includes(query)),
  )
  const direction = sort.endsWith('asc') ? 1 : -1
  return matching
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => {
      const comparison = sort.startsWith('amount')
        ? a.entry.cents - b.entry.cents
        : a.entry.date.localeCompare(b.entry.date)
      return comparison * direction || a.index - b.index
    })
    .map(({ entry }) => entry)
}

function checkMonth(month: string) {
  if (!validMonth(month)) throw new Error('月份无效')
}

function checkAsOf(asOf: string) {
  if (!validDate(asOf)) throw new Error('统计截止日期无效')
}

export function previousMonthBudget(state: LedgerState, month: string): Budget | null {
  checkMonth(month)
  const previous = state.budgets[shiftMonth(month, -1)]
  return previous ? { total: previous.total, categories: { ...previous.categories } } : null
}

export function sumCategoryBudget(inputs: Record<string, string>): number {
  let total = 0
  for (const value of Object.values(inputs)) {
    if (value.trim()) total += parseMoney(value)
    if (total > MAX_CENTS) throw new Error('分类预算合计不能超过 99999999.99 元')
  }
  return total
}

export function budgetPace(
  entries: Entry[],
  budget: Budget | undefined,
  month: string,
  asOf = today(),
) {
  checkMonth(month)
  checkAsOf(asOf)
  const currentMonth = asOf.slice(0, 7)
  const phase: 'past' | 'current' | 'future' =
    month < currentMonth ? 'past' : month === currentMonth ? 'current' : 'future'
  const daysRemaining =
    phase === 'past'
      ? 0
      : phase === 'future'
        ? monthDays(month)
        : monthDays(month) - Number(asOf.slice(8, 10)) + 1
  const spent = summarize(inMonth(entries, month)).expense
  const remaining = (budget?.total || 0) - spent
  const hasBudget = !!budget && budget.total > 0
  return {
    hasBudget,
    phase,
    spent,
    remaining,
    daysRemaining,
    dailyAllowance:
      hasBudget && daysRemaining ? Math.floor(Math.max(0, remaining) / daysRemaining) : null,
  }
}

function lastDay(month: string) {
  return `${month}-${String(monthDays(month)).padStart(2, '0')}`
}

function boundedDay(month: string, day: number) {
  return `${month}-${String(Math.min(day, monthDays(month))).padStart(2, '0')}`
}

export function monthlyCashflow(entries: Entry[], year: string, asOf = today()) {
  checkMonth(`${year}-01`)
  checkAsOf(asOf)
  const currentYear = asOf.slice(0, 4)
  const count = year < currentYear ? 12 : year === currentYear ? Number(asOf.slice(5, 7)) : 0
  return Array.from({ length: count }, (_, index) => {
    const month = `${year}-${String(index + 1).padStart(2, '0')}`
    const items = entries.filter((entry) => entry.date.startsWith(month + '-') && entry.date <= asOf)
    const total = summarize(items)
    return { month, label: index + 1, hasData: items.length > 0, income: total.income, expense: total.expense, balance: total.income - total.expense }
  })
}

export interface BudgetUsageRow {
  key: string
  name: string
  category: string
  limit: number
  spent: number
  remaining: number
  overage: number
  percent: number
  fillPercent: number
}

export interface BudgetUsageMonth {
  month: string
  startDate: string
  endDate: string
  phase: 'past' | 'current' | 'future'
  rows: BudgetUsageRow[]
}

// 预算按月独立；年度视图保留每月限额，不将不同月份合并为新的年度预算。
export function budgetUsage(
  entries: Entry[],
  budgets: LedgerState['budgets'],
  month: string,
  period: 'month' | 'year' = 'month',
  asOf = today(),
): BudgetUsageMonth[] {
  checkMonth(month)
  checkAsOf(asOf)
  if (period !== 'month' && period !== 'year') throw new Error('统计周期无效')
  const months = period === 'month'
    ? [month]
    : Object.keys(budgets).filter((key) => validMonth(key) && key.startsWith(month.slice(0, 4) + '-')).sort()
  const selectedMonths = new Set(months)
  const spending = new Map<string, { total: number; categories: Map<string, number> }>()
  for (const entry of entries) {
    const entryMonth = entry.date.slice(0, 7)
    if (entry.kind !== 'expense' || entry.date > asOf || !selectedMonths.has(entryMonth)) continue
    let amounts = spending.get(entryMonth)
    if (!amounts) {
      amounts = { total: 0, categories: new Map() }
      spending.set(entryMonth, amounts)
    }
    amounts.total += entry.cents
    amounts.categories.set(entry.category, (amounts.categories.get(entry.category) || 0) + entry.cents)
  }
  const result: BudgetUsageMonth[] = []
  for (const key of months) {
    const budget = budgets[key]
    if (!budget) continue
    const phase = key < asOf.slice(0, 7) ? 'past' : key === asOf.slice(0, 7) ? 'current' : 'future'
    const amounts = spending.get(key)
    const rows: BudgetUsageRow[] = []
    const addRow = (rowKey: string, name: string, category: string, limit: number, spent: number) => {
      // 零总预算表示未设限；仅展示真实设置的正数限额，避免零除和虚假超支。
      if (limit <= 0) return
      const percent = (spent / limit) * 100
      rows.push({
        key: rowKey, name, category, limit, spent,
        remaining: Math.max(0, limit - spent),
        overage: Math.max(0, spent - limit),
        percent,
        fillPercent: Math.min(100, percent),
      })
    }
    addRow('total', '总预算', '', budget.total, amounts?.total || 0)
    for (const [name, limit] of Object.entries(budget.categories))
      addRow(`category:${name}`, name, name, limit, amounts?.categories.get(name) || 0)
    if (rows.length) result.push({
      month: key,
      startDate: `${key}-01`,
      endDate: phase === 'current' ? asOf : lastDay(key),
      phase,
      rows,
    })
  }
  return result
}

/** Current periods compare matching calendar dates; past periods compare complete periods. */
export function periodReport(
  entries: Entry[],
  month: string,
  period: 'month' | 'year' = 'month',
  asOf = today(),
) {
  checkMonth(month)
  checkAsOf(asOf)
  if (period !== 'month' && period !== 'year') throw new Error('统计周期无效')
  const year = month.slice(0, 4)
  const key = period === 'month' ? month : year
  const currentKey = period === 'month' ? asOf.slice(0, 7) : asOf.slice(0, 4)
  const isCurrent = key === currentKey
  const isFuture = key > currentKey
  const previousMonth = shiftMonth(month, -1)
  const previousYear = String(Number(year) - 1).padStart(4, '0')
  const previousStartMonth = period === 'month' ? previousMonth : `${previousYear}-01`
  if (!validMonth(previousStartMonth)) throw new Error('上一周期超出支持的日期范围')
  const startDate = period === 'month' ? `${month}-01` : `${year}-01-01`
  const endDate = isCurrent ? asOf : period === 'month' ? lastDay(month) : `${year}-12-31`
  const previousStartDate = `${previousStartMonth}-01`
  const previousEndDate = isCurrent
    ? boundedDay(
        period === 'month' ? previousMonth : `${previousYear}-${asOf.slice(5, 7)}`,
        Number(asOf.slice(8, 10)),
      )
    : period === 'month'
      ? lastDay(previousMonth)
      : `${previousYear}-12-31`
  const currentEntries = isFuture ? [] : filterEntries(entries, { startDate, endDate })
  const previousEntries = isFuture
    ? []
    : filterEntries(entries, { startDate: previousStartDate, endDate: previousEndDate })
  const current = summarize(currentEntries)
  const previous = summarize(previousEntries)
  const elapsedDays = isFuture
    ? 0
    : Math.round(
        (Date.parse(`${endDate}T12:00:00Z`) - Date.parse(`${startDate}T12:00:00Z`)) / 86400000,
      ) + 1
  const balance = current.income - current.expense
  const expenseDays = new Set(
    currentEntries.filter((entry) => entry.kind === 'expense').map((entry) => entry.date),
  ).size
  return {
    currentEntries,
    previousEntries,
    current,
    previous,
    startDate,
    endDate,
    previousStartDate,
    previousEndDate,
    elapsedDays,
    balance,
    savingsRate: current.income > 0 ? (balance / current.income) * 100 : null,
    dailyExpense: elapsedDays ? Math.round(current.expense / elapsedDays) : 0,
    recordedDays: new Set(currentEntries.map((entry) => entry.date)).size,
    noExpenseDays: Math.max(0, elapsedDays - expenseDays),
  }
}
