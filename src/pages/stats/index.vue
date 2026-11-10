<script setup lang="ts">
import SessionNotice from '@/components/SessionNotice.vue'
import { useNavigationIcons } from '@/services/navigation'
useNavigationIcons()
import { browseReady } from '@/services/auth'
import GuestNotice from '@/components/GuestNotice.vue'
import { ref, computed, watch } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import {
  today,
  money,
  summarize,
  monthDays,
  type Kind,
} from '@/core/ledger'
import { budgetUsage, periodReport, type BudgetUsageMonth, type BudgetUsageRow } from '@/core/insights'
import { state, entries, loadError, refresh, recordFilter, currentBookId } from '@/services/ledger'
const month = ref(today().slice(0, 7)),
  kind = ref<Kind>('expense'),
  period = ref<'month' | 'year'>('month'),
  selectedBar = ref(-1)
const report = computed(() => periodReport(entries.value, month.value, period.value))
const periodEntries = computed(() => report.value.currentEntries)
const total = computed(() => report.value.current)
const budgetMonths = computed(() => budgetUsage(entries.value, state.value.budgets, month.value, period.value))
const previous = computed(() => report.value.previous[kind.value])
const comparison = computed(() => {
  if (!report.value.elapsedDays) return '该周期尚未开始'
  if (!previous.value) return total.value[kind.value] ? '上期金额为 0，暂无增幅' : '两期均无该类收支'
  const change = total.value[kind.value] - previous.value
  if (!change) return '与上期持平'
  return `${change > 0 ? '增加' : '减少'} ${Math.abs((change / previous.value) * 100).toFixed(1)}%`
})
const trend = computed(() =>
  Array.from({ length: period.value === 'month' ? monthDays(month.value) : 12 }, (_, i) => {
    const prefix =
      period.value === 'month'
        ? `${month.value}-${String(i + 1).padStart(2, '0')}`
        : `${month.value.slice(0, 4)}-${String(i + 1).padStart(2, '0')}`
    const matching = periodEntries.value.filter((e) =>
      period.value === 'month' ? e.date === prefix : e.date.startsWith(prefix + '-'),
    )
    return { label: i + 1, cents: summarize(matching)[kind.value], date: prefix }
  }),
)
const maxTrend = computed(() => Math.max(1, ...trend.value.map((b) => b.cents)))
const selected = computed(() => (selectedBar.value >= 0 ? trend.value[selectedBar.value] : null))
function changePeriod(value: 'month' | 'year') {
  period.value = value
  selectedBar.value = -1
}
function changeMonth(e: any) {
  month.value = e.detail.value
  selectedBar.value = -1
}
function drillBudget(budgetMonth: BudgetUsageMonth, item: BudgetUsageRow) {
  if (budgetMonth.phase === 'future') return
  recordFilter.value = {
    month: budgetMonth.month,
    kind: 'expense',
    category: item.category,
    startDate: budgetMonth.startDate,
    endDate: budgetMonth.endDate,
  }
  uni.switchTab({ url: '/pages/records/index' })
}
watch(currentBookId, () => { selectedBar.value = -1 })
onShow(refresh)
</script>
<template>
  <SessionNotice />
  <template v-if="browseReady">
  <view class="page">
    <GuestNotice />
    <view class="row">
      <view class="title compact-title">收支统计</view>
      <picker mode="date" fields="month" :value="month" @change="changeMonth">
        <text class="badge">{{ period === 'year' ? month.slice(0, 4) : month }} ▾</text>
      </picker>
    </view>
    <view class="row switches">
      <view class="chips">
        <view class="chip" :class="{ active: period === 'month' }" @tap="changePeriod('month')">
          月度
        </view>
        <view class="chip" :class="{ active: period === 'year' }" @tap="changePeriod('year')">
          年度
        </view>
      </view>
      <view class="chips">
        <view class="chip" :class="{ active: kind === 'expense' }" @tap="kind = 'expense'">
          支出
        </view>
        <view class="chip" :class="{ active: kind === 'income' }" @tap="kind = 'income'">收入</view>
      </view>
    </view>
    <view v-if="loadError" class="error">{{ loadError }}</view>
    <view class="card">
      <view class="muted">
        所选{{ period === 'month' ? '月份' : '年度' }}{{ kind === 'expense' ? '支出' : '收入' }}
      </view>
      <view class="balance">¥ {{ money(total[kind]) }}</view>
      <view class="muted small">
        {{ period === 'month' ? '较上月' : '较上年' }}：{{ comparison }}
      </view>
      <view v-if="report.elapsedDays" class="comparison-range muted small">
        <view>本期 {{ report.startDate }} 至 {{ report.endDate }}</view>
        <view>对比 {{ report.previousStartDate }} 至 {{ report.previousEndDate }}</view>
      </view>
      <view class="divider" />
      <view class="metrics">
        <view>
          <text class="muted small">结余</text>
          <view class="metric-number">{{ money(report.balance) }}</view>
        </view>
        <view>
          <text class="muted small">记账天数</text>
          <view class="metric-number">{{ report.recordedDays }} 天</view>
        </view>
        <view>
          <text class="muted small">账单笔数</text>
          <view class="metric-number">{{ periodEntries.length }} 笔</view>
        </view>
      </view>
      <view class="divider" />
      <view class="metrics insight-metrics">
        <view>
          <text class="muted small">结余率</text>
          <view class="metric-number">{{ report.savingsRate === null ? '—' : report.savingsRate.toFixed(1) + '%' }}</view>
        </view>
        <view>
          <text class="muted small">日均支出</text>
          <view class="metric-number">{{ report.elapsedDays ? money(report.dailyExpense) : '—' }}</view>
        </view>
        <view>
          <text class="muted small">无支出记录</text>
          <view class="metric-number">{{ report.noExpenseDays }} 天</view>
        </view>
      </view>
    </view>
    <view class="section">{{ kind === 'expense' ? '消费' : '收入' }}趋势</view>
    <view class="card trend-card">
      <view class="row">
        <text class="muted small">
          {{ period === 'month' ? '每日金额' : '每月金额' }}
        </text>
        <text class="small">
          最高 ¥ {{ money(maxTrend === 1 && !trend.some((t) => t.cents) ? 0 : maxTrend) }}
        </text>
      </view>
      <view class="chart">
        <view v-for="(bar, i) in trend" :key="bar.date" class="bar-column" @tap="selectedBar = i">
          <view class="bar-space">
            <view
              class="bar"
              :class="{ chosen: selectedBar === i }"
              :style="{
                height: (bar.cents ? Math.max(3, (bar.cents / maxTrend) * 100) : 0) + '%',
              }"
            />
          </view>
          <text class="bar-label">
            {{ period === 'year' || i === 0 || (i + 1) % 5 === 0 ? bar.label : '' }}
          </text>
        </view>
      </view>
      <view v-if="selected" class="trend-detail">
        {{ selected.date }} · ¥ {{ money(selected.cents) }}
      </view>
    </view>
    <view class="section budget-section-heading">
      <text>预算使用</text>
      <text class="muted small">{{ period === 'year' ? '按月 · 支出' : '支出预算' }}</text>
    </view>
    <view v-if="!budgetMonths.length" class="card empty">
      {{ period === 'year' ? '该年尚未设置预算' : '该月尚未设置预算' }}
    </view>
    <view v-for="budgetMonth in budgetMonths" :key="budgetMonth.month" class="card budget-card">
      <view class="row budget-month-heading">
        <text class="budget-month">{{ budgetMonth.month }}</text>
        <text class="muted small">{{ budgetMonth.phase === 'future' ? '尚未开始' : budgetMonth.phase === 'current' ? '截至 ' + budgetMonth.endDate.slice(5) : '完整月份' }}</text>
      </view>
      <view
        v-for="item in budgetMonth.rows"
        :key="item.key"
        class="budget-usage"
        :class="{ 'budget-over': item.overage > 0 }"
        @tap="drillBudget(budgetMonth, item)"
      >
        <view class="row budget-usage-heading">
          <text class="budget-name">{{ item.name }}</text>
          <text class="budget-percent">{{ item.percent.toFixed(1) }}%</text>
        </view>
        <view class="budget-values">
          <text>预算 <text class="budget-number">¥ {{ money(item.limit) }}</text></text>
          <text>已用 <text class="budget-number">¥ {{ money(item.spent) }}</text></text>
        </view>
        <view class="budget-track">
          <view class="budget-fill" :style="{ width: item.fillPercent + '%' }" />
        </view>
        <view class="row budget-usage-footer">
          <text v-if="item.overage > 0" class="budget-remainder">超出 ¥ {{ money(item.overage) }}</text>
          <text v-else class="budget-remainder">剩余 ¥ {{ money(item.remaining) }}</text>
          <text v-if="budgetMonth.phase !== 'future'" class="budget-detail">支出明细 ›</text>
        </view>
      </view>
    </view>
  </view>
  </template>
