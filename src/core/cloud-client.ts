import { normalizeState, type LedgerState } from './ledger'
export class CloudFailure extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message)
  }
}
export interface CloudStorage {
  get(key: string): string
  set(key: string, value: string): void
  remove(key: string): void
}
export interface Snapshot {
  accountId: string
  revision: number
  state: LedgerState
}
export function createCloudClient(
  invoke: (event: any) => Promise<any>,
  storage: CloudStorage,
  env: string,
) {
  let snapshot: Snapshot | null = null
  let accountId = ''
  let discardAllowed = false
  const key = () => `xiaoqing.cloud.pending.${env}.${accountId}`
  async function call(event: any) {
    const result = await invoke(event)
    if (!result || typeof result.ok !== 'boolean')
      throw new CloudFailure('NETWORK', '云端响应无效，请同步确认操作结果')
    if (!result.ok) {
      if (result.code === 'AUTH') snapshot = null
      throw new CloudFailure(result.code || 'SERVICE', result.message || '云服务暂不可用')
    }
    if (event.accountId && result.accountId !== event.accountId) {
      snapshot = null
      throw new CloudFailure('AUTH', '微信身份发生变化，请重新打开小程序')
    }
    return result
  }
  function pending() {
    if (!accountId) return null
    const raw = storage.get(key())
    if (!raw) return null
    const value = JSON.parse(raw)
    if (value.accountId !== accountId) throw new Error('待确认操作的账号不匹配')
    return value
  }
  async function load() {
    // Identity is always established by the server. Never display a cache from another account.
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        let meta = await call({ action: 'read' })
        if (!/^[a-f0-9]{64}$/.test(meta.accountId) || !Number.isSafeInteger(meta.revision))
          throw new Error('云端身份响应无效')
        if (accountId && accountId !== meta.accountId) snapshot = null
        accountId = meta.accountId
        const unresolved = pending()
        if (unresolved) {
          try {
            await call(unresolved)
          } catch (e) {
            discardAllowed =
              e instanceof CloudFailure && ['CONFLICT', 'VALIDATION', 'LIMIT'].includes(e.code)
            throw e
          }
          storage.remove(key())
          discardAllowed = false
          meta = await call({ action: 'read' })
          if (meta.accountId !== accountId)
            throw new CloudFailure('AUTH', '微信身份发生变化，请重新打开小程序')
        }
        const entries: LedgerState['entries'] = []
        let after = ''
        do {
          const page = await call({ action: 'page', accountId, revision: meta.revision, after })
          if (!Array.isArray(page.entries) || entries.length + page.entries.length > 50000)
            throw new Error('云端账单响应无效')
          entries.push(...page.entries)
          if (page.next && page.next === after) throw new Error('云端分页响应无效')
          after = page.next
        } while (after)
        if (entries.length !== meta.count)
          throw new CloudFailure('CONFLICT', '账本正在变化，请重新同步')
        const state = normalizeState({ schema: 2, ...meta.settings, entries })
        snapshot = { accountId, revision: meta.revision, state }
        return snapshot
      } catch (e) {
        if (e instanceof CloudFailure && e.code === 'CONFLICT' && !pending() && attempt < 2)
          continue
        throw e
      }
    }
    throw new Error('同步失败，请重试')
  }
  async function mutate(operation: string, args: any) {
    if (!snapshot) throw new Error('请先成功连接云端，再保存账单')
    if (pending()) throw new Error('有一笔结果尚未确认的操作，请先到「云同步」确认，勿重复记账')
    const event = {
      action: 'mutate',
      accountId,
      baseRevision: snapshot.revision,
      operation,
      args,
      requestId: `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 14)}`,
    }
    // Persist BEFORE sending. If persistence fails, no network write is made.
    storage.set(key(), JSON.stringify(event))
    let result
    try {
      result = await call(event)
    } catch (e) {
      if (e instanceof CloudFailure && ['AUTH', 'CONFLICT', 'VALIDATION', 'LIMIT'].includes(e.code))
        storage.remove(key())
      throw e
    }
    // A storage failure after the server commits must never be reported as an unsaved operation.
    try {
      storage.remove(key())
    } catch {
      /* load() will replay the same idempotency key */
    }
    return result.result
  }
  function discardPending() {
    if (!discardAllowed) throw new Error('操作结果仍未确定，请继续同步确认，暂不能放弃')
    if (!accountId) return
    const raw = storage.get(key())
    if (raw) {
      storage.set(key() + '.discarded', raw)
      storage.remove(key())
    }
  }
  return {
    load,
    mutate,
    getSnapshot: () => snapshot,
    pending,
    discardPending,
    getAccountId: () => accountId,
    canDiscard: () => discardAllowed,
  }
}
