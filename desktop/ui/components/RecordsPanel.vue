<script setup>
import { computed, ref, watch } from 'vue'
import { calendar, categoryOptions, money, monthDays, summarize, today, toCsv, validMonth } from '../../../src/core/ledger.ts'
import { filterEntries } from '../../../src/core/insights.ts'
const props = defineProps({ state: Object, bookName: String, month: String, busy: Boolean, account: String, initialFilter: Object })
const emit = defineEmits(['update:month', 'open-entry', 'copy-entry', 'remove-entry'])
const scope = ref('month'), kind = ref('all'), category = ref(''), query = ref(''),
  startDate = ref(''), endDate = ref(''), minAmount = ref(''), maxAmount = ref(''),
  sort = ref('date-desc'), view = ref('list'), day = ref(''), exportError = ref('')
const categories = computed(() => Array.from(new Set([
  ...categoryOptions(props.state, 'expense'), ...categoryOptions(props.state, 'income'),
  ...props.state.entries.map(e => e.category),
])))
const result = computed(() => {
  try {
    if (scope.value === 'month' && !validMonth(props.month)) throw Error('请选择有效月份')
    if (scope.value === 'range' && (!startDate.value || !endDate.value)) throw Error('请选择完整的开始和结束日期')
    return { entries: filterEntries(props.state.entries, {
      startDate: scope.value === 'month' ? props.month + '-01' : scope.value === 'range' ? startDate.value : '',
      endDate: scope.value === 'month' ? `${props.month}-${monthDays(props.month)}` : scope.value === 'range' ? endDate.value : '',
      kind: kind.value, category: category.value, query: query.value,
      minAmount: minAmount.value, maxAmount: maxAmount.value, sort: sort.value,
    }), error: '' }
  } catch (e) { return { entries: [], error: e.message } }
})
const filtered = computed(() => result.value.entries.filter(e => view.value !== 'calendar' || !day.value || e.date === day.value))
const total = computed(() => summarize(filtered.value))
const cells = computed(() => validMonth(props.month) ? calendar(props.month, result.value.entries) : [])
watch([scope, kind, category, query, startDate, endDate, minAmount, maxAmount, () => props.month], () => { day.value = ''; exportError.value = '' })
watch(scope, value => { if (value !== 'month') view.value = 'list' }, { flush: 'sync' })
watch(() => props.initialFilter, value => {
  if (!value) return
  reset()
  scope.value = 'range'
  startDate.value = value.startDate
  endDate.value = value.endDate
  kind.value = value.kind
  category.value = value.category || ''
}, { immediate: true })
function reset() {
  scope.value = 'month'; kind.value = 'all'; category.value = ''; query.value = ''
  startDate.value = ''; endDate.value = ''; minAmount.value = ''; maxAmount.value = ''
  sort.value = 'date-desc'; day.value = ''; view.value = 'list'; exportError.value = ''
}
function changeView(value) {
  if (value === 'calendar') scope.value = 'month'
  view.value = value
  day.value = ''
}
function compact(cents) { return cents >= 100000 ? (cents / 100000).toFixed(1) + 'k' : money(cents) }
function exportCsv() {
  if (result.value.error || !filtered.value.length) return
  try {
    const url = URL.createObjectURL(new Blob([toCsv(filtered.value)], { type: 'text/csv;charset=utf-8' }))
    const anchor = document.createElement('a')
    anchor.href = url; anchor.download = `小青账本-筛选账单-${today()}.csv`
    anchor.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  } catch (e) { exportError.value = '导出失败：' + e.message }
}
</script>
<template>
  <section class="card">
    <div class="row wrap">
      <h2>{{ bookName }} · 收支明细</h2>
      <div class="actions wrap">
        <button :class="{ active: view === 'list' }" @click="changeView('list')">明细</button>
        <button :class="{ active: view === 'calendar' }" @click="changeView('calendar')">日历</button>
        <button class="primary" :disabled="busy" @click="emit('open-entry', null, day || undefined)">＋ 记一笔</button>
      </div>
    </div>
    <div class="filter-grid">
      <label>日期范围<select v-model="scope"><option value="month">按月</option><option value="range">自选日期</option><option value="all">全部日期</option></select></label>
      <label v-if="scope === 'month' || view === 'calendar'">{{ scope === 'month' ? '月份' : '日历月份' }}<input type="month" :value="month" @change="emit('update:month', $event.target.value)" /></label>
      <template v-if="scope === 'range'">
        <label>开始日期<input type="date" v-model="startDate" /></label>
        <label>结束日期<input type="date" v-model="endDate" /></label>
      </template>
      <label>收支类型<select v-model="kind"><option value="all">全部</option><option value="expense">支出</option><option value="income">收入</option></select></label>
      <label>分类<select v-model="category"><option value="">全部分类</option><option v-for="name in categories" :key="name">{{ name }}</option></select></label>
      <label class="filter-search">关键词<input v-model="query" maxlength="100" placeholder="搜索分类、备注或记账人" /></label>
      <label>最低金额（元）<input v-model="minAmount" inputmode="decimal" placeholder="不限" /></label>
      <label>最高金额（元）<input v-model="maxAmount" inputmode="decimal" placeholder="不限" /></label>
      <label>排序<select v-model="sort"><option value="date-desc">日期从近到远</option><option value="date-asc">日期从远到近</option><option value="amount-desc">金额从高到低</option><option value="amount-asc">金额从低到高</option></select></label>
    </div>
    <div class="actions wrap"><button @click="reset">重置筛选</button><button :disabled="!!result.error || !filtered.length" @click="exportCsv">导出筛选结果 CSV</button></div>
    <p v-if="result.error || exportError" class="alert error">{{ result.error || exportError }}</p>
    <div v-if="view === 'calendar'" class="ledger-calendar">
      <div class="calendar-grid weekdays"><span v-for="name in ['一','二','三','四','五','六','日']" :key="name">{{ name }}</span></div>
      <div class="calendar-grid">
        <button v-for="(cell, index) in cells" :key="index" class="calendar-day" :class="{ active: !!cell.date && cell.date === day, today: cell.date === today() }" :disabled="!cell.date" @click="day = day === cell.date ? '' : cell.date">
          <span>{{ cell.day || '' }}</span><small v-if="cell.expense" class="expense">−{{ compact(cell.expense) }}</small><small v-if="cell.income" class="income">+{{ compact(cell.income) }}</small>
        </button>
      </div>
      <div class="row wrap"><p class="muted small">{{ day || '点击日期查看当天账单，日历金额随筛选条件变化。' }}</p><button v-if="day" :disabled="busy" @click="emit('open-entry', null, day)">补记当天</button></div>
    </div>
    <p class="muted">{{ filtered.length }} 笔 · 收入 ¥ {{ money(total.income) }} · 支出 ¥ {{ money(total.expense) }} · 结余 ¥ {{ money(total.income - total.expense) }}</p>
    <p v-if="!filtered.length && !result.error" class="empty-state">没有符合条件的账单，换个筛选条件试试。</p>
    <div v-for="entry in filtered" :key="entry.id" class="line record-line">
      <div class="record-description"><b>{{ entry.category }}</b><small>{{ entry.date }} · {{ entry.author?.name || '微信用户' }}{{ entry.note ? ' · ' + entry.note : '' }}{{ entry.automatic ? ' · 自动记账' : '' }}</small></div>
      <div class="actions wrap">
        <b class="record-amount" :class="entry.kind">{{ entry.kind === 'expense' ? '−' : '+' }} ¥ {{ money(entry.cents) }}</b>
        <button :disabled="busy" @click="emit('copy-entry', entry)">再记一笔</button>
        <template v-if="!entry.author || entry.author.id === account">
          <button :disabled="busy" @click="emit('open-entry', entry)">编辑</button><button :disabled="busy" @click="emit('remove-entry', entry)">删除</button>
        </template>
      </div>
    </div>
  </section>
</template>
