import { computed, ref } from 'vue'
import { createRepository, emptyState, type Kind } from '@/core/ledger'
// Preserve the original key so schema-1 data is read and upgraded on the next successful write.
const KEY = 'xiaoqing.ledger.v1'
export const repository = createRepository({
  read: () => uni.getStorageSync(KEY),
  write: (value) => uni.setStorageSync(KEY, value),
})
export const state = ref(emptyState())
export const entries = computed(() => state.value.entries)
export const loadError = ref('')
export const recordFilter = ref<{ month: string; kind: Kind; category: string } | null>(null)
export function refresh() {
  try {
    state.value = repository.read()
    loadError.value = ''
  } catch (e) {
    loadError.value = errorMessage(e)
    state.value = emptyState()
  }
}
export function errorMessage(e: unknown) {
  return e instanceof Error ? e.message : '操作失败，请稍后重试'
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
