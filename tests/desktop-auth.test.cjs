const assert = require('node:assert/strict')
process.env.XQ_APP_ID = 'wx0000000000000000'
const { mockDB } = require('./mock-db.cjs'),
  {
    beginDesktop,
    confirmDesktop,
    pollDesktop,
    desktopOwner,
    hash,
  } = require('../cloudfunctions/ledger/desktop-auth'),
  { createHandler, APP_ID } = require('../cloudfunctions/ledger/handler')
;(async () => {
  const db = mockDB(),
    owner = hash(APP_ID + ':userA'),
    other = hash(APP_ID + ':userB'),
    token = 'a'.repeat(64),
    otherToken = 'b'.repeat(64),
    now = Date.now(),
    qr = async () => Buffer.from('89504e470d0a1a0a00000000', 'hex')
  const a = await beginDesktop(db, hash(token), qr, now)
  assert.equal((await pollDesktop(db, a.scene, otherToken, now)).ok, false)
  assert.equal((await pollDesktop(db, a.scene, token, now)).state, 'waiting')
  assert.equal(await desktopOwner(db, token, now), null)
  const [one, two] = await Promise.all([
    confirmDesktop(db, owner, a.scene, 'approve', now),
    confirmDesktop(db, other, a.scene, 'approve', now),
  ])
  assert.equal(Number(one.ok) + Number(two.ok), 1)
  const p = await pollDesktop(db, a.scene, token, now)
  assert.equal(p.accountId, owner)
  assert.equal(await desktopOwner(db, token, now), owner)
  const h = createHandler(db, {}, owner)
  assert.equal((await h({ action: 'read', token }, {})).accountId, owner)
  assert.equal((await h({ action: 'login' }, {})).code, 'AUTH')
  assert.equal(
    (await createHandler(db)({ action: 'read', token }, { OPENID: 'userB', APPID: APP_ID })).code,
    'AUTH',
  )
  assert.equal((await h({ action: 'session', token }, {})).ok, true)
  assert.equal((await h({ action: 'logout', token }, {})).ok, true)
  assert.equal(await desktopOwner(db, token, now), null)
  const b = await beginDesktop(db, hash(otherToken), qr, now)
  assert.equal((await confirmDesktop(db, owner, b.scene, 'deny', now)).ok, true)
  assert.equal((await pollDesktop(db, b.scene, otherToken, now)).code, 'DENIED')
  assert.equal(await desktopOwner(db, otherToken, now), null)
  const c = await beginDesktop(db, hash(otherToken), qr, now)
  assert.equal((await confirmDesktop(db, owner, c.scene, 'approve', now + 120001)).code, 'EXPIRED')
  assert.equal(await desktopOwner(db, otherToken, now + 120001), null)
  // Only a signed-in mini program session can approve a desktop login.
  const newToken = 'c'.repeat(64)
  const ticket = await beginDesktop(db, hash(newToken), qr, now)
  const mobile = createHandler(db)
  const ctx = { OPENID: 'userA', APPID: APP_ID }
  const signed = await mobile({ action: 'login' }, ctx)
  assert.equal(
    (await mobile({ action: 'desktopConfirm', scene: ticket.scene, decision: 'approve' }, ctx))
      .code,
    'AUTH',
  )
  assert.equal(
    (
      await mobile(
        { action: 'desktopConfirm', scene: ticket.scene, decision: 'approve', token: signed.token },
        { OPENID: 'userB', APPID: APP_ID },
      )
    ).code,
    'AUTH',
  )
  assert.equal(
    (
      await mobile(
        { action: 'desktopConfirm', scene: ticket.scene, decision: 'approve', token: signed.token },
        ctx,
      )
    ).ok,
    true,
  )
  assert.equal(await desktopOwner(db, newToken), owner)
  assert.equal(
    (
      await createHandler(
        db,
        {},
        owner,
      )({ action: 'desktopConfirm', scene: ticket.scene, decision: 'approve', token: newToken }, {})
    ).code,
    'FORBIDDEN',
  )
  await assert.rejects(() =>
    beginDesktop(db, hash('d'.repeat(64)), async () => Buffer.from('not-an-image!')),
  )
  console.log(
    'PASS desktop pairing: proof, expiry, replay/race, denial, identity isolation, logout',
  )
})().catch((e) => {
  console.error(e)
  process.exitCode = 1
})
