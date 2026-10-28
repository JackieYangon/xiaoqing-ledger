import { computed, ref } from 'vue'
import { onLoad, onShow } from '@dcloudio/uni-app'
import { callLedger, cloudEnabled } from './cloud-transport'

export const SESSION_STORAGE_KEY = 'xiaoqing.auth.session.v1'
type RememberedSession = { schema: 1; token: string; accountId: string; expiresAt: number }
export const authStatus = ref<'signedOut' | 'signingIn' | 'signedIn' | 'checking' | 'offline'>('signedOut')
export const currentUser = ref<{ accountId: string; name?: string; avatar?: string; version?: number } | null>(null)
export const authError = ref('')
export const authenticated = computed(() => authStatus.value === 'signedIn')
export const guestMode = computed(() => authStatus.value === 'signedOut')
export const browseReady = computed(() => guestMode.value || authenticated.value)
export const currentUserLabel = computed(() =>
  currentUser.value ? currentUser.value.name || '小青用户 · ' + currentUser.value.accountId.slice(0, 8) : '游客体验',
)
const publicPages = new Set([
  '/pages/home/index', '/pages/records/index', '/pages/stats/index', '/pages/about/index',
  '/pages/entry/index', '/pages/budget/index', '/pages/categories/index', '/pages/login/index',
])
let token = '', expiresAt = 0, generation = 0, redirecting = false
let initialized = false, guardsInstalled = false, cacheReadFailed = false, storedCredentials = ''
let resumeTask: Promise<boolean> | null = null
const resetListeners: Array<() => void> = []
const readyListeners: Array<() => void> = []
const foregroundListeners: Array<(ready: boolean) => void | Promise<void>> = []
export function onForegroundCheck(fn: (ready: boolean) => void | Promise<void>) { foregroundListeners.push(fn) }
export function onSessionReset(fn: () => void) { resetListeners.push(fn) }
export function onSessionReady(fn: () => void) { readyListeners.push(fn) }
export function toLogin() {
  if (redirecting) return
  const pages = getCurrentPages()
  if (pages[pages.length - 1]?.route === 'pages/login/index') return
  redirecting = true
  uni.reLaunch({ url: '/pages/login/index', complete: () => { redirecting = false } })
}
function messageOf(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : (error as any)?.errMsg || fallback
}
function validCredentials(value: any): value is RememberedSession {
  return value?.schema === 1 && /^[a-f0-9]{64}$/.test(value.token) &&
    /^[a-f0-9]{64}$/.test(value.accountId) && Number.isSafeInteger(value.expiresAt) && value.expiresAt > 0
}
function credentials(result: any): RememberedSession {
  const value = { schema: 1 as const, token: result?.token, accountId: result?.accountId, expiresAt: result?.expiresAt }
  if (!result?.ok || !validCredentials(value) || value.expiresAt <= Date.now())
    throw new Error(result?.message || '登录响应无效，请重试')
  return value
}
function persistSession(value: RememberedSession) {
  const serialized = JSON.stringify(value)
  if (serialized === storedCredentials) return
  try {
    uni.setStorageSync(SESSION_STORAGE_KEY, serialized)
    storedCredentials = serialized
  } catch {
    throw new Error('无法保存登录状态，请检查本机存储后重试。原有账单未被修改。')
  }
}
function forgetSession() {
  storedCredentials = ''
  try {
    uni.removeStorageSync(SESSION_STORAGE_KEY)
    return ''
  } catch {
    // A blank dedicated key also prevents restoration if removal fails.
    try { uni.setStorageSync(SESSION_STORAGE_KEY, ''); return '' } catch {
      return '未能清除本机登录记录，请清理小青账本缓存后重新打开。'
    }
  }
}
function clearSession(message = '', forget = false) {
  generation++
  resumeTask = null
  token = ''
  expiresAt = 0
  cacheReadFailed = false
  currentUser.value = null
  authStatus.value = 'signedOut'
  const storageError = forget ? forgetSession() : ''
  authError.value = [message, storageError].filter(Boolean).join(' ')
  resetListeners.forEach((fn) => fn())
}
function readRememberedSession() {
  let raw: any
  try {
    raw = uni.getStorageSync(SESSION_STORAGE_KEY)
    cacheReadFailed = false
  } catch {
    cacheReadFailed = true
    authStatus.value = 'offline'
    authError.value = '暂时无法读取登录记录，请重新连接。原有账单未被修改。'
    return false
  }
  if (!raw) {
    authStatus.value = 'signedOut'
    authError.value = ''
    return false
  }
  try {
    const saved = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (!validCredentials(saved)) throw new Error('invalid remembered session')
    token = saved.token
    expiresAt = saved.expiresAt
    currentUser.value = { accountId: saved.accountId }
    storedCredentials = JSON.stringify({ schema: 1, token, accountId: saved.accountId, expiresAt })
    authStatus.value = 'checking'
    return true
  } catch {
    authStatus.value = 'signedOut'
    authError.value = '登录记录无效，请重新登录。原有账单未被修改。'
    return false
  }
}
export function initializeAuth() {
  installAuthGuards()
  if (!initialized) {
    initialized = true
    if (cloudEnabled && !token) readRememberedSession()
  }
  return resumeSession()
}
// Expiration does not discard remembered consent or account credentials.
export function hasSession() {
  return authenticated.value && !!token && expiresAt > Date.now()
}
export async function ensureSession(): Promise<boolean> {
  if (hasSession()) return true
  if (token || cacheReadFailed) return resumeSession()
  return false
}
export function requireLogin() {
  if (hasSession()) return true
  if (token || cacheReadFailed) { void resumeSession(); return false }
  if (authStatus.value === 'checking' || authStatus.value === 'signingIn' || authStatus.value === 'offline') return false
  toLogin()
  return false
}
export function assertLoggedIn() {
  if (!requireLogin()) throw new Error(authError.value || '登录状态尚未就绪，请重新连接后重试')
}
export function useProtectedPage() {
  onLoad(() => { requireLogin() })
  onShow(() => { requireLogin() })
  return { authenticated, currentUserLabel }
}
export async function login() {
  if (authStatus.value === 'signingIn') return false
  if (!cloudEnabled) {
    authError.value = '请在小青账本小程序中完成登录，网页可继续浏览体验。'
    return false
  }
  if (token || cacheReadFailed) return resumeSession()
  clearSession()
  const attempt = generation
  authStatus.value = 'signingIn'
  try {
    const result = await callLedger({ action: 'login' })
    if (attempt !== generation) return false
    const saved = credentials(result)
    persistSession(saved)
    token = saved.token
    expiresAt = saved.expiresAt
    currentUser.value = { ...result.profile, accountId: saved.accountId }
    readyListeners.forEach((fn) => fn())
    authStatus.value = 'signedIn'
    return true
  } catch (e) {
    if (attempt === generation) clearSession(messageOf(e, '登录失败，请重试'))
    return false
  }
}
function rejectChangedIdentity() {
  clearSession('账号身份已变化，原账号数据已隐藏，请自主选择重新登录。', true)
  uni.reLaunch({ url: '/pages/home/index' })
}
export async function authenticatedCall(event: any) {
  const attempt = generation
  const ready = await ensureSession()
  if (attempt !== generation) throw new Error('登录状态已变化，请重新操作')
  if (!ready) {
    if (guestMode.value) toLogin()
    throw new Error(authError.value || '请先登录小青账本')
  }
  if (!hasSession() || !currentUser.value)
    throw new Error('登录状态已变化，请重新操作')
  const owner = currentUser.value.accountId
  for (let retry = 0; retry < 2; retry++) {
    const result = await callLedger({ ...event, token })
    if (attempt !== generation) throw new Error('登录状态已变化，请重新操作')
    if (result?.ok && result.accountId !== owner) {
      rejectChangedIdentity()
      throw new Error('账号身份已变化，请重新登录')
    }
    if (result?.code !== 'AUTH') return result
    if (retry === 0 && await resumeSession() && attempt === generation && currentUser.value?.accountId === owner)
      continue
    throw new Error(authError.value || '登录状态暂时无法验证，请重新连接')
  }
}
export function resumeSession(): Promise<boolean> {
  if (resumeTask) return resumeTask
  if (authStatus.value === 'signingIn' || !cloudEnabled) return Promise.resolve(false)
  if (cacheReadFailed && !readRememberedSession()) return Promise.resolve(false)
  if (!token || !currentUser.value) return Promise.resolve(false)
  const attempt = generation, owner = currentUser.value.accountId
  authStatus.value = 'checking'
  authError.value = ''
  foregroundListeners.forEach((fn) => { void fn(false) })
  let task!: Promise<boolean>
  task = (async () => {
    // Assign the shared task before running callbacks or handling a synchronous failure.
    await Promise.resolve()
    try {
      if (attempt !== generation) return false
      let saved: RememberedSession | null = null
      let profile: any
      if (expiresAt > Date.now()) {
        const result = await callLedger({ action: 'session', token })
        if (attempt !== generation) return false
        if (result?.ok) {
          if (result.accountId !== owner) { rejectChangedIdentity(); return false }
          if (!Number.isSafeInteger(result.expiresAt)) throw new Error('登录验证响应无效，请重新连接')
          if (result.expiresAt > Date.now())
            saved = { schema: 1, token, accountId: owner, expiresAt: result.expiresAt }
        } else if (result?.code !== 'AUTH') {
          throw new Error(result?.message || '暂时无法验证登录状态，请重新连接')
        }
      }
      if (!saved) {
        const result = await callLedger({ action: 'login' })
        if (attempt !== generation) return false
        saved = credentials(result)
        if (saved.accountId !== owner) { rejectChangedIdentity(); return false }
        profile = result.profile
      }
      if (attempt !== generation) return false
      persistSession(saved)
      token = saved.token
      expiresAt = saved.expiresAt
      currentUser.value = { ...currentUser.value, ...profile, accountId: owner }
      readyListeners.forEach((fn) => fn())
      authStatus.value = 'signedIn'
      return true
    } catch (e) {
      if (attempt === generation) {
        authStatus.value = 'offline'
        authError.value = messageOf(e, '暂时无法连接，登录状态已保留，请重新连接')
      }
      return false
    } finally {
      if (resumeTask === task) resumeTask = null
    }
  })()
  resumeTask = task
  // A refresh may be awaiting this promise; do not await the refresh listeners in turn.
  void task.then((ready) => {
    if (ready && attempt === generation && hasSession()) {
      for (const fn of foregroundListeners)
        void Promise.resolve().then(() => fn(true)).catch(() => {})
    }
  })
  return task
}
export async function logout() {
  const oldToken = token
  clearSession('', true)
  uni.reLaunch({ url: '/pages/home/index' })
  if (oldToken) {
    try { await callLedger({ action: 'logout', token: oldToken }) } catch {
      /* Local credentials are removed even when server revocation cannot connect. */
    }
  }
}
export function installAuthGuards() {
  if (guardsInstalled) return
  guardsInstalled = true
  for (const api of ['navigateTo', 'redirectTo', 'reLaunch', 'switchTab'] as const) {
    uni.addInterceptor(api, {
      invoke(args: { url?: string }) {
        if (publicPages.has(args.url?.split('?')[0] || '')) return
        if (token || cacheReadFailed) { void ensureSession(); return }
        if (!requireLogin()) return false
      },
    })
  }
}
export function updateProfile(profile: { name: string; avatar: string; version: number }) {
  if (currentUser.value) currentUser.value = { ...currentUser.value, ...profile }
}
