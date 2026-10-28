const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')
const { parse, compileScript } = require('vue/compiler-sfc')
const vue = require('vue')

// Execute the real page setup and reactive state without a device or a cloud account.
class TestDate extends Date {
  constructor(...args) {
    if (args.length) super(...args)
    else super(2026, 9, 28, 12)
  }
  static now() { return new Date(2026, 9, 28, 12).getTime() }
}
const plain = (value) => JSON.parse(JSON.stringify(value))
const coreModules = new Map()
function loadCore(name) {
  if (coreModules.has(name)) return coreModules.get(name)
  const exports = {}
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(`src/core/${name}.ts`, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, {
    exports, require: (request) => loadCore(request.replace('./', '')),
    Date: TestDate, Error, Math, JSON, Set, Map, console,
  })
  coreModules.set(name, exports)
  return exports
}
const core = loadCore('ledger')
const entry = (id, date, cents, extra = {}) => ({
  id, date, cents, kind: 'expense', category: '餐饮', note: '', version: 1,
  updatedAt: `${date}T12:00:00Z`, ...extra,
})
function fixture() {
  const state = core.emptyState()
  state.entries = [
    entry('old', '2026-09-30', 500, { category: '旧分类' }),
    entry('first', '2026-10-01', 2000, { note: '早餐' }),
    entry('today', '2026-10-28', 1500, { note: '午餐' }),
    entry('future', '2026-10-29', 50000),
  ]
  state.budgets['2026-09'] = { total: 30000, categories: { 餐饮: 10000, 旧分类: 5000 } }
  state.budgets['2026-10'] = { total: 10000, categories: { 交通: 5000 } }
  return state
}
function environment(initial = fixture()) {
  let raw = JSON.stringify(initial)
  const flags = { failWrite: false, refreshOk: true }
  const calls = { writes: [], errors: [], modals: [], toasts: [], copies: [], routes: [] }
  const repo = core.createRepository({
    read: () => raw,
    write: (value) => {
      if (flags.failWrite) throw new Error('测试存储失败')
      raw = value
    },
  })
  const state = vue.ref(repo.read())
  const service = {
    state,
    entries: vue.computed(() => state.value.entries),
    currentBookId: vue.ref(''), currentBookName: vue.ref('个人账本'),
    canManageBook: vue.ref(true), syncBusy: vue.ref(false), loadError: vue.ref(''),
    recordFilter: vue.ref(null),
    async refresh() {
      if (flags.refreshOk) state.value = repo.read()
      return flags.refreshOk
    },
    repository: {
      async setBudget(month, budget, expectedBudget) {
        calls.writes.push({ month, budget: plain(budget), expectedBudget: plain(expectedBudget) })
        repo.setBudget(month, budget)
        state.value = repo.read()
      },
    },
    toastError: (error) => calls.errors.push(error.message),
    copyText: (text) => calls.copies.push(text),
    openEntry() {},
  }
  const uni = {
    showModal: (options) => calls.modals.push(options),
    showToast: (options) => calls.toasts.push(options),
    switchTab: (options) => calls.routes.push(options.url),
  }
  return {
    service, calls, flags, uni, raw: () => raw,
    remoteBudget(month, budget) {
      repo.setBudget(month, budget)
      state.value = repo.read()
    },
  }
}
function setupPage(filename, env, props = {}, globals = {}) {
  const hooks = { load: [], show: [] }
  const { descriptor, errors } = parse(fs.readFileSync(filename, 'utf8'), { filename })
  assert.equal(errors.length, 0, `${filename} parses`)
  const script = compileScript(descriptor, { id: filename })
  const exports = {}
  const resolve = (request) => {
    if (request === 'vue') return vue
    if (request === '@dcloudio/uni-app') return {
      onLoad: (hook) => hooks.load.push(hook), onShow: (hook) => hooks.show.push(hook),
    }
    if (request === '@/services/auth') return {
      useProtectedPage: () => ({ authenticated: vue.ref(true) }),
      browseReady: vue.ref(true), authenticated: vue.ref(true), guestMode: vue.ref(false),
      ensureSession: async () => true,
    }
    if (request === '@/services/navigation') return { useNavigationIcons() {} }
    if (request === '@/services/ledger') return env.service
    if (['@/components/BillList.vue', '@/components/GuestNotice.vue', '@/components/SessionNotice.vue'].includes(request)) return {}
    if (request === '@/core/ledger' || request.endsWith('/core/ledger.ts')) return core
    if (request === '@/core/insights' || request.endsWith('/core/insights.ts')) return loadCore('insights')
    throw new Error(`Unexpected import in ${filename}: ${request}`)
  }
  vm.runInNewContext(ts.transpileModule(script.content, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, {
    exports, require: resolve, uni: env.uni, Date: TestDate, Error, Math, JSON, Set, Map,
    console, ...globals,
  }, { filename })
  const emitted = []
  const scope = vue.effectScope()
  const page = scope.run(() => exports.default.setup(props, {
    expose() {}, emit: (...args) => emitted.push(args),
  }))
  return { page, hooks, emitted, stop: () => scope.stop() }
}
const settle = async () => { await vue.nextTick(); await Promise.resolve(); await vue.nextTick() }

async function checkMiniBudget() {
  const env = environment()
  const mounted = setupPage('src/pages/budget/index.vue', env)
  const page = mounted.page
  await page.load()
  const before = env.raw()
  assert.equal(page.totalInput.value, '100.00')

  page.reusePrevious()
  assert.equal(env.calls.modals.length, 1)
  env.calls.modals.pop().success({ confirm: false })
  assert.equal(page.totalInput.value, '100.00', 'cancel preserves the current draft')
  assert.equal(env.raw(), before)

  page.reusePrevious()
  env.calls.modals.pop().success({ confirm: true })
  assert.equal(page.totalInput.value, '300.00')
  assert.equal(page.limits.value.旧分类, '50.00')
  assert.ok(page.categories.value.includes('旧分类'), 'copied historical limits stay editable')
  assert.equal(env.calls.writes.length, 0, 'copying is never an implicit save')
  assert.equal(env.raw(), before)
  page.limits.value.旧分类 = '51.00'
  assert.equal(env.service.state.value.budgets['2026-09'].categories.旧分类, 5000)

  env.flags.failWrite = true
  await page.save()
  assert.equal(env.raw(), before, 'failed persistence preserves every original budget')
  assert.equal(page.totalInput.value, '300.00', 'failed persistence retains the editable draft')
  assert.match(env.calls.errors.at(-1), /存储失败/)
  assert.equal(page.busy.value, false)
  env.flags.failWrite = false
  await page.save()
  assert.equal(env.service.state.value.budgets['2026-10'].total, 30000)
  assert.equal(env.service.state.value.budgets['2026-10'].categories.旧分类, 5100)
  assert.equal(env.service.state.value.budgets['2026-09'].categories.旧分类, 5000)
  assert.deepEqual(env.calls.writes.at(-1).expectedBudget, { total: 10000, categories: { 交通: 5000 } },
    'a save passes the loaded budget baseline into the service')

  // A foreground refresh can reveal another device's saved budget while a local draft is open.
  page.totalInput.value = '400.00'
  const beforeConflict = env.calls.writes.length
  env.remoteBudget('2026-10', { total: 70000, categories: { 餐饮: 25000 } })
  assert.equal(page.changedElsewhere.value, true)
  await page.save()
  assert.equal(env.calls.writes.length, beforeConflict, 'stale drafts cannot overwrite a refreshed budget')
  assert.equal(env.service.state.value.budgets['2026-10'].total, 70000)
  assert.equal(page.totalInput.value, '400.00', 'conflicting refresh preserves the draft for review')
  assert.match(env.calls.errors.at(-1), /其他设备或页面更新/)
  await page.load()
  assert.equal(page.changedElsewhere.value, false)
  assert.equal(page.totalInput.value, '700.00', 'explicit reload adopts the latest budget')

  const writeCount = env.calls.writes.length
  env.service.canManageBook.value = false
  page.totalInput.value = '999.00'
  page.reusePrevious()
  page.fillCategoryTotal()
  await page.save()
  assert.equal(page.totalInput.value, '999.00')
  assert.equal(env.calls.modals.length, 0)
  assert.equal(env.calls.writes.length, writeCount, 'a group member cannot write by invoking the handler')
  env.service.canManageBook.value = true
  env.flags.refreshOk = false
  await page.load()
  await page.save()
  assert.equal(page.ready.value, false)
  assert.equal(env.calls.writes.length, writeCount, 'a failed load cannot save a stale draft')
  mounted.stop()
}

async function checkMiniRecordsAndStats() {
  const env = environment()
  const records = setupPage('src/pages/records/index.vue', env)
  const page = records.page
  assert.ok(page.categoryList.value.includes('旧分类'))
  page.changeRange({ detail: { value: '1' } })
  page.startDate.value = '2026-10-28'
  page.endDate.value = '2026-10-01'
  assert.match(page.result.value.error, /开始日期/)
  assert.equal(page.filtered.value.length, 0)
  page.exportFiltered()
  assert.equal(env.calls.copies.length, 0, 'invalid filters cannot export a misleading result')

  page.startDate.value = '2026-10-01'
  page.endDate.value = '2026-10-28'
  page.minAmount.value = '15'
  page.maxAmount.value = '20'
  page.sort.value = 'amount-desc'
  assert.deepEqual(plain(page.filtered.value.map((e) => e.id)), ['first', 'today'])
  assert.equal(page.amountSorted.value, true)
  assert.equal(page.total.value.expense, 3500)
  page.exportFiltered()
  assert.ok(env.calls.copies[0].includes('2026-10-01'))
  assert.ok(!env.calls.copies[0].includes('2026-10-29'))
  page.sort.value = 'date-asc'
  assert.deepEqual(plain(page.groups.value.map((group) => group.date)), ['2026-10-01', '2026-10-28'])

  // Drill through the actual stats handler into the records onShow hook with stale filters set.
  const stats = setupPage('src/pages/stats/index.vue', env)
  assert.equal(stats.page.report.value.current.expense, 3500, 'current insights exclude future bills')
  page.query.value = '不匹配'
  page.kind.value = 'income'
  page.minAmount.value = '999'
  page.sort.value = 'amount-asc'
  page.view.value = 'calendar'
  page.day.value = '2026-10-29'
  stats.page.drill('餐饮')
  assert.equal(env.calls.routes.at(-1), '/pages/records/index')
  records.hooks.show[0]()
  await settle()
  assert.equal(env.service.recordFilter.value, null)
  assert.equal(page.startDate.value, '2026-10-01')
  assert.equal(page.endDate.value, '2026-10-28')
  assert.equal(page.query.value, '')
  assert.equal(page.minAmount.value, '')
  assert.equal(page.maxAmount.value, '')
  assert.equal(page.sort.value, 'date-desc')
  assert.equal(page.view.value, 'list')
  assert.equal(page.day.value, '')
  assert.deepEqual(plain(page.filtered.value.map((e) => e.id)), ['today', 'first'])

  stats.page.changePeriod('year')
  stats.page.drill('旧分类')
  records.hooks.show[0]()
  await settle()
  assert.equal(page.startDate.value, '2026-01-01')
  assert.equal(page.endDate.value, '2026-10-28')
  assert.deepEqual(plain(page.filtered.value.map((e) => e.id)), ['old'])

  page.changeView('calendar')
  assert.equal(page.rangeMode.value, 'month')
  assert.equal(page.day.value, '')
  page.minAmount.value = '100'
  page.query.value = '旧内容'
  env.service.currentBookId.value = 'group-next'
  await settle()
  assert.equal(page.rangeMode.value, 'month')
  assert.equal(page.kind.value, 'all')
  assert.equal(page.category.value, '')
  assert.equal(page.query.value, '')
  assert.equal(page.minAmount.value, '')
  assert.equal(page.view.value, 'list')
  assert.equal(page.sort.value, 'date-desc')
  records.stop()
  stats.stop()
}

async function checkDesktopBudget() {
  const env = environment()
  const props = vue.reactive({
    state: fixture(), bookName: '个人账本', month: '2026-10', busy: false, canManage: true,
  })
  let confirmed = false
  const mounted = setupPage('desktop/ui/components/BudgetPanel.vue', env, props, {
    window: { confirm: () => confirmed },
  })
  const page = mounted.page
  const before = JSON.stringify(props.state)
  page.totalInput.value = '123.00'
  page.copyPrevious()
  assert.equal(page.totalInput.value, '123.00', 'desktop copy cancellation preserves unsaved edits')
  confirmed = true
  page.copyPrevious()
  assert.equal(page.totalInput.value, '300.00')
  assert.equal(page.limits.value.旧分类, '50.00')
  assert.equal(JSON.stringify(props.state), before)
  assert.equal(mounted.emitted.length, 0)
  page.save()
  assert.deepEqual(plain(mounted.emitted[0]), ['save', {
    month: '2026-10', budget: { total: 30000, categories: { 餐饮: 10000, 旧分类: 5000 } },
    expectedBudget: { total: 10000, categories: { 交通: 5000 } },
  }])
  assert.equal(JSON.stringify(props.state), before, 'the panel waits for parent persistence')

  // Only the matching persistence result settles the pending draft.
  const confirmedState = plain(props.state)
  confirmedState.budgets['2026-10'] = plain(mounted.emitted[0][1].budget)
  props.state = confirmedState
  await settle()
  assert.equal(page.dirty.value, false)
  assert.equal(page.changedElsewhere.value, false)
  page.totalInput.value = '400.00'
  const unrelatedRefresh = plain(props.state)
  unrelatedRefresh.entries.push(entry('added', '2026-10-28', 100))
  props.state = unrelatedRefresh
  await settle()
  assert.equal(page.totalInput.value, '400.00', 'an unrelated bill refresh preserves budget edits')
  assert.equal(page.dirty.value, true)
  assert.equal(page.changedElsewhere.value, false)

  const changedBudget = plain(props.state)
  changedBudget.budgets['2026-10'] = { total: 70000, categories: { 餐饮: 25000 } }
  props.state = changedBudget
  await settle()
  assert.equal(page.totalInput.value, '400.00', 'remote budget changes preserve the unsaved draft')
  assert.equal(page.changedElsewhere.value, true)
  page.save()
  assert.equal(mounted.emitted.length, 1, 'a conflicted desktop draft cannot emit a save')
  assert.match(page.error.value, /其他设备或页面更新/)
  props.busy = true
  page.reloadDraft()
  assert.equal(page.totalInput.value, '400.00', 'reloading waits until pending work completes')
  props.busy = false
  page.reloadDraft()
  assert.equal(page.totalInput.value, '700.00')
  assert.equal(page.changedElsewhere.value, false)
  assert.equal(page.dirty.value, false)
  page.totalInput.value = '750.00'
  page.save()
  assert.deepEqual(plain(mounted.emitted[1][1].expectedBudget), {
    total: 70000, categories: { 餐饮: 25000 },
  }, 'a confirmed reload supplies the latest baseline for the next save')

  props.busy = true
  page.totalInput.value = '200.00'
  page.copyPrevious()
  page.save()
  assert.equal(page.totalInput.value, '200.00')
  assert.equal(mounted.emitted.length, 2, 'busy state blocks duplicate saves')
  props.busy = false
  props.canManage = false
  page.copyPrevious()
  page.save()
  assert.equal(mounted.emitted.length, 2)
  props.canManage = true
  page.totalInput.value = '1.001'
  page.save()
  assert.ok(page.error.value)
  assert.equal(mounted.emitted.length, 2, 'invalid input is never emitted')
  props.month = '2026-09'
  await settle()
  assert.equal(page.totalInput.value, '300.00')
  assert.equal(page.dirty.value, false, 'month changes display the selected month budget')
  mounted.stop()
}

;(async () => {
  await checkMiniBudget()
  await checkMiniRecordsAndStats()
  await checkDesktopBudget()
  console.log('PASS UI features: real page setup, budget drafts/cancellation/failed storage/permissions/conflicts, range and amount filtering, CSV, stats drill-through, book reset, desktop budget events')
})().catch((error) => { console.error(error); process.exitCode = 1 })