</template>
<style scoped>
.compact-title {
  font-size: 40rpx;
}
.switches {
  margin-top: 20rpx;
}
.balance {
  font-size: 58rpx;
  font-weight: 600;
  margin: 18rpx 0;
}
.metrics {
  display: grid;
  grid-template-columns: 1.4fr 1fr 1fr;
  gap: 16rpx;
}
.metric-number {
  font-size: 28rpx;
  margin-top: 10rpx;
  word-break: break-all;
}
.comparison-range {
  padding-top: 16rpx;
}
.insight-metrics {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}
.chart {
  height: 240rpx;
  display: flex;
  gap: 4rpx;
  margin-top: 24rpx;
}
.bar-column {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  align-items: center;
}
.bar-space {
  height: 200rpx;
  width: 100%;
  display: flex;
  align-items: flex-end;
  background: #f2f6f5;
  border-radius: 6rpx;
}
.bar {
  width: 100%;
  background: #8ac9b8;
  border-radius: 6rpx 6rpx 0 0;
}
.bar.chosen {
  background: var(--xq-primary, #16846b);
}
.bar-label {
  height: 32rpx;
  margin-top: 8rpx;
  font-size: 18rpx;
  color: var(--xq-muted, #7c8b86);
}
.trend-detail {
  font-size: 23rpx;
  color: var(--xq-primary, #16846b);
  background: #edf7f3;
  border-radius: 16rpx;
  padding: 18rpx;
  margin-top: 20rpx;
}
.budget-section-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 16rpx; }
.budget-card { padding: 28rpx; }
.budget-month-heading { padding-bottom: 6rpx; }
.budget-month { font-size: 28rpx; font-weight: 600; }
.budget-usage { padding: 28rpx 0; border-bottom: 1rpx solid var(--xq-line, #e9eeeb); }
.budget-usage:last-child { padding-bottom: 4rpx; border-bottom: 0; }
.budget-usage-heading { align-items: flex-start; }
.budget-name { min-width: 0; overflow-wrap: anywhere; font-size: 27rpx; font-weight: 600; }
.budget-percent { flex-shrink: 0; color: var(--xq-primary, #16846b); font-size: 25rpx; font-weight: 600; font-variant-numeric: tabular-nums; }
.budget-values { display: grid; grid-template-columns: 1fr 1fr; gap: 16rpx; margin-top: 14rpx; font-size: 22rpx; color: var(--xq-muted, #7c8b86); }
.budget-values > text { min-width: 0; overflow-wrap: anywhere; }
.budget-values > text:last-child { text-align: right; }
.budget-number { color: var(--xq-ink, #203b35); font-variant-numeric: tabular-nums; }
.budget-track { height: 16rpx; margin: 18rpx 0 14rpx; overflow: hidden; border-radius: 20rpx; background: #eaf2ee; }
.budget-fill { height: 100%; border-radius: 20rpx; background: var(--xq-primary, #16846b); }
.budget-usage-footer { align-items: baseline; font-size: 22rpx; }
.budget-remainder { min-width: 0; overflow-wrap: anywhere; color: var(--xq-primary, #16846b); font-variant-numeric: tabular-nums; }
.budget-detail { flex-shrink: 0; color: var(--xq-muted, #7c8b86); }
.budget-over .budget-fill { background: #ca704f; }
.budget-over .budget-percent, .budget-over .budget-remainder { color: #b85d3b; }
</style>
