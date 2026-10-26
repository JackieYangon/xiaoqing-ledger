export type Kind = 'expense' | 'income'
export interface Entry { id: string; kind: Kind; cents: number; category: string; date: string; note: string; version: number; updatedAt: string }
export type Draft = Pick<Entry, 'kind' | 'cents' | 'category' | 'date' | 'note'>
export const categories = { expense: ['餐饮','交通','购物','居家','娱乐','医疗','学习','其他'], income: ['工资','奖金','兼职','其他'] }
export function today() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` }
export function parseMoney(value: string): number {
  if (!/^\d{1,8}(\.\d{1,2})?$/.test(value.trim())) throw new Error('请输入有效金额，最多两位小数')
  const [whole, fraction = ''] = value.trim().split('.')
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2,'0'))
  if (cents <= 0) throw new Error('金额必须大于 0')
  return cents
}
export function money(cents: number) { return (cents / 100).toFixed(2) }
export function validDate(date: string) { if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false; const d = new Date(date+'T12:00:00Z'); return !isNaN(d.getTime()) && d.toISOString().slice(0,10) === date }
export function validate(d: Draft) {
  if (!d || !['expense','income'].includes(d.kind)) throw new Error('收支类型无效')
  if (!Number.isSafeInteger(d.cents) || d.cents <= 0 || d.cents > 9999999999) throw new Error('金额超出范围')
  if (!categories[d.kind].includes(d.category)) throw new Error('请选择有效分类')
  if (!validDate(d.date)) throw new Error('日期无效')
  if (typeof d.note !== 'string' || d.note.length > 100) throw new Error('备注最多 100 字')
}
export function summarize(entries: Entry[]) { return entries.reduce((sum,e) => {sum[e.kind] += e.cents; return sum}, {expense:0,income:0}) }
export interface Storage { read(): unknown; write(value: string): void }
export function createRepository(storage: Storage) {
  function list(): Entry[] {
    const raw = storage.read()
    if (raw === '' || raw == null) return []
    try {
      const data = JSON.parse(String(raw))
      if (data.schema !== 1 || !Array.isArray(data.entries)) throw new Error()
      const ids = new Set<string>()
      for (const entry of data.entries) { validate(entry); if (typeof entry.id !== 'string' || !entry.id || ids.has(entry.id) || !Number.isInteger(entry.version) || entry.version < 1 || typeof entry.updatedAt !== 'string') throw new Error(); ids.add(entry.id) }
      return data.entries.sort((a: Entry,b: Entry) => b.date.localeCompare(a.date) || b.updatedAt.localeCompare(a.updatedAt))
    } catch { throw new Error('本地账本读取失败，已停止写入以保护原始数据') }
  }
  function persist(entries: Entry[]) { storage.write(JSON.stringify({schema:1,entries})) }
  return {
    list,
    save(draft: Draft, id?: string, expectedVersion?: number) {
      validate(draft)
      const entries = list()
      const previous = id ? entries.find(e=>e.id===id) : undefined
      if (id && !previous) throw new Error('该账单已不存在')
      if (previous && previous.version !== expectedVersion) throw new Error('账单已发生变化，请返回重新打开')
      const entry: Entry = {...draft, note:draft.note.trim(), id: previous?.id || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2,12)}`, version:(previous?.version || 0)+1, updatedAt:new Date().toISOString()}
      persist([entry, ...entries.filter(e=>e.id!==entry.id)])
      return entry
    },
    remove(id: string, version: number) { const entries=list(); const entry=entries.find(e=>e.id===id); if (!entry || entry.version!==version) throw new Error('账单已发生变化，请刷新后重试'); persist(entries.filter(e=>e.id!==id)) }
  }
}
