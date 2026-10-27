const { createFeatures, member, chinaDate, periodOf, cycleId, ruleInput } = require('./features')
const crypto = require('node:crypto')
const {
  emptyState,
  parseBackup,
  validate,
  categoryOptions,
  createRepository,
} = require('./core.cjs')
let localConfig = {}
try {
  localConfig = require('./local-config.json')
} catch (e) {
  if (e.code !== 'MODULE_NOT_FOUND') throw e
}
const APP_ID = process.env.XQ_APP_ID || localConfig.appid || ''
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
    const value = Array.isArray(result.data) ? result.data[0] : result.data
    if (!value) return value
    const { _id, ...data } = value
    return data
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
  return {
    id,
    kind,
    cents,
    category,
    date,
    note,
    version,
    updatedAt,
    ...(e.author ? { author: e.author } : {}),
    ...(e.ruleId ? { ruleId: e.ruleId, period: e.period, automatic: !!e.automatic } : {}),
  }
}
function checkedSettings(settings) {
  return settingsOf(parseBackup(JSON.stringify({ schema: 2, entries: [], ...settings })))
}
function checkSize(data) {
  if (Buffer.byteLength(JSON.stringify(data), 'utf8') > 600000)
    fail('LIMIT', '设置数据过大，请先导出备份并联系维护者')
}
function createHandler(db, services = {}) {
  const features = createFeatures(db, services)
  return async (event, context) => {
    try {
      if (!APP_ID || !context?.OPENID || context.APPID !== APP_ID)
        fail('AUTH', '请从小青账本微信小程序访问')
      const owner = hash(context.APPID + ':' + context.OPENID)
      const scope = event.bookId || owner
      if (scope !== owner && !/^group_[a-f0-9]{32}$/.test(scope)) fail('VALIDATION', '账本标识无效')
      const bookRef = db.collection(COLLECTIONS.books).doc(scope)
      const action = event?.action
      const sessions = db.collection(COLLECTIONS.requests)
      if (action === 'login') {
        const token = crypto.randomBytes(32).toString('hex')
        const expiresAt = Date.now() + 24 * 60 * 60 * 1000
        await sessions
          .doc('session_' + hash(token))
          .set({ data: { owner, expiresAt, type: 'session' } })
        return {
          ok: true,
          accountId: owner,
          token,
          expiresAt,
          profile: await features.publicProfile(owner),
        }
      }
      if (!/^[a-f0-9]{64}$/.test(event?.token || '')) fail('AUTH', '请先使用微信登录')
      const sessionRef = sessions.doc('session_' + hash(event.token))
      const session = await get(sessionRef)
      if (
        !session ||
        session.type !== 'session' ||
        session.owner !== owner ||
        session.expiresAt <= Date.now()
      )
        fail('AUTH', '登录已失效，请重新登录')
      if (action === 'logout') {
        await sessionRef.remove()
        return { ok: true, accountId: owner }
      }
      if (action === 'session') return { ok: true, accountId: owner, expiresAt: session.expiresAt }
      if (
        [
          'workspace',
          'profileSave',
          'groupCreate',
          'groupInvite',
          'groupJoin',
          'groupLeave',
          'groupDetails',
          'groupDelete',
        ].includes(action)
      ) {
        const result = await features.handle(event, owner)
        return { ok: true, accountId: owner, ...result }
      }
      await features.access(scope, owner)
      if (action === 'runDue')
        return { ok: true, accountId: owner, ...(await features.runScheduled(chinaDate(), scope)) }
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
          bookId: scope,
          bookName: scope === owner ? '个人账本' : book.name,
          rules: await features.rulesFor(book, owner),
        }
      }
      if (action === 'page') {
        const book = (await get(bookRef)) || defaultBook()
        if (book.revision !== event.revision) fail('CONFLICT', '账本已更新，请重新同步')
        const after = event.after || ''
        if (after && !/^[a-f0-9]{64}$/.test(after)) fail('VALIDATION', '分页参数无效')
        const where = { owner: scope }
        if (after) where._id = db.command.gt(after)
        const result = await db
          .collection(COLLECTIONS.entries)
          .where(where)
          .orderBy('_id', 'asc')
          .limit(100)
          .get()
        await features.access(scope, owner)
        const latest = (await get(bookRef)) || defaultBook()
        if (latest.revision !== book.revision) fail('CONFLICT', '账本已更新，请重新同步')
        const cleaned = result.data.map(cleanEntry)
        const fallback = await features.author(owner)
        const people = await features.avatarURLs(cleaned.map((e) => e.author || fallback))
        const enriched = cleaned.map((e, i) => ({ ...e, author: people[i] }))
        return {
          ok: true,
          accountId: owner,
          revision: book.revision,
          entries: enriched,
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
        'renameCategory',
        'removeCategory',
        'setHidden',
        'importBatch',
        'createRule',
        'toggleRule',
        'deleteRule',
      ]
      if (!allowed.includes(operation)) fail('VALIDATION', '不支持的写入操作')
      if (Buffer.byteLength(JSON.stringify(event), 'utf8') > 700000)
        fail('LIMIT', '单次请求过大，请减少导入量')
      const fingerprint = hash(JSON.stringify({ baseRevision, operation, args }))
      const receiptId = ownId(owner, (scope === owner ? '' : scope + ':') + requestId)
      const result = await db.runTransaction(async (transaction) => {
        await features.access(scope, owner, transaction)
        const receipts = transaction.collection(COLLECTIONS.requests)
        const receipt = await get(receipts.doc(receiptId))
        if (receipt) {
          if (receipt.fingerprint !== fingerprint) fail('VALIDATION', '请求标识重复，请重新同步')
          return receipt.response
        }
        const books = transaction.collection(COLLECTIONS.books),
          records = transaction.collection(COLLECTIONS.entries)
        const book = (await get(books.doc(scope))) || defaultBook()
        const by = await features.author(owner, transaction)
        if (
          scope !== owner &&
          ['setBudget', 'addCategory', 'removeCategory', 'renameCategory', 'importBatch'].includes(
            operation,
          ) &&
          book.creator !== owner
        )
          fail('FORBIDDEN', '此操作仅群主可执行')
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
            if (args.id && (typeof args.id !== 'string' || args.id.length > 120))
              throw new Error('账单标识无效')
            if (args.createId && !/^[a-zA-Z0-9_-]{12,100}$/.test(args.createId))
              throw new Error('新账单标识无效')
            let id = args.id || args.createId || 'entry_' + requestId
            let linkedRule, linkedPeriod, cycleRef, cycle
            if (args.ruleId) {
              linkedRule = await get(books.doc(args.ruleId))
              if (!linkedRule || linkedRule.scope !== scope || (!linkedRule.active && !args.id))
                fail('VALIDATION', '定期项目不存在或已暂停')
              if (args.draft.kind !== 'expense' || args.draft.date < linkedRule.startDate)
                fail('VALIDATION', '关联项目仅适用于开始日期之后的支出')
              linkedPeriod = periodOf(linkedRule, args.draft.date)
              cycleRef = receipts.doc(cycleId(scope, args.ruleId, linkedPeriod))
              cycle = await get(cycleRef)
              if (cycle && !args.id) id = cycle.entryId
              if (cycle && args.id && cycle.entryId !== id)
                fail('CONFLICT', '该周期已有账单，请编辑已有记录')
            }
            const previous = await get(records.doc(ownId(scope, id)))
            validate(args.draft, {
              expense: [
                ...categoryOptions(state, 'expense'),
                ...(previous?.kind === 'expense' ? [previous.category] : []),
              ],
              income: [
                ...categoryOptions(state, 'income'),
                ...(previous?.kind === 'income' ? [previous.category] : []),
              ],
            })
            if (
              previous?.ruleId &&
              (previous.ruleId !== args.ruleId || previous.period !== linkedPeriod)
            )
              fail('VALIDATION', '关联账单不能更换项目或跨周期修改日期')
            if (
              scope !== owner &&
              previous &&
              previous.author?.id !== owner &&
              !(previous.automatic && linkedRule && !args.id)
            )
              fail('FORBIDDEN', '只能修改自己记录的账单')
            if (args.id && (!previous || previous.version !== args.expectedVersion))
              fail('CONFLICT', '账单已修改或删除，请重新打开')
            if (previous && !args.id && !(previous.automatic && linkedRule))
              fail('CONFLICT', '这笔记录已保存，请返回账单查看，勿重复提交')
            if (previous) usage(previous, -1)
            else book.count++
            const entry = cleanEntry({
              kind: args.draft.kind,
              cents: args.draft.cents,
              category: args.draft.category,
              date: args.draft.date,
              note: args.draft.note,
              author: by,
              ...(linkedRule
                ? { ruleId: args.ruleId, period: linkedPeriod, automatic: false }
                : {}),
              id,
              note: args.draft.note.trim(),
              version: (previous?.version || 0) + 1,
              updatedAt: new Date().toISOString(),
            })
            if (cycleRef)
              writes.push(() => cycleRef.set({ data: { entryId: id, automatic: false } }))
            usage(entry, 1)
            writes.push(() =>
              records.doc(ownId(scope, id)).set({ data: { ...entry, owner: scope } }),
            )
            resultData = entry
          } else if (operation === 'remove') {
            if (typeof args.id !== 'string' || args.id.length > 120) throw new Error('账单标识无效')
            const doc = records.doc(ownId(scope, args.id)),
              entry = await get(doc)
            if (!entry || entry.version !== args.version)
              fail('CONFLICT', '账单已修改或删除，请刷新后重试')
            if (scope !== owner && entry.author?.id !== owner)
              fail('FORBIDDEN', '只能删除自己记录的账单')
            // Keep the period marker after deletion, so the timer will not recreate a removed bill.
            usage(entry, -1)
            book.count--
            writes.push(() => doc.remove())
          } else if (operation === 'createRule') {
            const input = ruleInput(args.rule, state, chinaDate())
            const ruleId = 'rule_' + hash(scope + ':' + requestId).slice(0, 32)
            if ((book.ruleIds || []).length >= 50) fail('LIMIT', '每个账本最多 50 个定期项目')
            book.ruleIds = [...(book.ruleIds || []), ruleId]
            const rule = { ...input, type: 'rule', scope, creator: owner, id: ruleId }
            writes.push(() => books.doc(ruleId).set({ data: rule }))
            resultData = rule
          } else if (operation === 'deleteRule') {
            if (typeof args.ruleId !== 'string' || !/^rule_[a-f0-9]{32}$/.test(args.ruleId))
              fail('VALIDATION', '定期项目无效')
            const rule = await get(books.doc(args.ruleId))
            if (!rule || rule.scope !== scope) fail('VALIDATION', '定期项目无效')
            if (rule.creator !== owner && book.creator !== owner)
              fail('FORBIDDEN', '只能管理自己创建的定期项目')
            // Keep a disabled tombstone so existing linked bills remain editable.
            rule.active = false
            rule.deleted = true
            book.ruleIds = (book.ruleIds || []).filter((id) => id !== args.ruleId)
            writes.push(() => books.doc(args.ruleId).set({ data: rule }))
          } else if (operation === 'toggleRule') {
            const rule = await get(books.doc(args.ruleId))
            if (!rule || rule.deleted || rule.scope !== scope || typeof args.active !== 'boolean')
              fail('VALIDATION', '定期项目无效')
            if (rule.creator !== owner && book.creator !== owner)
              fail('FORBIDDEN', '只能管理自己创建的定期项目')
            if (args.active && !categoryOptions(state, 'expense').includes(rule.category))
              fail('VALIDATION', '任务分类已删除，请重新创建任务并选择有效分类')
            rule.active = args.active
            if (rule.active && rule.nextDate < chinaDate()) {
              const reset = ruleInput(rule, state, chinaDate())
              rule.nextDate = reset.nextDate
            }
            writes.push(() => books.doc(args.ruleId).set({ data: rule }))
            resultData = rule
          } else if (operation === 'importBatch') {
            const imported = parseBackup(args.text)
            if (imported.entries.length > 20) throw new Error('单次最多导入 20 笔')
            let added = 0,
              skipped = 0,
              conflicts = 0
            state.categoryList = {
              expense: Array.from(
                new Set([
                  ...categoryOptions(state, 'expense'),
                  ...categoryOptions(imported, 'expense'),
                ]),
              ),
              income: Array.from(
                new Set([
                  ...categoryOptions(state, 'income'),
                  ...categoryOptions(imported, 'income'),
                ]),
              ),
            }
            for (const [month, budget] of Object.entries(imported.budgets))
              if (!state.budgets[month]) state.budgets[month] = budget
            for (const entry of imported.entries) {
              const doc = records.doc(ownId(scope, entry.id)),
                previous = await get(doc)
              if (previous) {
                skipped++
                if (JSON.stringify(cleanEntry(previous)) !== JSON.stringify(entry)) conflicts++
              } else {
                added++
                book.count++
                usage(entry, 1)
                // Imported author/link metadata is untrusted. Imported records are attributed to the importer.
                const { author, ruleId, period, automatic, ...plain } = entry
                writes.push(() => doc.set({ data: { ...plain, author: by, owner: scope } }))
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
            if (['addCategory', 'removeCategory', 'renameCategory'].includes(operation)) {
              if (!['expense', 'income'].includes(args.kind)) throw new Error('收支类型无效')
              repository[operation](args.kind, args.name, args.newName)
              if (args.kind === 'expense' && operation !== 'addCategory') {
                for (const ruleId of book.ruleIds || []) {
                  const rule = await get(books.doc(ruleId))
                  if (rule?.category === args.name) {
                    if (operation === 'renameCategory') rule.category = args.newName.trim()
                    else rule.active = false
                    writes.push(() => books.doc(ruleId).set({ data: rule }))
                  }
                }
              }
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
          if (e instanceof Fault || e.exposed) throw e
          fail('VALIDATION', e.message || '数据校验失败')
        }
        // All reads are completed before writes. <= 44 document operations for a 20-row import.
        for (const write of writes) await write()
        book.revision++
        book.updatedAt = new Date().toISOString()
        const response = { ok: true, accountId: owner, revision: book.revision, result: resultData }
        await books.doc(scope).set({ data: book })
        await receipts
          .doc(receiptId)
          .set({ data: { owner, fingerprint, response, createdAt: book.updatedAt } })
        return response
      })
      return result?.result?.ok ? result.result : result
    } catch (e) {
      if (e instanceof Fault || e.exposed) return { ok: false, code: e.code, message: e.message }
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
