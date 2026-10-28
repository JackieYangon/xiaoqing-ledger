<script setup>
import { ref, computed, onUnmounted } from 'vue'
import RecordsPanel from './components/RecordsPanel.vue'
import BudgetPanel from './components/BudgetPanel.vue'
import StatsPanel from './components/StatsPanel.vue'
import { createCloudClient } from '../../src/core/cloud-client.ts'
import {
  emptyState,
  categoryOptions,
  parseMoney,
  money,
  today,
  inMonth,
  summarize,
  calculateMoney,
} from '../../src/core/ledger.ts'
const api = window.desktopLedger
const token = ref(''),
  account = ref(''),
  profile = ref(null),
  groups = ref([]),
  book = ref(''),
  bookName = ref('个人账本'),
  snapshot = ref(emptyState()),
  rules = ref([]),
  busy = ref(false),
  error = ref(''),
  notice = ref(''),
  page = ref('home')
const recordFilter = ref(null)
const qr = ref(''),
  pairCode = ref(''),
  pairScene = ref(''),
  pairExpiry = ref(0),
  waiting = ref(false)
let client = null,
  timer = null,
  epoch = 0,
  gatewayScope = ''
const kind = ref('expense'),
  category = ref(''),
  amount = ref(''),
  date = ref(today()),
  note = ref(''),
  editing = ref(null),
  linkedRule = ref(''),
  month = ref(today().slice(0, 7))
const catKind = ref('expense'),
  catName = ref(''),
  renameOld = ref(''),
  renameNew = ref(''),
  groupName = ref(''),
  joinCode = ref(''),
  invite = ref('')
const ruleName = ref(''),
  ruleAmount = ref(''),
  ruleFreq = ref('monthly'),
  ruleDay = ref(1),
  ruleCategory = ref('')
const options = computed(() => categoryOptions(snapshot.value, kind.value)),
  catOptions = computed(() => categoryOptions(snapshot.value, catKind.value)),
  expenseOptions = computed(() => categoryOptions(snapshot.value, 'expense'))
const currentEntries = computed(() => inMonth(snapshot.value.entries, month.value)),
  summary = computed(() => summarize(currentEntries.value))
