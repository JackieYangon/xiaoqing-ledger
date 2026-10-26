import { assertLoggedIn, requireLogin, onSessionReset, authenticatedCall, currentUser } from './auth'
import { computed, ref } from 'vue'
import {
  createRepository,
  emptyState,
  parseBackup,
  type Kind,
  type Draft,
  type Budget,
} from '@/core/ledger'
import { createCloudClient } from '@/core/cloud-client'
import { cloudEnabled } from './cloud-transport'
import { CLOUD_ENV } from '@/config/cloud'
export { cloudEnabled }
const KEY = 'xiaoqing.ledger.v1'
export const localRepository = createRepository({
  read: () => { assertLoggedIn(); return uni.getStorageSync(KEY) },
  write: (value) => { assertLoggedIn(); uni.setStorageSync(KEY, value) },
})
const makeClient = () => createCloudClient(
  authenticatedCall,
  {
    get: (key) => uni.getStorageSync(key),
    set: (key, value) => uni.setStorageSync(key, value),
    remove: (key) => uni.removeStorageSync(key),
  },
  CLOUD_ENV,
)
let client = makeClient()
export const state = ref(emptyState()),
  entries = computed(() => state.value.entries),
  loadError = ref('')
export const syncStatus = ref<'local' | 'connecting' | 'synced' | 'saving' | 'error'>(
  cloudEnabled ? 'connecting' : 'local',
)
export const syncBusy = ref(false),
  lastSync = ref(''),
  accountId = ref(''),
  pendingOperation = ref(false),
  canDiscardPending = ref(false)
