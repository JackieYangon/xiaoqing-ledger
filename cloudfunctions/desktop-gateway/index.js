const https = require('node:https')
const cloud = require('wx-server-sdk')
const { beginDesktop, pollDesktop, desktopOwner } = require('./desktop-auth')
const { createHandler, APP_ID } = require('./handler')
let localConfig = {}
try {
  localConfig = require('./local-config.json')
} catch (e) {
  if (e.code !== 'MODULE_NOT_FOUND') throw e
}
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const allowed = new Set([
  'session',
  'logout',
  'workspace',
  'read',
  'page',
  'mutate',
  'runDue',
  'groupDetails',
  'groupCreate',
  'groupJoin',
  'groupInvite',
])
function request(url, options = {}, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, { ...options, timeout: 10000 }, (res) => {
      const chunks = []
      let length = 0
      res.on('data', (chunk) => {
        length += chunk.length
        if (length > 600000) req.destroy(new Error('响应过大'))
        else chunks.push(chunk)
      })
      res.on('end', () =>
        res.statusCode === 200
          ? resolve(Buffer.concat(chunks))
          : reject(new Error('微信服务暂不可用')),
      )
    })
    req.on('timeout', () => req.destroy(new Error('微信服务超时')))
    req.on('error', reject)
    if (body) req.write(body)
    req.end()
  })
}
function wechatFailure(stage, providerCode) {
  const error = new Error('微信登录服务尚未就绪')
  error.wechatStage = stage
  error.providerCode = Number.isSafeInteger(providerCode) ? providerCode : null
  return error
}
async function makeQr(scene) {
  const secret = process.env.XQ_WECHAT_APP_SECRET
  if (!APP_ID || !secret) throw wechatFailure('configuration', null)
  const u = new URL('https://api.weixin.qq.com/cgi-bin/token')
  u.searchParams.set('grant_type', 'client_credential')
  u.searchParams.set('appid', APP_ID)
  u.searchParams.set('secret', secret)
  const token = JSON.parse((await request(u)).toString('utf8'))
  if (!token.access_token) throw wechatFailure('access_token', token.errcode)
  const endpoint = new URL('https://api.weixin.qq.com/wxa/getwxacodeunlimit')
  endpoint.searchParams.set('access_token', token.access_token)
  const configuredEnv = process.env.XQ_MINI_ENV || localConfig.miniEnv || 'release'
  const env = ['release', 'trial', 'develop'].includes(configuredEnv) ? configuredEnv : 'release'
  const body = JSON.stringify({
    scene,
    page: 'pages/desktop-login/index',
    check_path: env === 'release',
    env_version: env,
    width: 430,
  })
  const image = await request(
    endpoint,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    },
    body,
  )
  if (image[0] === 0x7b) {
    const result = JSON.parse(image.toString('utf8'))
    throw wechatFailure('qr_code', result.errcode)
  }
  return image
}
function response(status, value) {
  return {
    statusCode: status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
    body: JSON.stringify(value),
    isBase64Encoded: false,
  }
}
exports.main = async (event) => {
  try {
    if (event.httpMethod !== 'POST') return response(405, { ok: false, message: '请求方式无效' })
    if (typeof event.body !== 'string' || event.body.length > 700000 || event.isBase64Encoded)
      return response(400, { ok: false, message: '请求数据无效' })
    const input = JSON.parse(event.body)
    const db = cloud.database({ throwOnNotFound: false })
    if (input.action === 'desktopBegin') {
      const result = await beginDesktop(db, input.tokenHash, makeQr)
      return response(result.code === 'RATE_LIMIT' ? 429 : 200, result)
    }
    if (input.action === 'desktopPoll')
      return response(200, await pollDesktop(db, input.scene, input.token))
    if (!allowed.has(input.action))
      return response(403, { ok: false, code: 'FORBIDDEN', message: '操作不可用' })
    const owner = await desktopOwner(db, input.token)
    if (!owner)
      return response(401, { ok: false, code: 'AUTH', message: '电脑登录已失效，请重新扫码' })
    const services = {
      urls: async (fileList) =>
        Object.fromEntries(
          (await cloud.getTempFileURL({ fileList })).fileList.map((f) => [
            f.fileID,
            f.tempFileURL || '',
          ]),
        ),
    }
    const result = await createHandler(db, services, owner)(input, {})
    return response(200, result)
  } catch (e) {
    // Never log request bodies, tokens, access tokens or WeChat API URLs.
    console.error(
      'desktop gateway request failed',
      e.wechatStage || e.code || 'ERROR',
      e.providerCode || '',
    )
    if (e.wechatStage)
      return response(503, {
        ok: false,
        code: 'WECHAT_SETUP',
        stage: e.wechatStage,
        providerCode: e.providerCode,
        message: '微信登录服务配置尚未完成，请联系管理员',
      })
    return response(500, {
      ok: false,
      code: 'SERVICE',
      message: '电脑登录或云服务暂不可用，请稍后重试',
    })
  }
}
