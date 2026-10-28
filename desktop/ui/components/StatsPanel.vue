<script setup>
import { computed, ref, watch } from 'vue'
import { categoryTotals, money, monthDays, summarize, validMonth } from '../../../src/core/ledger.ts'
import { periodReport } from '../../../src/core/insights.ts'
const props = defineProps({ entries: Array, bookName: String, month: String })
const emit = defineEmits(['update:month', 'drill', 'open-entry'])
const period = ref('month'), kind = ref('expense'), selectedBar = ref(-1)
const report = computed(() => {
  try { return validMonth(props.month) ? periodReport(props.entries, props.month, period.value) : null }
  catch { return null }
})
const totals = computed(() => categoryTotals(report.value?.currentEntries || [], kind.value))
const comparison = computed(() => {
  if (!report.value?.elapsedDays) return '该周期尚未开始'
  const previous = report.value?.previous[kind.value] || 0, current = report.value?.current[kind.value] || 0
  if (!previous) return current ? '上期金额为 0，暂无增幅' : '两期均无该类收支'
  if (current === previous) return '与上期持平'
  return `${current > previous ? '增加' : '减少'} ${Math.abs((current - previous) / previous * 100).toFixed(1)}%`
})
const trend = computed(() => !report.value ? [] : Array.from({ length: period.value === 'month' ? monthDays(props.month) : 12 }, (_, i) => {
  const date = period.value === 'month' ? `${props.month}-${String(i + 1).padStart(2, '0')}` : `${props.month.slice(0, 4)}-${String(i + 1).padStart(2, '0')}`
  return { date, label: i + 1, cents: summarize(report.value.currentEntries.filter(e => period.value === 'month' ? e.date === date : e.date.startsWith(date + '-')))[kind.value] }
}))
const maximum = computed(() => Math.max(1, ...trend.value.map(t => t.cents)))
const selected = computed(() => trend.value[selectedBar.value])
const biggest = computed(() => (report.value?.currentEntries || []).filter(e => e.kind === kind.value).slice().sort((a, b) => b.cents - a.cents || b.date.localeCompare(a.date)).slice(0, 5))
watch([period, kind, () => props.month], () => { selectedBar.value = -1 })
function drill(category) {
  if (!report.value || !report.value.currentEntries.length) return
  emit('drill', { startDate: report.value.startDate, endDate: report.value.endDate, kind: kind.value, category })
}
</script>
<template>
  <section class="card">
    <div class="row wrap"><h2>{{ bookName }} · 收支统计</h2><label class="inline-label">月份<input type="month" :value="month" @change="emit('update:month', $event.target.value)" /></label></div>
    <div class="row wrap"><div class="actions"><button :class="{ active: period === 'month' }" @click="period = 'month'">月度</button><button :class="{ active: period === 'year' }" @click="period = 'year'">年度</button></div><div class="actions"><button :class="{ active: kind === 'expense' }" @click="kind = 'expense'">支出</button><button :class="{ active: kind === 'income' }" @click="kind = 'income'">收入</button></div></div>
    <template v-if="report">
      <p class="muted">{{ report.startDate }} 至 {{ report.endDate }} · {{ report.elapsedDays ? '当前周期统计至今日，历史周期统计整期。' : '该周期尚未开始，暂不统计。' }}</p>
      <div class="report-total">¥ {{ money(report.current[kind]) }}</div>
      <p class="muted">较上期同进度：{{ comparison }}</p>
      <p v-if="report.elapsedDays" class="muted small">对比区间：{{ report.previousStartDate }} 至 {{ report.previousEndDate }}</p>
      <div class="metric-grid">
        <div><span>结余</span><strong>¥ {{ money(report.balance) }}</strong></div>
        <div><span>结余率</span><strong>{{ report.savingsRate === null ? '—' : report.savingsRate.toFixed(1) + '%' }}</strong></div>
        <div><span>日均支出</span><strong>¥ {{ money(report.dailyExpense) }}</strong></div>
        <div><span>无支出记录天数</span><strong>{{ report.noExpenseDays }} 天</strong></div>
        <div><span>记账天数</span><strong>{{ report.recordedDays }} 天</strong></div>
        <div><span>账单笔数</span><strong>{{ report.currentEntries.length }} 笔</strong></div>
      </div>
      <p class="muted small">日均按统计区间自然日计算；无支出记录天数只表示账本没有记录，不代表当天没有消费。</p>
    </template>
    <p v-else class="alert error">请选择有效月份。</p>
  </section>
  <section class="card">
    <div class="row wrap"><h2>{{ kind === 'expense' ? '支出' : '收入' }}趋势</h2><span class="muted small">{{ period === 'month' ? '每日金额' : '每月金额' }} · 点击柱形查看</span></div>
    <div class="trend-chart"><button v-for="(bar, index) in trend" :key="bar.date" class="trend-column" :aria-label="bar.date + ' 金额 ' + money(bar.cents) + ' 元'" @click="selectedBar = index"><span class="trend-space"><span class="trend-bar" :class="{ chosen: selectedBar === index }" :style="{ height: (bar.cents ? Math.max(3, bar.cents / maximum * 100) : 0) + '%' }" /></span><small>{{ period === 'year' || index === 0 || (index + 1) % 5 === 0 ? bar.label : '' }}</small></button></div>
    <p class="trend-detail">{{ selected ? `${selected.date} · ¥ ${money(selected.cents)}` : '点击柱形查看具体金额' }}</p>
  </section>
  <section class="card"><h2>分类排行榜</h2><p v-if="!totals.length" class="empty-state">这个周期暂无记录。</p><button v-for="(item, index) in totals" :key="item.name" class="ranking-row" @click="drill(item.name)"><span class="row wrap"><span>{{ index + 1 }}. {{ item.name }} · {{ item.percent }}%</span><b>¥ {{ money(item.cents) }} ›</b></span><span class="progress-track"><span class="progress-fill" :style="{ width: item.percent + '%' }" /></span></button></section>
  <section class="card"><h2>大额{{ kind === 'expense' ? '支出' : '收入' }} · TOP 5</h2><p v-if="!biggest.length" class="empty-state">暂无记录。</p><div v-for="entry in biggest" :key="entry.id" class="line"><div><b>{{ entry.category }}</b><small>{{ entry.date }}{{ entry.note ? ' · ' + entry.note : '' }}</small></div><b>¥ {{ money(entry.cents) }}</b></div></section>
</template>