export const storageLabel = computed(
  () =>
    ({
      local: '网页本地预览',
      connecting: '连接云端中',
      synced: '已同步云端',
      saving: '正在保存',
      error: '同步待处理',
    })[syncStatus.value],
)
export const saveMessage = computed(() => (cloudEnabled ? '已保存到云端' : '已保存到本机'))
export const recordFilter = ref<{ month: string; kind: Kind; category: string } | null>(null)
let refreshTask: Promise<boolean> | null = null
onSessionReset(() => {
  client = makeClient()
  state.value = emptyState()
  accountId.value = ''; lastSync.value = ''; loadError.value = ''
  pendingOperation.value = false; canDiscardPending.value = false
  syncBusy.value = false; syncStatus.value = 'connecting'
  recordFilter.value = null; refreshTask = null
})
function capturePending() {
  canDiscardPending.value = client.canDiscard()
  try {
    pendingOperation.value = !!client.pending()
  } catch {
    pendingOperation.value = true
  }
}
function snapshotRepository() {
  assertLoggedIn()
  if (cloudEnabled && !client.getSnapshot()) throw new Error('尚未连接云端，请先到「云同步」连接')
  let raw = JSON.stringify(state.value)
  return createRepository({ read: () => raw, write: (value) => (raw = value) })
}
async function fetchCloud() {
  const activeClient = client
  const snapshot = await activeClient.load()
  if (client !== activeClient || snapshot.accountId !== currentUser.value?.accountId) throw new Error('登录状态已变化')
  state.value = snapshot.state
  accountId.value = snapshot.accountId
  loadError.value = ''
  syncStatus.value = 'synced'
  lastSync.value = new Date().toLocaleTimeString()
  capturePending()
}
function report(e: unknown) {
  loadError.value = errorMessage(e)
  syncStatus.value = cloudEnabled ? 'error' : 'local'
  if (cloudEnabled && !client.getSnapshot()) state.value = emptyState()
  capturePending()
}
export function refresh(): Promise<boolean> {
  if (!requireLogin()) return Promise.resolve(false)
  const activeClient = client
  if (refreshTask) return refreshTask
  if (syncBusy.value) return Promise.resolve(false)
  refreshTask = (async () => {
    await Promise.resolve()
    try {
      if (cloudEnabled) {
        syncStatus.value = 'connecting'
        await fetchCloud()
      } else {
        state.value = localRepository.read()
        loadError.value = ''
      }
      return true
    } catch (e) {
      if (client === activeClient) report(e)
      return false
    } finally {
      if (client === activeClient) refreshTask = null
    }
  })()
  return refreshTask
}
async function write(operation: string, args: any, local: () => any) {
  assertLoggedIn()
  const activeClient = client
  if (refreshTask) await refreshTask
  assertLoggedIn()
  if (client !== activeClient) throw new Error('登录状态已变化')
  if (syncBusy.value) throw new Error('正在处理上一项操作，请稍后再试')
  if (!cloudEnabled) {
    const result = local()
    state.value = localRepository.read()
    return result
  }
  syncBusy.value = true
  syncStatus.value = 'saving'
  try {
    const result = await activeClient.mutate(operation, args)
    if (client !== activeClient) throw new Error('登录状态已变化')
    try {
      await fetchCloud()
    } catch (e) {
      if (client === activeClient) report(new Error('云端已保存，但刷新失败。请同步确认后继续：' + errorMessage(e)))
    }
    return result
  } catch (e) {
    if (client === activeClient) report(e)
    throw e
  } finally {
    if (client === activeClient) syncBusy.value = false
  }
}
export const repository = {
  read: () => (cloudEnabled ? snapshotRepository().read() : localRepository.read()),
  list: () => (cloudEnabled ? snapshotRepository().list() : localRepository.list()),
  save: (draft: Draft, id?: string, expectedVersion?: number, createId?: string) =>
    write('save', { draft, ...(id ? { id, expectedVersion } : { createId }) }, () =>
      localRepository.save(draft, id, expectedVersion),
    ),
  remove: (id: string, version: number) =>
    write('remove', { id, version }, () => localRepository.remove(id, version)),
  setBudget: (month: string, budget: Budget) =>
    write('setBudget', { month, budget }, () => localRepository.setBudget(month, budget)),
  addCategory: (kind: Kind, name: string) =>
    write('addCategory', { kind, name }, () => localRepository.addCategory(kind, name)),
  removeCategory: (kind: Kind, name: string) =>
    write('removeCategory', { kind, name }, () => localRepository.removeCategory(kind, name)),
  setHidden: (value: boolean) =>
    write('setHidden', { value }, () => localRepository.setHidden(value)),
  exportBackup: () =>
    cloudEnabled ? snapshotRepository().exportBackup() : localRepository.exportBackup(),
  previewImport: (text: string) =>
    cloudEnabled ? snapshotRepository().previewImport(text) : localRepository.previewImport(text),
  async importBackup(text: string) {
    assertLoggedIn()
    if (!cloudEnabled) return write('unused', {}, () => localRepository.importBackup(text))
    const source = parseBackup(text),
      totals = { added: 0, skipped: 0, conflicts: 0 }
    const migrationAccount = client.getAccountId()
    for (let i = 0; i < Math.max(1, source.entries.length); i += 20) {
      if (client.getAccountId() !== migrationAccount)
        throw new Error('微信身份发生变化，迁移已暂停')
      const batch = { ...source, entries: source.entries.slice(i, i + 20) }
      try {
        const result = await write('importBatch', { text: JSON.stringify(batch) }, () => {})
        totals.added += result.added
        totals.skipped += result.skipped
        totals.conflicts += result.conflicts
      } catch (e) {
        throw new Error(
          `导入中断，已确认新增 ${totals.added} 笔。原始备份保留，可同步后重试，重复记录会跳过。${errorMessage(e)}`,
        )
      }
      if (syncStatus.value === 'error')
        throw new Error('本批已保存，刷新未完成。请先同步，再重新导入；已保存的记录不会重复')
    }
    return totals
  },
}
export async function discardPending() {
  assertLoggedIn()
  client.discardPending()
  capturePending()
  await refresh()
}
export function pendingText() {
  assertLoggedIn()
  return JSON.stringify(client.pending(), null, 2)
}
export function errorMessage(e: unknown) {
  return e instanceof Error
    ? e.message
    : typeof (e as any)?.errMsg === 'string'
      ? (e as any).errMsg
      : '操作失败，请稍后重试'
}
export function openEntry(id?: string, date?: string) {
  uni.navigateTo({
    url:
      '/pages/entry/index' + (id ? '?id=' + encodeURIComponent(id) : date ? '?date=' + date : ''),
  })
}
export function navigate(page: string) {
  uni.navigateTo({ url: '/pages/' + page + '/index' })
}
export function toastError(e: unknown) {
  uni.showModal({ title: '未能完成操作', content: errorMessage(e), showCancel: false })
}
export function copyText(data: string) {
  uni.setClipboardData({
    data,
    success: () => uni.showToast({ title: '已复制', icon: 'success' }),
    fail: () => toastError(new Error('无法访问剪贴板，请重试')),
  })
}
