<script setup>
import { computed, ref, watch } from 'vue'
import { budgetProgress, categoryOptions, money, parseMoney, validMonth } from '../../../src/core/ledger.ts'
import { budgetPace, previousMonthBudget, sumCategoryBudget } from '../../../src/core/insights.ts'
const props = defineProps({ state: Object, bookName: String, month: String, busy: Boolean, canManage: Boolean })
const emit = defineEmits(['update:month', 'save'])
const totalInput = ref(''), limits = ref({}), error = ref(''), notice = ref(''), baseline = ref(null),
  baselineDraft = ref(''), draftMonth = ref(''), pendingBudget = ref(null)
const saved = computed(() => props.state.budgets[props.month])
const categories = computed(() => Array.from(new Set([
  ...categoryOptions(props.state, 'expense'), ...Object.keys(saved.value?.categories || {}), ...Object.keys(limits.value),
])))
const pace = computed(() => validMonth(props.month) ? budgetPace(props.state.entries, saved.value, props.month) : null)
const progress = computed(() => budgetProgress(saved.value?.total || 0, pace.value?.spent || 0))
const previous = computed(() => {
  try { return validMonth(props.month) ? previousMonthBudget(props.state, props.month) : null }
  catch { return null }
})
const draftKey = () => JSON.stringify({ total: totalInput.value, categories: limits.value })
const dirty = computed(() => draftKey() !== baselineDraft.value)
function cloneBudget(budget) { return budget ? { total: budget.total, categories: { ...budget.categories } } : null }
function budgetKey(budget) {
  return budget ? JSON.stringify([budget.total, Object.entries(budget.categories).sort(([a], [b]) => a.localeCompare(b))]) : 'null'
}
const changedElsewhere = computed(() => props.month === draftMonth.value && budgetKey(saved.value) !== budgetKey(baseline.value))
function fill(budget) {
  totalInput.value = budget?.total ? money(budget.total) : ''
  limits.value = Object.fromEntries(Object.entries(budget?.categories || {}).map(([name, cents]) => [name, money(cents)]))
}
function reloadDraft() {
  if (props.busy) return
  loadDraft()
}
function loadDraft() {
  fill(saved.value)
  baseline.value = cloneBudget(saved.value)
  baselineDraft.value = draftKey()
  draftMonth.value = props.month
  pendingBudget.value = null
  error.value = ''; notice.value = ''
}
watch(() => props.month, loadDraft, { immediate: true, flush: 'sync' })
watch(() => budgetKey(saved.value), () => {
  if (props.month !== draftMonth.value) return
  // A refresh of unrelated bills must preserve edits. Only confirmed saves or clean drafts adopt a new budget.
  if (!dirty.value || (pendingBudget.value && budgetKey(saved.value) === budgetKey(pendingBudget.value))) loadDraft()
}, { flush: 'sync' })
function copyPrevious() {
  if (!props.canManage || props.busy || !previous.value) return
  const hasContent = totalInput.value.trim() || Object.values(limits.value).some(value => value.trim())
  if ((dirty.value || hasContent) && !window.confirm('当前已填写预算，使用上月预算替换当前草稿？保存后才会生效。')) return
  fill(previous.value)
  error.value = ''; notice.value = '已填入上月预算，点击“保存预算”后生效。'
}
function fillTotal() {
  if (!props.canManage || props.busy) return
  try {
    const cents = sumCategoryBudget(limits.value)
    if (!cents) throw Error('请先填写至少一项分类预算')
    totalInput.value = money(cents); error.value = ''; notice.value = '已将分类预算合计填入总预算，保存后生效。'
  }
  catch (e) { error.value = e.message }
}
function save() {
  if (!props.canManage || props.busy) return
  try {
    if (!validMonth(props.month)) throw Error('请选择有效月份')
    if (changedElsewhere.value) throw Error('预算已在其他设备或页面更新，请重新加载后再保存')
    const budget = { total: totalInput.value.trim() ? parseMoney(totalInput.value) : 0, categories: {} }
    for (const [name, value] of Object.entries(limits.value)) if (value.trim()) budget.categories[name] = parseMoney(value)
    error.value = ''; notice.value = ''
    pendingBudget.value = cloneBudget(budget)
    emit('save', { month: props.month, budget, expectedBudget: cloneBudget(baseline.value) })
  } catch (e) { error.value = e.message }
}
function spent(name) { return props.state.entries.filter(e => e.kind === 'expense' && e.category === name && e.date.startsWith(props.month + '-')).reduce((sum, e) => sum + e.cents, 0) }
</script>
<template>
  <section class="card">
    <div class="row wrap"><h2>给开销一点计划 · {{ bookName }}</h2><label class="inline-label">月份<input type="month" :value="month" :disabled="busy" @change="emit('update:month', $event.target.value)" /></label></div>
    <p class="muted">每个月单独设置，留白表示不设限。分类限额独立提醒，不自动分摊总预算。</p>
    <p v-if="!canManage" class="muted">共享预算由群主管理，所有成员的群组支出共同消耗预算。</p>
    <div v-if="pace" class="metric-grid">
      <div><span>本月已支出</span><strong>¥ {{ money(pace.spent) }}</strong></div>
      <div><span>{{ pace.remaining < 0 && pace.hasBudget ? '已超支' : '预算剩余' }}</span><strong :class="{ warning: pace.hasBudget && pace.remaining < 0 }">{{ pace.hasBudget ? '¥ ' + money(Math.abs(pace.remaining)) : '未设置' }}</strong></div>
      <div><span>{{ pace.phase === 'future' ? '计划天数' : '剩余天数（含今天）' }}</span><strong>{{ pace.daysRemaining }} 天</strong></div>
      <div><span>每天可用</span><strong>{{ pace.dailyAllowance === null ? '—' : '¥ ' + money(pace.dailyAllowance) }}</strong></div>
    </div>
    <p v-if="pace" class="muted small">{{ pace.phase === 'past' ? '本月已结束。' : pace.phase === 'future' ? '按该月全部天数分配预算。' : '每天可用按剩余预算与剩余天数计算，不代表实际可用余额。' }}</p>
    <div v-if="saved?.total" class="progress-track"><div class="progress-fill" :class="{ over: progress.over }" :style="{ width: progress.percent + '%' }" /></div>
    <div class="filter-grid">
      <label>月度总预算（元）<input v-model="totalInput" :disabled="!canManage || busy" inputmode="decimal" placeholder="不设限" /></label>
    </div>
    <div class="actions wrap"><button :disabled="!canManage || busy || !previous" @click="copyPrevious">沿用上月预算</button><button :disabled="!canManage || busy" @click="fillTotal">分类合计填入总预算</button></div>
    <p v-if="error" class="alert error">{{ error }}</p><p v-if="notice" class="alert success">{{ notice }}</p>
    <div v-if="changedElsewhere" class="alert error">
      <p>预算已在其他设备或页面更新，当前填写内容已保留。重新加载会用最新预算替换当前草稿，请核对后再保存。</p>
      <button :disabled="busy" @click="reloadDraft">重新加载最新预算</button>
    </div>
  </section>
  <section class="card">
    <h2>分类预算</h2>
    <div v-for="name in categories" :key="name" class="line">
      <div><b>{{ name }}</b><small>已花 ¥ {{ money(spent(name)) }}<span v-if="saved?.categories[name] && spent(name) > saved.categories[name]" class="warning"> · 超支 ¥ {{ money(spent(name) - saved.categories[name]) }}</span></small></div>
      <label class="budget-limit"><span class="visually-hidden">{{ name }}预算（元）</span><input v-model="limits[name]" :disabled="!canManage || busy" inputmode="decimal" placeholder="不设限" /><span>元</span></label>
    </div>
    <div class="actions section-actions"><button class="primary" :disabled="!canManage || busy || changedElsewhere" @click="save">{{ busy ? '正在保存…' : '保存预算' }}</button><span v-if="dirty" class="muted small">有未保存的修改</span></div>
  </section>
</template>