const canManage = computed(
  () => !book.value || groups.value.find((g) => g.id === book.value)?.creator === account.value,
)
const title = computed(
  () =>
    ({
      home: '总览',
      entries: '账单',
      entry: '记一笔',
      budget: '预算',
      categories: '分类管理',
      recurring: '定期记账',
      groups: '群组账本',
      stats: '统计',
    })[page.value],
)
const storage = {
  get: (k) => localStorage.getItem(k) || '',
  set: (k, v) => localStorage.setItem(k, v),
  remove: (k) => localStorage.removeItem(k),
}
async function rawCall(payload) {
  const r = await api.request({ ...payload, token: token.value })
  if (r?.code === 'AUTH') {
    reset()
    throw Error('登录已失效，请重新扫码')
  }
  return r
}
async function call(payload) {
  const r = await rawCall(payload)
  if (!r?.ok) {
    if (r?.code === 'AUTH') {
      reset()
      throw Error('登录已失效，请重新扫码')
    }
    const e = Error(r?.message || '云端操作失败')
    e.code = r?.code
    throw e
  }
  return r
}
function reset() {
  epoch++
  clearInterval(timer)
  timer = null
  token.value = ''
  account.value = ''
  profile.value = null
  client = null
  groups.value = []
  snapshot.value = emptyState()
  rules.value = []
  book.value = ''
  qr.value = ''
  waiting.value = false
  editing.value = null
  linkedRule.value = ''
  recordFilter.value = null
  page.value = 'home'
  amount.value = ''
  note.value = ''
  groupName.value = ''
  joinCode.value = ''
  invite.value = ''
  catName.value = ''
  renameOld.value = ''
  renameNew.value = ''
  ruleName.value = ''
  ruleAmount.value = ''
}
async function start() {
  reset()
  error.value = ''
  notice.value = ''
  waiting.value = true
  const run = epoch
  try {
    gatewayScope = await api.scope()
    const secret = await api.newToken(),
      tokenHash = await api.hashToken(secret),
      r = await api.request({ action: 'desktopBegin', tokenHash })
    if (!r.ok) throw Error(r.message || '获取登录码失败')
    if (epoch !== run) return
    qr.value = r.qr
    pairCode.value = r.code
    pairScene.value = r.scene
    pairExpiry.value = r.expiresAt
    let polling = false
    timer = setInterval(async () => {
      if (polling || epoch !== run) return
      polling = true
      try {
        const v = await api.request({ action: 'desktopPoll', scene: r.scene, token: secret })
        if (epoch !== run) return
        if (!v.ok) {
          clearInterval(timer)
          timer = null
          waiting.value = false
          error.value = v.message || '登录请求已失效'
          return
        }
        if (v.state === 'approved') {
          clearInterval(timer)
          timer = null
          token.value = secret
          account.value = v.accountId
          waiting.value = false
          qr.value = ''
          try {
            await refreshWorkspace()
            if (!(await switchBook(''))) throw Error(error.value || '读取账本失败')
            notice.value = '已连接云端'
          } catch (e) {
            reset()
            error.value = '登录已确认，但账本加载失败，请重新扫码：' + e.message
          }
        }
      } catch (e) {
        if (epoch === run) error.value = e.message
      } finally {
        polling = false
      }
    }, 1800)
  } catch (e) {
    if (epoch === run) {
      waiting.value = false
      error.value = e.message
    }
  }
}
async function refreshWorkspace() {
  const r = await call({ action: 'workspace' })
  groups.value = r.groups || []
  profile.value = r.profile || null
}
async function load() {
  if (!client) return
  const s = await client.load()
  if (s.accountId !== account.value) throw Error('账号不匹配，请重新登录')
  snapshot.value = s.state
  rules.value = s.rules || []
  bookName.value = s.bookName || '个人账本'
  if (!options.value.includes(category.value)) category.value = options.value[0] || ''
  if (!expenseOptions.value.includes(ruleCategory.value))
    ruleCategory.value = expenseOptions.value[0] || ''
}
async function switchBook(id) {
  if (busy.value) return
  busy.value = true
  error.value = ''
  notice.value = ''
  const oldClient = client,
    oldBook = book.value
  try {
    const next = createCloudClient(rawCall, storage, 'desktop_' + gatewayScope, id)
    const s = await next.load()
    if (s.accountId !== account.value) throw Error('账号不匹配')
    client = next
    book.value = id
    snapshot.value = s.state
    rules.value = s.rules || []
    bookName.value = s.bookName || '个人账本'
    editing.value = null
    linkedRule.value = ''
    recordFilter.value = null
    amount.value = ''
    note.value = ''
    date.value = today()
    ruleName.value = ''
    ruleAmount.value = ''
    renameOld.value = ''
    renameNew.value = ''
    catName.value = ''
    invite.value = ''
    category.value = categoryOptions(s.state, kind.value)[0] || ''
    ruleCategory.value = categoryOptions(s.state, 'expense')[0] || ''
    return true
  } catch (e) {
    client = oldClient
    book.value = oldBook
    error.value = e.message
    return false
  } finally {
    busy.value = false
  }
}
async function execute(fn) {
  if (busy.value) return
  busy.value = true
  error.value = ''
  notice.value = ''
  try {
    await fn()
  } catch (e) {
    error.value = e.message
  } finally {
    busy.value = false
  }
}
async function mutate(op, args) {
  await client.mutate(op, args)
  await load()
}
function openEntry(entry, selectedDate) {
  if (busy.value) return
  editing.value = entry || null
  linkedRule.value = entry?.ruleId || ''
  kind.value = entry?.kind || 'expense'
  category.value = entry?.category || categoryOptions(snapshot.value, kind.value)[0] || ''
  amount.value = entry ? money(entry.cents) : ''
  date.value = entry?.date || selectedDate || today()
  note.value = entry?.note || ''
  page.value = 'entry'
}
function copyEntry(entry) {
  if (busy.value) return
  openEntry(entry)
  editing.value = null
  linkedRule.value = ''
  date.value = today()
  const available = categoryOptions(snapshot.value, kind.value)
  if (!available.includes(category.value)) {
    category.value = available[0] || ''
    notice.value = '原账单分类已停用，请确认本次分类后保存。'
  } else notice.value = '已带入金额和备注，保存后新增一笔账单。'
}
const calculated = computed(() => {
  try { return money(calculateMoney(amount.value)) } catch { return '' }
})
const noteSuggestions = computed(() => Array.from(new Set(snapshot.value.entries
  .filter(e => e.kind === kind.value && e.category === category.value && e.note)
  .map(e => e.note))).slice(0, 4))
