// Shared pairing logic. The scene is public; the desktop token never appears in the QR code.
const crypto = require('node:crypto')
const hash = (v) => crypto.createHash('sha256').update(v).digest('hex')
const SCENE = /^[a-f0-9]{24}$/
const TOKEN = /^[a-f0-9]{64}$/
const PAIR_TTL = 2 * 60 * 1000
const SESSION_TTL = 24 * 60 * 60 * 1000
const clean = (d) => {
  if (!d) return undefined
  const { _id, ...value } = d
  return value
}
async function read(ref) {
  try {
    const r = await ref.get()
    return clean(Array.isArray(r.data) ? r.data[0] : r.data)
  } catch (e) {
    if (
      e.errCode === 'DATABASE_DOCUMENT_NOT_EXIST' ||
      /document (?:does not exist|not found)/i.test(e.errMsg || e.message || '')
    )
      return undefined
    throw e
  }
}
function code(scene) {
  return (parseInt(scene.slice(0, 8), 16) % 1000000).toString().padStart(6, '0')
}
async function beginDesktop(db, tokenHash, makeQr, now = Date.now()) {
  if (!TOKEN.test(tokenHash || '')) throw Error('无效的登录请求')
  const scene = crypto.randomBytes(12).toString('hex')
  // Generate QR before allocating the database ticket; backend API failures create no usable login.
  const image = await makeQr(scene)
  if (!Buffer.isBuffer(image) || image.length > 500000 || image.length < 10)
    throw Error('小程序码生成失败')
  const png = image.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  const jpeg = image[0] === 255 && image[1] === 216 && image[2] === 255
  if (!png && !jpeg) throw Error('小程序码格式无效')
  await db
    .collection('xq_requests')
    .doc('desktop_pair_' + scene)
    .set({ data: { type: 'desktop_pair', tokenHash, expiresAt: now + PAIR_TTL, state: 'waiting' } })
  return {
    ok: true,
    scene,
    code: code(scene),
    expiresAt: now + PAIR_TTL,
    qr: 'data:image/' + (png ? 'png' : 'jpeg') + ';base64,' + image.toString('base64'),
  }
}
async function confirmDesktop(db, owner, scene, decision, now = Date.now()) {
  if (!SCENE.test(scene || '') || !['approve', 'deny'].includes(decision))
    return { ok: false, code: 'VALIDATION', message: '登录请求无效' }
  const result = await db.runTransaction(async (tx) => {
    const requests = tx.collection('xq_requests'),
      ref = requests.doc('desktop_pair_' + scene),
      pair = await read(ref)
    if (!pair || pair.type !== 'desktop_pair' || pair.state !== 'waiting' || pair.expiresAt <= now)
      return { ok: false, code: 'EXPIRED', message: '登录请求已失效，请在电脑刷新二维码' }
    const sessionRef = requests.doc('session_' + pair.tokenHash)
    const existing = await read(sessionRef)
    if (existing) return { ok: false, code: 'CONFLICT', message: '登录请求已失效，请重试' }
    pair.state = decision === 'approve' ? 'approved' : 'denied'
    pair.confirmedAt = now
    if (decision === 'approve') {
      pair.owner = owner
      pair.sessionExpiresAt = now + SESSION_TTL
      await sessionRef.set({
        data: { owner, type: 'desktop_session', expiresAt: pair.sessionExpiresAt },
      })
    }
    await ref.set({ data: pair })
    return { ok: true, accountId: owner, decision }
  })
  return result.result || result
}
async function pollDesktop(db, scene, token, now = Date.now()) {
  if (!SCENE.test(scene || '') || !TOKEN.test(token || ''))
    return { ok: false, code: 'AUTH', message: '登录请求无效' }
  const pair = await read(db.collection('xq_requests').doc('desktop_pair_' + scene))
  if (!pair || pair.tokenHash !== hash(token))
    return { ok: false, code: 'AUTH', message: '登录请求无效' }
  if (pair.expiresAt <= now) return { ok: false, code: 'EXPIRED', message: '二维码已过期，请刷新' }
  if (pair.state === 'denied') return { ok: false, code: 'DENIED', message: '手机已取消登录' }
  if (pair.state === 'approved')
    return { ok: true, state: 'approved', accountId: pair.owner, expiresAt: pair.sessionExpiresAt }
  return { ok: true, state: 'waiting' }
}
async function desktopOwner(db, token, now = Date.now()) {
  if (!TOKEN.test(token || '')) return null
  const s = await read(db.collection('xq_requests').doc('session_' + hash(token)))
  return s && s.type === 'desktop_session' && s.expiresAt > now && /^[a-f0-9]{64}$/.test(s.owner)
    ? s.owner
    : null
}
module.exports = { beginDesktop, confirmDesktop, pollDesktop, desktopOwner, code, hash }
