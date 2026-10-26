const crypto = require('node:crypto')
const {
  emptyState,
  parseBackup,
  validate,
  categoryOptions,
  createRepository,
} = require('./core.cjs')
const APP_ID = 'YOUR_APP_ID'
const COLLECTIONS = { books: 'xq_books', entries: 'xq_entries', requests: 'xq_requests' }
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex')
class Fault extends Error {
  constructor(code, message) {
    super(message)
    this.code = code
  }
}
const fail = (code, message) => {
  throw new Fault(code, message)
}
const ownId = (owner, id) => hash(owner + ':' + id)
const usageKey = (e) => hash(e.kind + ':' + e.category)
function settingsOf(state) {
  const { entries, schema, ...settings } = state
  return settings
}
function defaultBook() {
  return { revision: 0, count: 0, usage: {}, settings: settingsOf(emptyState()) }
}
async function get(doc) {
  try {
    const result = await doc.get()
    return Array.isArray(result.data) ? result.data[0] : result.data
  } catch (e) {
    if (
      e.errCode === 'DATABASE_DOCUMENT_NOT_EXIST' ||
      /document (?:does not exist|not found)/i.test(e.errMsg || e.message || '')
    )
      return undefined
    throw e
  }
}
function cleanEntry(e) {
  const { id, kind, cents, category, date, note, version, updatedAt } = e
  return { id, kind, cents, category, date, note, version, updatedAt }
}
function checkedSettings(settings) {
  return settingsOf(parseBackup(JSON.stringify({ schema: 2, entries: [], ...settings })))
}
function checkSize(data) {
  if (Buffer.byteLength(JSON.stringify(data), 'utf8') > 600000)
    fail('LIMIT', '设置数据过大，请先导出备份并联系维护者')
}
function createHandler(db) {
  return async (event, context) => {
    try {
      if (!context?.OPENID || context.APPID !== APP_ID) fail('AUTH', '请从小青账本微信小程序访问')
      const owner = hash(context.APPID + ':' + context.OPENID)
      const bookRef = db.collection(COLLECTIONS.books).doc(owner)
      const action = event?.action
      const sessions = db.collection(COLLECTIONS.requests)
      if (action === 'login') {
        const token = crypto.randomBytes(32).toString('hex')
        const expiresAt = Date.now() + 24 * 60 * 60 * 1000
        await sessions.doc('session_' + hash(token)).set({ data: { owner, expiresAt, type: 'session' } })
        return { ok: true, accountId: owner, token, expiresAt }
      }
      if (!/^[a-f0-9]{64}$/.test(event?.token || '')) fail('AUTH', '请先使用微信登录')
      const sessionRef = sessions.doc('session_' + hash(event.token))
      const session = await get(sessionRef)
      if (!session || session.type !== 'session' || session.owner !== owner || session.expiresAt <= Date.now())
        fail('AUTH', '登录已失效，请重新登录')
      if (action === 'logout') {
        await sessionRef.remove()
        return { ok: true, accountId: owner }
      }
      if (action === 'session') return { ok: true, accountId: owner, expiresAt: session.expiresAt }
      if (action !== 'read' && event.accountId !== owner)
        fail('AUTH', '微信身份发生变化，请重新打开小程序')
      if (action === 'read') {
        const book = (await get(bookRef)) || defaultBook()
        return {
          ok: true,
          accountId: owner,
          revision: book.revision,
          count: book.count,
          settings: checkedSettings(book.settings),
        }
      }
      if (action === 'page') {
        const book = (await get(bookRef)) || defaultBook()
        if (book.revision !== event.revision) fail('CONFLICT', '账本已更新，请重新同步')
        const after = event.after || ''
        if (after && !/^[a-f0-9]{64}$/.test(after)) fail('VALIDATION', '分页参数无效')
        const where = { owner }
        if (after) where._id = db.command.gt(after)
        const result = await db
          .collection(COLLECTIONS.entries)
          .where(where)
          .orderBy('_id', 'asc')
          .limit(100)
          .get()
        const latest = (await get(bookRef)) || defaultBook()
        if (latest.revision !== book.revision) fail('CONFLICT', '账本已更新，请重新同步')
        return {
          ok: true,
          accountId: owner,
          revision: book.revision,
          entries: result.data.map(cleanEntry),
          next: result.data.length === 100 ? result.data[result.data.length - 1]._id : '',
        }
      }
      if (action !== 'mutate') fail('VALIDATION', '不支持的操作')
      const { requestId, baseRevision, operation, args } = event
      if (
        !/^[a-zA-Z0-9_-]{12,100}$/.test(requestId || '') ||
        !Number.isSafeInteger(baseRevision) ||
        baseRevision < 0 ||
        !args ||
        typeof args !== 'object'
      )
        fail('VALIDATION', '请求参数无效')
      const allowed = [
        'save',
        'remove',
        'setBudget',
        'addCategory',
        'removeCategory',
        'setHidden',
        'importBatch',
      ]
      if (!allowed.includes(operation)) fail('VALIDATION', '不支持的写入操作')
      if (Buffer.byteLength(JSON.stringify(event), 'utf8') > 700000)
        fail('LIMIT', '单次请求过大，请减少导入量')
      const fingerprint = hash(JSON.stringify({ baseRevision, operation, args }))
      const receiptId = ownId(owner, requestId)
      const result = await db.runTransaction(async (transaction) => {
        const receipts = transaction.collection(COLLECTIONS.requests)
        const receipt = await get(receipts.doc(receiptId))
        if (receipt) {
          if (receipt.fingerprint !== fingerprint) fail('VALIDATION', '请求标识重复，请重新同步')
          return receipt.response
        }
        const books = transaction.collection(COLLECTIONS.books),
          records = transaction.collection(COLLECTIONS.entries)
        const book = (await get(books.doc(owner))) || defaultBook()
        if (book.revision !== baseRevision)
          fail('CONFLICT', '另一台设备已更新账本，请同步后重新确认操作')
        const state = { schema: 2, entries: [], ...checkedSettings(book.settings) }
        let resultData = {}
        const writes = []
        function usage(entry, delta) {
          const k = usageKey(entry)
          book.usage[k] = (book.usage[k] || 0) + delta
          if (book.usage[k] === 0) delete book.usage[k]
        }
        try {
          if (operation === 'save') {
            validate(args.draft, {
              expense: categoryOptions(state, 'expense'),
              income: categoryOptions(state, 'income'),
            })
            if (args.id && (typeof args.id !== 'string' || args.id.length > 120))
              throw new Error('账单标识无效')
            if (args.createId && !/^[a-zA-Z0-9_-]{12,100}$/.test(args.createId))
              throw new Error('新账单标识无效')
            const id = args.id || args.createId || 'entry_' + requestId
            const previous = await get(records.doc(ownId(owner, id)))
            if (args.id && (!previous || previous.version !== args.expectedVersion))
              fail('CONFLICT', '账单已修改或删除，请重新打开')
            if (previous && !args.id) fail('CONFLICT', '这笔记录已保存，请返回账单查看，勿重复提交')
            if (previous) usage(previous, -1)
            else book.count++
            const entry = cleanEntry({
              ...args.draft,
              id,
              note: args.draft.note.trim(),
              version: (previous?.version || 0) + 1,
              updatedAt: new Date().toISOString(),
            })
            usage(entry, 1)
            writes.push(() => records.doc(ownId(owner, id)).set({ data: { ...entry, owner } }))
            resultData = entry
          } else if (operation === 'remove') {
            if (typeof args.id !== 'string' || args.id.length > 120) throw new Error('账单标识无效')
            const doc = records.doc(ownId(owner, args.id)),
              entry = await get(doc)
            if (!entry || entry.version !== args.version)
              fail('CONFLICT', '账单已修改或删除，请刷新后重试')
            usage(entry, -1)
            book.count--
            writes.push(() => doc.remove())
          } else if (operation === 'importBatch') {
            const imported = parseBackup(args.text)
            if (imported.entries.length > 20) throw new Error('单次最多导入 20 笔')
            let added = 0,
              skipped = 0,
              conflicts = 0
            for (const kind of ['expense', 'income'])
              state.customCategories[kind] = Array.from(
                new Set([...state.customCategories[kind], ...imported.customCategories[kind]]),
              )
            for (const [month, budget] of Object.entries(imported.budgets))
              if (!state.budgets[month]) state.budgets[month] = budget
            for (const entry of imported.entries) {
              const doc = records.doc(ownId(owner, entry.id)),
                previous = await get(doc)
              if (previous) {
                skipped++
                if (JSON.stringify(cleanEntry(previous)) !== JSON.stringify(entry)) conflicts++
              } else {
                added++
                book.count++
                usage(entry, 1)
                writes.push(() => doc.set({ data: { ...entry, owner } }))
              }
            }
            resultData = { added, skipped, conflicts }
          } else {
            let raw = JSON.stringify(state)
            const repository = createRepository({
              read: () => raw,
              write: (value) => (raw = value),
            })
            if (operation === 'setBudget') repository.setBudget(args.month, args.budget)
            if (operation === 'addCategory' || operation === 'removeCategory') {
              if (!['expense', 'income'].includes(args.kind)) throw new Error('收支类型无效')
              if (operation === 'removeCategory' && book.usage[hash(args.kind + ':' + args.name)])
                throw new Error('分类已被账单使用，不能删除')
              repository[operation](args.kind, args.name)
            }
            if (operation === 'setHidden') {
              if (typeof args.value !== 'boolean') throw new Error('设置无效')
              repository.setHidden(args.value)
            }
            Object.assign(state, repository.read())
          }
          book.settings = checkedSettings(state)
          if (book.count > 50000) throw new Error('账单已达到 50000 笔上限，请先导出备份')
          checkSize(book)
        } catch (e) {
          if (e instanceof Fault) throw e
          fail('VALIDATION', e.message || '数据校验失败')
        }
        // All reads are completed before writes. <= 44 document operations for a 20-row import.
        for (const write of writes) await write()
        book.revision++
        book.updatedAt = new Date().toISOString()
        const response = { ok: true, accountId: owner, revision: book.revision, result: resultData }
        await books.doc(owner).set({ data: book })
        await receipts
          .doc(receiptId)
          .set({ data: { owner, fingerprint, response, createdAt: book.updatedAt } })
        return response
      })
      return result?.result?.ok ? result.result : result
    } catch (e) {
      if (e instanceof Fault) return { ok: false, code: e.code, message: e.message }
      // Do not leak database internals or log financial payloads.
      console.error('ledger request failed', e.errCode || e.code || 'DATABASE_ERROR')
      return {
        ok: false,
        code: 'SERVICE',
        message: '云服务暂不可用，请检查云函数、数据库集合和环境配置后重试',
      }
    }
  }
}
module.exports = { createHandler, COLLECTIONS, APP_ID }
