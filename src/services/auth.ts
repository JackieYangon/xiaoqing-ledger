import { computed, ref } from 'vue'
import { onLoad, onShow } from '@dcloudio/uni-app'
import { callLedger, cloudEnabled } from './cloud-transport'

export const authStatus = ref<'signedOut' | 'signingIn' | 'signedIn' | 'checking'>('signedOut')
export const currentUser = ref<{ accountId: string } | null>(null)
export const authError = ref('')
export const authenticated = computed(() => authStatus.value === 'signedIn')
export const currentUserLabel = computed(() => currentUser.value ? '微信用户 · ' + currentUser.value.accountId.slice(0, 8) : '未登录')
let token = '', expiresAt = 0, generation = 0, redirecting = false
const resetListeners: Array<() => void> = []
export function onSessionReset(fn: () => void) { resetListeners.push(fn) }
export function toLogin() {
  if (redirecting) return
  const pages = getCurrentPages()
  if (pages[pages.length - 1]?.route === 'pages/login/index') return
  redirecting = true
  uni.reLaunch({ url: '/pages/login/index', complete: () => { redirecting = false } })
}
function clearSession(message = '') {
  generation++
  token = ''; expiresAt = 0
  currentUser.value = null
  authStatus.value = 'signedOut'
  authError.value = message
  resetListeners.forEach(fn => fn())
}
export function requireLogin() {
  if (authenticated.value && token && expiresAt > Date.now()) return true
  if (authStatus.value === 'checking') return false
  if (authenticated.value) clearSession('登录已过期，请重新登录')
  toLogin()
  return false
}
export function assertLoggedIn() {
  if (!requireLogin()) throw new Error('请先使用微信登录')
}
export function useProtectedPage() {
  onLoad(() => { requireLogin() })
  onShow(() => { requireLogin() })
  return { authenticated, currentUserLabel }
}
export async function login() {
  if (authStatus.value === 'signingIn') return false
  if (!cloudEnabled) { authError.value = '请在微信中打开小青账本完成登录，网页暂不支持微信登录。'; return false }
  clearSession()
  const attempt = generation
  authStatus.value = 'signingIn'
  try {
    const result = await callLedger({ action: 'login' })
    if (attempt !== generation) return false
    if (!result?.ok || !/^[a-f0-9]{64}$/.test(result.token) || !/^[a-f0-9]{64}$/.test(result.accountId) || result.expiresAt <= Date.now())
      throw new Error(result?.message || '微信登录失败，请重试')
    token = result.token; expiresAt = result.expiresAt
    currentUser.value = { accountId: result.accountId }
    authStatus.value = 'signedIn'
    return true
  } catch (e) {
    if (attempt === generation) clearSession(e instanceof Error ? e.message : (e as any)?.errMsg || '微信登录失败，请重试')
    return false
  }
}
export async function authenticatedCall(event: any) {
  assertLoggedIn()
  const attempt = generation, owner = currentUser.value!.accountId
  const result = await callLedger({ ...event, token })
  if (attempt !== generation) throw new Error('登录状态已变化，请重新操作')
  if (result?.code === 'AUTH' || (result?.ok && result.accountId !== owner)) {
    clearSession('微信身份或登录状态已变化，请重新登录')
    toLogin()
    throw new Error('请重新登录')
  }
  return result
}
export async function resumeSession() {
  if (!token || authStatus.value !== 'signedIn') return
  const attempt = generation, owner = currentUser.value!.accountId
  authStatus.value = 'checking'
  try {
    const result = await callLedger({ action: 'session', token })
    if (attempt !== generation) return
    if (!result?.ok || result.accountId !== owner || result.expiresAt <= Date.now()) throw new Error('登录已失效，请重新登录')
    authStatus.value = 'signedIn'
  } catch {
    if (attempt === generation) { clearSession('无法验证当前微信身份，请联网后重新登录'); toLogin() }
  }
}
export async function logout() {
  const oldToken = token
  clearSession()
  toLogin()
  if (oldToken) {
    try { await callLedger({ action: 'logout', token: oldToken }) }
    catch { /* Local session is gone. Server session expires and is bound to the same WeChat identity. */ }
  }
}
export function installAuthGuards() {
  for (const api of ['navigateTo', 'redirectTo', 'reLaunch', 'switchTab'] as const) {
    uni.addInterceptor(api, { invoke(args: { url?: string }) {
      if (args.url?.split('?')[0] === '/pages/login/index') return
      if (!requireLogin()) return false
    } })
  }
}
