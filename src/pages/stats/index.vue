<script setup lang="ts">
import { useNavigationIcons } from '@/services/navigation'
useNavigationIcons()
import { useProtectedPage } from '@/services/auth'
const { authenticated } = useProtectedPage()
import { ref, computed, watch } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import {
  today,
  money,
  summarize,
  categoryTotals,
  monthDays,
  type Kind,
} from '@/core/ledger'
import { periodReport } from '@/core/insights'
import { entries, loadError, refresh, recordFilter, currentBookId, openEntry } from '@/services/ledger'
const month = ref(today().slice(0, 7)),
  kind = ref<Kind>('expense'),
  period = ref<'month' | 'year'>('month'),
  selectedBar = ref(-1)
const report = computed(() => periodReport(entries.value, month.value, period.value))
const periodEntries = computed(() => report.value.currentEntries)
const total = computed(() => report.value.current),
  groups = computed(() => categoryTotals(periodEntries.value, kind.value))
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
const biggest = computed(() =>
  periodEntries.value
    .filter((e) => e.kind === kind.value)
    .sort((a, b) => b.cents - a.cents)
    .slice(0, 5),
)
function changePeriod(value: 'month' | 'year') {
  period.value = value
  selectedBar.value = -1
}
function changeMonth(e: any) {
  month.value = e.detail.value
  selectedBar.value = -1
}
function drill(name: string) {
  if (!report.value.elapsedDays) return
  recordFilter.value = {
    month: month.value,
    kind: kind.value,
    category: name,
    startDate: report.value.startDate,
    endDate: report.value.endDate,
  }
  uni.switchTab({ url: '/pages/records/index' })
}
watch(currentBookId, () => { selectedBar.value = -1 })
onShow(refresh)
</script>
<template>
  <template v-if="authenticated">
  <view class="page">
    <view class="eyebrow">A LITTLE MORE CLARITY</view>
    <view class="row">
      <view class="title compact-title">生活，心中有数</view>
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
        <view>当前周期按相同日期进度对比，已结束周期按完整周期对比。</view>
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
      <view class="muted small insight-note">结余率为结余占收入比例，无收入时不计算。日均和无支出记录天数仅统计截至今日已过日期；未记账不代表没有消费。</view>
    </view>
    <view class="section">{{ kind === 'expense' ? '消费' : '收入' }}趋势</view>
    <view class="card trend-card">
      <view class="row">
        <text class="muted small">
          {{ period === 'month' ? '每日金额' : '每月金额' }} · 点击柱形查看
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
      <view class="trend-detail">
        {{
          selected
            ? selected.date + ' · ¥ ' + money(selected.cents)
            : '点一点，看看每笔开销留下的轨迹'
        }}
      </view>
    </view>
    <view class="section">分类排行榜</view>
    <view class="card">
      <view v-if="!groups.length" class="empty">
        这个周期还没有{{ kind === 'expense' ? '支出' : '收入' }}记录
      </view>
      <view v-for="(item, i) in groups" :key="item.name" class="group" @tap="drill(item.name)">
        <view class="row">
          <text>
            <text class="rank">{{ i + 1 }}</text>
            {{ item.name }}
            <text class="muted small">{{ item.percent }}%</text>
          </text>
          <text class="small">¥ {{ money(item.cents) }} ›</text>
        </view>
        <view class="progress-track">
          <view class="progress-fill" :style="{ width: item.percent + '%' }" />
        </view>
      </view>
    </view>
    <view class="section">大额{{ kind === 'expense' ? '支出' : '收入' }} · TOP 5</view>
    <view class="card">
      <view v-if="!biggest.length" class="empty">暂无记录</view>
      <view v-for="entry in biggest" :key="entry.id" class="row top-entry" @tap="openEntry(entry.id)">
        <view>
          <view>{{ entry.category }}</view>
          <view class="muted small">{{ entry.date }}</view>
        </view>
        <text class="amount">{{ money(entry.cents) }}</text>
      </view>
    </view>
  </view>
  </template>
</template>
<style scoped>
.compact-title {
  font-size: 36rpx;
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
.insight-note {
  margin-top: 24rpx;
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
  background: #f8faf5;
  border-radius: 6rpx;
}
.bar {
  width: 100%;
  background: #9fbe89;
  border-radius: 6rpx 6rpx 0 0;
}
.bar.chosen {
  background: #267858;
}
.bar-label {
  height: 32rpx;
  margin-top: 8rpx;
  font-size: 18rpx;
  color: #879887;
}
.trend-detail {
  font-size: 23rpx;
  color: #52715b;
  background: #f0f5eb;
  border-radius: 16rpx;
  padding: 18rpx;
  margin-top: 20rpx;
}
.group {
  margin: 12rpx 0 30rpx;
}
.group:last-child {
  margin-bottom: 0;
}
.rank {
  display: inline-block;
  width: 38rpx;
  color: #95a487;
  font-size: 24rpx;
}
.top-entry {
  padding: 22rpx 0;
  border-bottom: 1rpx solid #edf1e9;
}
.top-entry:last-child {
  border: 0;
}
</style>
