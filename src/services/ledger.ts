import { ref } from 'vue'
import { createRepository, type Entry } from '@/core/ledger'
const KEY = 'xiaoqing.ledger.v1'
export const repository = createRepository({read:()=>uni.getStorageSync(KEY),write:(value)=>uni.setStorageSync(KEY,value)})
export const entries = ref<Entry[]>([])
export const loadError = ref('')
export function refresh() { try { entries.value = repository.list(); loadError.value=''} catch(e) {loadError.value=errorMessage(e); entries.value=[]} }
export function errorMessage(e: unknown) { return e instanceof Error ? e.message : '操作失败，请稍后重试' }
export function openEntry(id?: string) { uni.navigateTo({url:'/pages/entry/index'+(id?'?id='+encodeURIComponent(id):'')}) }
export function toastError(e: unknown) { uni.showModal({title:'未能完成操作',content:errorMessage(e),showCancel:false}) }
