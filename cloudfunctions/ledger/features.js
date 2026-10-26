const crypto = require('node:crypto')
const {
  emptyState,
  validate,
  categoryOptions,
  validDate,
  monthDays,
  shiftMonth,
} = require('./core.cjs')
const hash = (v) => crypto.createHash('sha256').update(v).digest('hex')
const id = (scope, entry) => hash(scope + ':' + entry)
const freshBook = () => ({
  revision: 0,
  count: 0,
  usage: {},
  settings: (({ entries, schema, ...s }) => s)(emptyState()),
  ruleIds: [],
})
const reject = (message, code = 'VALIDATION') => {
  const e = new Error(message)
  e.code = code
  e.exposed = true
  throw e
}
const get = async (ref) => {
  const r = await ref.get()
  const value=Array.isArray(r.data) ? r.data[0] : r.data
  if(!value)return value
  const {_id,...data}=value
  return data
}
const profileId = (owner) => 'profile_' + owner
const profileDefault = (owner) => ({
  type: 'profile',
  owner,
  name: '微信用户 · ' + owner.slice(0, 8),
  avatar: '',
  groups: [],
  version: 0,
})
const chinaDate = (now = Date.now()) => new Date(now + 8 * 3600000).toISOString().slice(0, 10)
function periodOf(rule, date) {
  if (!validDate(date)) reject('日期无效')
  if (rule.frequency === 'monthly') return date.slice(0, 7)
  const d = new Date(date + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7))
  return d.toISOString().slice(0, 10)
}
function dueDate(rule, date) {
  if (rule.frequency === 'monthly')
    return (
      date.slice(0, 7) +
      '-' +
      String(Math.min(rule.day, monthDays(date.slice(0, 7)))).padStart(2, '0')
    )
  const d = new Date(periodOf(rule, date) + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + rule.day - 1)
  return d.toISOString().slice(0, 10)
}
function nextDate(rule, date) {
  if (rule.frequency === 'monthly') return dueDate(rule, shiftMonth(date.slice(0, 7), 1) + '-01')
  const d = new Date(date + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + 7)
  return d.toISOString().slice(0, 10)
}
const cycleId = (scope, ruleId, period) => 'cycle_' + hash(scope + ':' + ruleId + ':' + period)
function ruleInput(input, state, now) {
  if (
    !input ||
    typeof input.name !== 'string' ||
    !input.name.trim() ||
    input.name.trim().length > 24
  )
    reject('项目名称需为 1–24 个字')
  if (
    !['weekly', 'monthly'].includes(input.frequency) ||
    !Number.isInteger(input.day) ||
    input.day < 1 ||
    input.day > (input.frequency === 'weekly' ? 7 : 31)
  )
    reject('请选择有效的周期和日期')
  const rule = {
    name: input.name.trim(),
    frequency: input.frequency,
    day: input.day,
    cents: input.cents,
    category: input.category,
    note: typeof input.note === 'string' ? input.note : '',
    active: true,
  }
  validate(
    { kind: 'expense', cents: rule.cents, category: rule.category, note: rule.note, date: now },
    { expense: categoryOptions(state, 'expense'), income: categoryOptions(state, 'income') },
  )
  rule.startDate = now
  rule.nextDate = dueDate(rule, now)
  if (rule.nextDate < now) rule.nextDate = nextDate(rule, rule.nextDate)
  return rule
}
function member(book, owner) {
  if (!book || book.type !== 'group' || !book.members?.includes(owner))
    reject('你不是该群组成员，请切换账本', 'FORBIDDEN')
}
function createFeatures(db, services = {}) {
  const books = db.collection('xq_books'),
    requests = db.collection('xq_requests')
  async function profile(owner) {
    return (await get(books.doc(profileId(owner)))) || profileDefault(owner)
  }
  async function avatarURLs(profiles) {
    if (!services.urls) return profiles
    const files = [
      ...new Set(profiles.map((p) => p.avatar).filter((v) => v?.startsWith('cloud://'))),
    ]
    if (!files.length) return profiles
    let urls = {}
    try {
      urls = await services.urls(files)
    } catch {
      /* An unavailable avatar must not prevent access to the ledger. */
    }
    return profiles.map((p) => ({ ...p, avatar: urls[p.avatar] || '' }))
  }
  async function publicProfile(owner) {
    const p = await profile(owner)
    return (
      await avatarURLs([{ id: owner, name: p.name, avatar: p.avatar, version: p.version }])
    )[0]
  }
  async function author(owner, tx = db) {
    const p = (await get(tx.collection('xq_books').doc(profileId(owner)))) || profileDefault(owner)
    return { id: owner, name: p.name, avatar: p.avatar }
  }
  async function access(scope, owner, tx = db) {
    if (scope !== owner) member(await get(tx.collection('xq_books').doc(scope)), owner)
  }
  async function workspace(owner) {
    const p = await profile(owner),
      groups = []
    for (const groupId of p.groups || []) {
      const g = await get(books.doc(groupId))
      if (g?.members?.includes(owner))
        groups.push({ id: groupId, name: g.name, creator: g.creator, size: g.members.length })
    }
    return {
      profile: await publicProfile(owner),
      groups,
      scheduler: (await get(requests.doc('system_recurring'))) || null,
    }
  }
  async function handle(event, owner) {
    const args = event.args || {}
    if (event.action === 'workspace') return workspace(owner)
    if (event.action === 'profileSave') {
      if (typeof args.name !== 'string' || !args.name.trim() || args.name.trim().length > 24)
        reject('昵称需为 1–24 个字')
      let newAvatar
      if (args.avatarBase64) {
        if (
          typeof args.avatarBase64 !== 'string' ||
          args.avatarBase64.length > 280000 ||
          !/^[A-Za-z0-9+/=]+$/.test(args.avatarBase64)
        )
          reject('头像需小于 200KB')
        const buffer = Buffer.from(args.avatarBase64, 'base64')
        const png = buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        const jpeg = buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255
        if (!png && !jpeg) reject('头像仅支持 PNG 或 JPEG')
        if (!services.upload) reject('头像服务未配置')
        newAvatar = await services.upload(
          'avatars/' +
            owner +
            '/' +
            crypto.randomBytes(12).toString('hex') +
            (png ? '.png' : '.jpg'),
          buffer,
        )
      }
      await db.runTransaction(async (tx) => {
        const ref = tx.collection('xq_books').doc(profileId(owner)),
          p = (await get(ref)) || profileDefault(owner)
        if (args.version !== p.version) reject('资料已更新，请刷新后重试', 'CONFLICT')
        p.name = args.name.trim()
        if (newAvatar) p.avatar = newAvatar
        p.version++
        await ref.set({ data: p })
      })
      return { profile: await publicProfile(owner) }
    }
    if (event.action === 'groupCreate') {
      if (typeof args.name !== 'string' || !args.name.trim() || args.name.trim().length > 24)
        reject('群组名称需为 1–24 个字')
      if (!/^[a-zA-Z0-9_-]{12,100}$/.test(args.requestId || '')) reject('请求标识无效')
      const groupId = 'group_' + hash(owner + ':' + args.requestId).slice(0, 32)
      await db.runTransaction(async (tx) => {
        const b = tx.collection('xq_books'),
          p = (await get(b.doc(profileId(owner)))) || profileDefault(owner),
          existing = await get(b.doc(groupId))
        if (existing) {
          if (existing.creator !== owner) reject('群组无权访问')
          return
        }
        if (p.groups.length >= 20) reject('最多加入 20 个群组')
        p.groups.push(groupId)
        await b.doc(groupId).set({
          data: {
            ...freshBook(),
            type: 'group',
            name: args.name.trim(),
            creator: owner,
            members: [owner],
            createdAt: new Date().toISOString(),
          },
        })
        await b.doc(profileId(owner)).set({ data: p })
      })
      return { groupId }
    }
    if (event.action === 'groupInvite') {
      const code = crypto.randomBytes(8).toString('hex').toUpperCase(),
        inviteHash = hash(code)
      await db.runTransaction(async (tx) => {
        const b = tx.collection('xq_books'),
          g = await get(b.doc(args.groupId))
        member(g, owner)
        if (g.creator !== owner) reject('只有群主可以生成邀请码', 'FORBIDDEN')
        g.inviteHash = inviteHash
        const expiresAt = Date.now() + 7 * 86400000
        await b.doc(args.groupId).set({ data: g })
        await tx
          .collection('xq_requests')
          .doc('invite_' + inviteHash)
          .set({ data: { groupId: args.groupId, expiresAt } })
      })
      return { code, expiresInDays: 7 }
    }
    if (event.action === 'groupJoin') {
      const code = String(args.code || '')
        .trim()
        .toUpperCase()
      if (!/^[A-F0-9]{16}$/.test(code)) reject('请输入 16 位邀请码')
      const inviteHash = hash(code)
      const result = await db.runTransaction(async (tx) => {
        const b = tx.collection('xq_books'),
          invite = await get(tx.collection('xq_requests').doc('invite_' + inviteHash))
        if (!invite || invite.expiresAt < Date.now()) reject('邀请码无效或已过期')
        const g = await get(b.doc(invite.groupId)),
          p = (await get(b.doc(profileId(owner)))) || profileDefault(owner)
        if (!g || g.inviteHash !== inviteHash) reject('邀请码已失效')
        if (!g.members.includes(owner)) {
          if (g.members.length >= 20 || p.groups.length >= 20)
            reject('群组或账号已达到 20 人/组上限')
          g.members.push(owner)
        }
        if (!p.groups.includes(invite.groupId)) p.groups.push(invite.groupId)
        await b.doc(invite.groupId).set({ data: g })
        await b.doc(profileId(owner)).set({ data: p })
        return { groupId: invite.groupId }
      })
      return result.result || result
    }
    if (event.action === 'groupDetails') {
      const g = await get(books.doc(args.groupId))
      member(g, owner)
      const members = await Promise.all(g.members.map(publicProfile))
      return { name: g.name, creator: g.creator, members }
    }
    if (event.action === 'groupDelete') {
      await db.runTransaction(async (tx) => {
        const b = tx.collection('xq_books'),
          g = await get(b.doc(args.groupId)),
          p = (await get(b.doc(profileId(owner)))) || profileDefault(owner)
        member(g, owner)
        if (g.creator !== owner) reject('只有群主可以删除群组', 'FORBIDDEN')
        if (g.count !== 0 || g.members.length !== 1 || (g.ruleIds || []).length)
          reject('只能删除没有账单、定期项目和其他成员的空群组')
        p.groups = p.groups.filter((v) => v !== args.groupId)
        await b.doc(args.groupId).remove()
        await b.doc(profileId(owner)).set({ data: p })
      })
      return {}
    }
    if (event.action === 'groupLeave') {
      await db.runTransaction(async (tx) => {
        const b = tx.collection('xq_books'),
          g = await get(b.doc(args.groupId)),
          p = (await get(b.doc(profileId(owner)))) || profileDefault(owner)
        member(g, owner)
        if (g.creator === owner) reject('群主不能退出自己创建的群组')
        g.members = g.members.filter((v) => v !== owner)
        g.revision++
        p.groups = p.groups.filter((v) => v !== args.groupId)
        await b.doc(args.groupId).set({ data: g })
        await b.doc(profileId(owner)).set({ data: p })
      })
      return {}
    }
    return null
  }
  async function rulesFor(book, owner) {
    const rules = []
    for (const ruleId of book.ruleIds || []) {
      const r = await get(books.doc(ruleId))
      if (r) rules.push(r)
    }
    return rules
  }
  async function runScheduled(now = chinaDate(), scope) {
    // Bounded batches; nextDate advances transactionally, leaving backlog eligible for the next invocation.
    const due = await books
      .where({
        type: 'rule',
        active: true,
        nextDate: db.command.lte(now),
        ...(scope ? { scope } : {}),
      })
      .orderBy('nextDate', 'asc')
      .limit(20)
      .get()
    let processed = 0,
      created = 0
    const errors = []
    for (const item of due.data) {
      try {
        const result = await db.runTransaction(async (tx) => {
          const b = tx.collection('xq_books'),
            r = await get(b.doc(item._id))
          if (!r || !r.active || r.nextDate > now) return false
          const book = (await get(b.doc(r.scope))) || freshBook()
          if (r.scope !== r.creator && !book.members?.includes(r.creator)) {
            r.active = false
            await b.doc(item._id).set({ data: r })
            return false
          }
          const date = r.nextDate,
            period = periodOf(r, date),
            cycleRef = tx.collection('xq_requests').doc(cycleId(r.scope, item._id, period)),
            cycle = await get(cycleRef)
          const by = await author(r.creator, tx)
          const entryId = 'auto_' + hash(item._id + ':' + period).slice(0, 40)
          const existing = await get(tx.collection('xq_entries').doc(id(r.scope, entryId)))
          const inserted = !cycle && !existing
          if (inserted) {
            if (book.count >= 50000) reject('账单数量达到上限')
            const entry = {
              id: entryId,
              kind: 'expense',
              cents: r.cents,
              category: r.category,
              date,
              note: r.note || r.name,
              version: 1,
              updatedAt: new Date().toISOString(),
              author: by,
              ruleId: item._id,
              period,
              automatic: true,
              owner: r.scope,
            }
            validate(entry, {
              expense: categoryOptions({ schema: 2, entries: [], ...book.settings }, 'expense'),
              income: [],
            })
            const key = hash('expense:' + r.category)
            book.usage[key] = (book.usage[key] || 0) + 1
            book.count++
            book.revision++
            await tx.collection('xq_entries').doc(id(r.scope, entryId)).set({ data: entry })
            await cycleRef.set({ data: { entryId, automatic: true } })
            await b.doc(r.scope).set({ data: book })
          }
          r.nextDate = nextDate(r, date)
          await b.doc(item._id).set({ data: r })
          return inserted
        })
        processed++
        if (result.result === true || result === true) created++
      } catch (e) {
        errors.push(item._id)
        console.error('recurring failed', item._id, e.code || 'SERVICE')
      }
    }
    return { processed, created, failed: errors.length }
  }
  return { handle, access, author, profile, publicProfile, avatarURLs, rulesFor, runScheduled }
}
module.exports = {
  createFeatures,
  profileDefault,
  profileId,
  member,
  chinaDate,
  periodOf,
  dueDate,
  nextDate,
  cycleId,
  ruleInput,
  reject,
  get,
  freshBook,
  hash,
  id,
}
