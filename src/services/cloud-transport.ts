import { CLOUD_ENV, CLOUD_FUNCTION } from '@/config/cloud'
// wx is only referenced in the MP-WEIXIN compilation branch.
declare const wx: { cloud?: { init(options: any): void; callFunction(options: any): Promise<any> } }
export let cloudEnabled = false
// #ifdef MP-WEIXIN
cloudEnabled = true
// #endif
let initialized = false
export async function callLedger(event: any) {
  // #ifdef MP-WEIXIN
  if (!CLOUD_ENV) throw new Error('请先在 .env.local 配置云环境并重新构建')
  if (!wx.cloud) throw new Error('当前微信版本不支持云开发，请升级微信')
  if (!initialized) {
    wx.cloud.init({ env: CLOUD_ENV, traceUser: false })
    initialized = true
  }
  const response = await wx.cloud.callFunction({
    name: CLOUD_FUNCTION,
    data: event,
    config: { env: CLOUD_ENV },
  })
  return response.result
  // #endif
  // #ifndef MP-WEIXIN
  throw new Error('网页仅用于本地预览，云同步请在微信小程序中使用')
  // #endif
}