function drillRecords(filter) {
  recordFilter.value = filter
  page.value = 'entries'
}
function selectRule() {
  const r = rules.value.find((v) => v.id === linkedRule.value)
  if (r) {
    kind.value = 'expense'
    category.value = r.category
    amount.value = money(r.cents)
    note.value = r.note || r.name
  }
}
function setKind(k) {
  if (linkedRule.value && k !== 'expense') return
  kind.value = k
  category.value = categoryOptions(snapshot.value, k)[0] || ''
}
function saveEntry(again = false) {
  execute(async () => {
    const draft = {
      kind: kind.value,
      category: category.value,
      cents: calculateMoney(amount.value),
      date: date.value,
      note: note.value,
    }
    const prev = editing.value
    await mutate('save', {
      draft,
      ...(linkedRule.value ? { ruleId: linkedRule.value } : {}),
      ...(prev
        ? { id: prev.id, expectedVersion: prev.version }
        : { createId: 'entry_' + crypto.randomUUID().replaceAll('-', '') }),
    })
    editing.value = null
    if (again && !prev) {
      amount.value = ''
      note.value = ''
      linkedRule.value = ''
    } else page.value = 'entries'
    notice.value = '账单已保存'
  })
}
function removeEntry(e) {
  if (!window.confirm('删除这笔账单？此操作无法撤销。')) return
  execute(async () => {
    await mutate('remove', { id: e.id, version: e.version })
    notice.value = '账单已删除'
  })
}
function saveBudget(args) {
  execute(async () => {
    if (!canManage.value) throw Error('群组预算由群主管理')
    const current = snapshot.value.budgets[args.month] || null
    const expected = args.expectedBudget
    const same = current === null || expected === null
      ? current === expected
      : !!expected && current.total === expected.total &&
        Object.keys(current.categories).length === Object.keys(expected.categories).length &&
        Object.entries(current.categories).every(([name, cents]) => expected.categories[name] === cents)
    if (!same) throw Error('预算已在其他设备或页面更新，请重新加载后再保存')
    await mutate('setBudget', { month: args.month, budget: args.budget })
    notice.value = '预算已保存'
  })
}
function addCategory() {
  execute(async () => {
    await mutate('addCategory', { kind: catKind.value, name: catName.value })
    catName.value = ''
    notice.value = '分类已添加'
  })
}
function beginRename(name) { renameOld.value = name; renameNew.value = name }
function renameCategory() {
  execute(async () => {
    await mutate('renameCategory', {
      kind: catKind.value,
      name: renameOld.value,
      newName: renameNew.value,
    })
    renameOld.value = ''
    notice.value = '分类已修改'
  })
}
function deleteCategory(item) {
  if (!window.confirm('删除该分类？历史账单保留，相关定期项目将暂停。')) return
  execute(async () => {
    await mutate('removeCategory', { kind: catKind.value, name: item })
    notice.value = '分类已删除'
  })
}
function createRule() {
  execute(async () => {
    await mutate('createRule', {
      rule: {
        name: ruleName.value,
        cents: parseMoney(ruleAmount.value),
        frequency: ruleFreq.value,
        day: Number(ruleDay.value),
        category: ruleCategory.value,
        note: '',
      },
    })
    ruleName.value = ''
    ruleAmount.value = ''
    notice.value = '定期项目已创建'
  })
}
function toggleRule(r) {
  execute(() => mutate('toggleRule', { ruleId: r.id, active: !r.active }))
}
function deleteRule(r) {
  if (!window.confirm('删除定期项目？已生成的账单会保留。')) return
  execute(() => mutate('deleteRule', { ruleId: r.id }))
}
function createGroup() {
  execute(async () => {
    const key = 'xiaoqing.desktop.group.pending.' + gatewayScope + '.' + account.value
    const saved = JSON.parse(localStorage.getItem(key) || 'null')
    if (saved && saved.name !== groupName.value.trim())
      throw Error('有一笔创建群组的请求尚待确认，请使用原群组名称重试')
    const request = saved || {
      name: groupName.value.trim(),
      requestId: 'desktop_' + crypto.randomUUID().replaceAll('-', ''),
    }
    if (!saved) localStorage.setItem(key, JSON.stringify(request))
    try {
      await call({ action: 'groupCreate', args: request })
      localStorage.removeItem(key)
    } catch (e) {
      if (e.code === 'VALIDATION' || e.code === 'FORBIDDEN') localStorage.removeItem(key)
      throw e
    }
    groupName.value = ''
    await refreshWorkspace()
    notice.value = '群组已创建'
  })
}
function joinGroup() {
  execute(async () => {
    await call({ action: 'groupJoin', args: { code: joinCode.value.trim() } })
    joinCode.value = ''
    await refreshWorkspace()
    notice.value = '已加入群组'
  })
}
function getInvite() {
  execute(async () => {
    const r = await call({ action: 'groupInvite', args: { groupId: book.value } })
    invite.value = r.code
  })
}
function signout() {
  const old = token.value
  reset()
  api.request({ action: 'logout', token: old }).catch(() => {})
  notice.value = '已退出登录'
}
onUnmounted(() => clearInterval(timer))
</script>
<template>
  <div v-if="!token" class="login-wrap">
    <div class="login-card">
      <div class="brand-mark">✓</div>
      <p class="eyebrow">XIAOQING LEDGER</p>
      <h1>把日子，记清楚。</h1>
      <p class="muted">使用微信扫码，继续管理你的个人和群组账本。</p>
      <div v-if="qr" class="qr-panel">
        <img :src="qr" alt="微信登录小程序码" />
        <p>打开微信扫一扫，在小程序中确认登录</p>
        <div class="pair">{{ pairCode }}</div>
        <small>请与手机上显示的六位数字核对</small>
      </div>
      <p v-if="error" class="error">{{ error }}</p>
      <button class="primary" :disabled="waiting && !qr" @click="start">
        {{ qr ? '刷新二维码' : waiting ? '正在获取二维码…' : '微信扫码登录' }}
      </button>
      <p class="muted small">登录请求两分钟内有效。请确认是你本人操作。</p>
    </div>
  </div>
  <div v-else class="shell">
    <aside class="sidebar">
      <div class="brand">
        <span>✓</span>
        小青账本
      </div>
      <p class="muted small">桌面版 · 云端同步</p>
      <nav>
        <button
          v-for="n in [
            ['home', '总览'],
            ['entries', '账单'],
            ['stats', '统计'],
            ['entry', '记一笔'],
            ['budget', '预算'],
            ['categories', '分类'],
            ['recurring', '定期记账'],
            ['groups', '群组'],
          ]"
          :key="n[0]"
          :class="{ active: page === n[0] }"
          :disabled="busy"
          @click="n[0] === 'entry' ? openEntry() : (recordFilter = null, page = n[0])"
        >
          {{ n[1] }}
        </button>
      </nav>
      <div class="sidebar-foot">
        <div>{{ profile?.name || '微信用户' }}</div>
        <button class="text" @click="signout">退出登录</button>
      </div>
    </aside>
    <main>
      <header>
        <div>
          <p class="eyebrow">MY LEDGER</p>
          <h1>{{ title }}</h1>
        </div>
        <div class="header-actions">
          <select :value="book" :disabled="busy" @change="switchBook($event.target.value)">
            <option value="">个人账本</option>
            <option v-for="g in groups" :key="g.id" :value="g.id">{{ g.name }}</option>
          </select>
          <button
            :disabled="busy"
            @click="
              execute(async () => {
                await refreshWorkspace()
                await load()
                notice = '同步完成'
              })
            "
          >
            同步
          </button>
        </div>
      </header>
      <p v-if="error" class="alert error">{{ error }}</p>
      <p v-if="notice" class="alert success">{{ notice }}</p>
      <template v-if="page === 'home'">
        <div class="hero">
          <div>
            <p>{{ bookName }} · {{ month }} 支出</p>
            <strong>¥ {{ money(summary.expense) }}</strong>
          </div>
          <div>
            <span>收入 ¥ {{ money(summary.income) }}</span>
            <br />
            <span>结余 ¥ {{ money(summary.income - summary.expense) }}</span>
          </div>
        </div>
        <div class="quick">
          <button class="primary" @click="openEntry()">＋ 记一笔</button>
          <button :disabled="busy" @click="recordFilter = null; page = 'entries'">查看账单</button>
          <button :disabled="busy" @click="page = 'stats'">收支统计</button>
          <button :disabled="busy" @click="page = 'budget'">设置预算</button>
        </div>
        <section class="card">
          <h2>最近账单</h2>
          <p v-if="!snapshot.entries.length" class="muted">账本还是空的，记下第一笔吧。</p>
          <div v-for="e in snapshot.entries.slice(0, 8)" :key="e.id" class="line">
            <div>
              <b>{{ e.category }}</b>
              <small>
                {{ e.date }} · {{ e.author?.name || '微信用户' }} {{ e.note ? '· ' + e.note : '' }}
              </small>
            </div>
            <b :class="e.kind">{{ e.kind === 'expense' ? '-' : '+' }} ¥ {{ money(e.cents) }}</b>
          </div>
        </section>
      </template>
      <template v-else-if="page === 'entries'">
        <RecordsPanel :key="book" :state="snapshot" :book-name="bookName" v-model:month="month" :busy="busy" :account="account" :initial-filter="recordFilter" @open-entry="openEntry" @copy-entry="copyEntry" @remove-entry="removeEntry" />
      </template>
      <template v-else-if="page === 'stats'">
        <StatsPanel :key="book" :entries="snapshot.entries" :book-name="bookName" v-model:month="month" @drill="drillRecords" />
      </template>
      <template v-else-if="page === 'entry'">
        <section class="card form">
          <div class="row wrap"><h2>{{ editing ? '编辑账单' : '新增账单' }} · {{ bookName }}</h2><button v-if="editing" :disabled="busy" @click="copyEntry(editing)">再记一笔</button></div>
          <div class="row">
            <button :class="{ active: kind === 'expense' }" @click="setKind('expense')">
              支出
            </button>
            <button :class="{ active: kind === 'income' }" @click="setKind('income')">收入</button>
          </div>
          <label>
            关联定期项目
            <select v-model="linkedRule" :disabled="!!editing" @change="selectRule">
              <option value="">不关联</option>
              <option
                v-if="linkedRule && !rules.some((r) => r.id === linkedRule)"
                :value="linkedRule"
              >
                已删除的定期项目
              </option>
              <option
                v-for="r in rules.filter((r) => r.active || r.id === linkedRule)"
                :key="r.id"
                :value="r.id"
              >
                {{ r.name }}
              </option>
            </select>
          </label>
          <p v-if="linkedRule" class="muted">
            关联项目后，同一周期只保留一笔；若自动账单已生成，会更新该账单。
          </p>
          <label>
            分类
            <select v-model="category">
              <option
                v-if="editing && !options.includes(editing.category)"
                :value="editing.category"
              >
                {{ editing.category }}（历史）
              </option>
              <option v-for="c in options" :key="c">{{ c }}</option>
            </select>
          </label>
          <p v-if="!options.length" class="muted">暂无分类，请先到分类管理添加。</p>
          <label>
            金额（元）
            <input v-model="amount" maxlength="80" placeholder="0.00 或 18.5+6-2" />
          </label>
          <p class="muted small">支持加减计算 · {{ calculated ? '结果 ¥ ' + calculated : '输入完整金额或算式' }}</p>
          <label>
            日期
            <input type="date" v-model="date" />
          </label>
          <label>
            备注
            <input v-model="note" maxlength="100" placeholder="选填" />
          </label>
          <div v-if="noteSuggestions.length" class="actions wrap"><button v-for="text in noteSuggestions" :key="text" class="note-suggestion" :title="text" @click="note = text">{{ text }}</button></div>
          <div class="actions wrap section-actions"><button v-if="!editing" :disabled="busy" @click="saveEntry(true)">保存并再记</button><button class="primary" :disabled="busy" @click="saveEntry(false)">保存账单</button></div>
        </section>
      </template>
      <template v-else-if="page === 'budget'">
        <BudgetPanel :key="book" :state="snapshot" :book-name="bookName" v-model:month="month" :busy="busy" :can-manage="canManage" @save="saveBudget" />
      </template>
      <template v-else-if="page === 'categories'">
        <section class="card">
          <div class="row">
            <h2>分类管理</h2>
            <div>
              <button @click="catKind = 'expense'">支出</button>
              <button @click="catKind = 'income'">收入</button>
            </div>
          </div>
          <div v-for="c in catOptions" :key="c" class="line">
            <b>{{ c }}</b>
            <div class="actions" v-if="canManage">
              <button
                @click="beginRename(c)"
              >
                修改
              </button>
              <button @click="deleteCategory(c)">删除</button>
            </div>
          </div>
          <div v-if="canManage" class="inline">
            <input v-model="catName" maxlength="12" placeholder="新分类名称" />
            <button @click="addCategory">添加分类</button>
          </div>
          <div v-if="renameOld" class="inline">
            <span>修改 {{ renameOld }}</span>
            <input v-model="renameNew" maxlength="12" />
            <button @click="renameCategory">保存</button>
            <button @click="renameOld = ''">取消</button>
          </div>
        </section>
      </template>
      <template v-else-if="page === 'recurring'">
        <section class="card">
          <h2>定期记账 · {{ bookName }}</h2>
          <p class="muted">
            到期生成账单，不会发起真实扣款。手动记账时可选择关联项目，避免同一周期重复记账。
          </p>
          <div v-for="r in rules" :key="r.id" class="line">
            <div>
              <b>{{ r.name }} · ¥ {{ money(r.cents) }}</b>
              <small>
                {{
                  r.frequency === 'monthly'
                    ? '每月 ' + r.day + ' 日'
                    : '每周 ' + ['一', '二', '三', '四', '五', '六', '日'][r.day - 1]
                }}
                · 下次 {{ r.nextDate }} · {{ r.active ? '已启用' : '已暂停' }}
              </small>
            </div>
            <div v-if="r.creator === account || canManage" class="actions">
              <button @click="toggleRule(r)">{{ r.active ? '暂停' : '恢复' }}</button>
              <button @click="deleteRule(r)">删除</button>
            </div>
          </div>
        </section>
        <section class="card form">
          <h2>新增定期项目</h2>
          <label>
            名称
            <input v-model="ruleName" maxlength="24" />
          </label>
          <label>
            金额（元）
            <input v-model="ruleAmount" />
          </label>
          <label>
            周期
            <select v-model="ruleFreq" @change="ruleDay = 1">
              <option value="monthly">每月</option>
              <option value="weekly">每周</option>
            </select>
          </label>
          <label>
            日期
            <select v-model.number="ruleDay">
              <option v-for="n in ruleFreq === 'monthly' ? 31 : 7" :key="n" :value="n">
                {{
                  ruleFreq === 'monthly'
                    ? n + ' 日'
                    : '星期' + ['一', '二', '三', '四', '五', '六', '日'][n - 1]
                }}
              </option>
            </select>
          </label>
          <label>
            支出分类
            <select v-model="ruleCategory">
              <option v-for="c in expenseOptions" :key="c">{{ c }}</option>
            </select>
          </label>
          <button class="primary" :disabled="busy" @click="createRule">创建定期项目</button>
        </section>
      </template>
      <template v-else>
        <section class="card">
          <h2>我的群组</h2>
          <p class="muted">使用顶部账本选择器切换，个人账单不会自动共享。</p>
          <div v-for="g in groups" :key="g.id" class="line">
            <b>{{ g.name }}</b>
            <button @click="switchBook(g.id)">切换账本</button>
          </div>
          <div class="inline">
            <input v-model="groupName" maxlength="24" placeholder="群组名称" />
            <button @click="createGroup">创建群组</button>
          </div>
          <div class="inline">
            <input v-model="joinCode" maxlength="16" placeholder="输入 16 位邀请码" />
            <button @click="joinGroup">加入群组</button>
          </div>
          <div v-if="book && canManage" class="inline">
            <button @click="getInvite">生成邀请码</button>
            <b v-if="invite">{{ invite }}</b>
          </div>
        </section>
      </template>
    </main>
  </div>
</template>
