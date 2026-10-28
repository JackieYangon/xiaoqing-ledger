import { createRepository, emptyState, today, type Draft } from '@/core/ledger'

// The experience never reads or writes device storage or an account's cloud data.
// Reuse the same validation and calculations as a personal ledger.
export function createGuestRepository() {
  const state = emptyState()
  const date = today()
  const month = date.slice(0, 7)
  const examples: Draft[] = [
    { kind: 'expense', cents: 2800, category: '餐饮', date, note: '示例 · 午餐' },
    { kind: 'expense', cents: 600, category: '交通', date, note: '示例 · 出行' },
    { kind: 'expense', cents: 6900, category: '购物', date: month + '-01', note: '示例 · 日用品' },
    { kind: 'income', cents: 600000, category: '工资', date: month + '-01', note: '示例 · 月度收入' },
  ]
  state.entries = examples.map((entry, index) => ({
    ...entry,
    id: 'guest_example_' + index,
    version: 1,
    updatedAt: entry.date + 'T12:00:00.000Z',
  }))
  state.budgets[month] = { total: 300000, categories: { 餐饮: 100000, 交通: 30000 } }
  let raw = JSON.stringify(state)
  return createRepository({ read: () => raw, write: (value) => { raw = value } })
}
