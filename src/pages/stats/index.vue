<script setup lang="ts">
import { ref, computed } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import {
  today,
  money,
  summarize,
  inMonth,
  categoryTotals,
  monthDays,
  shiftMonth,
  type Kind,
} from '@/core/ledger'
import { entries, loadError, refresh, recordFilter } from '@/services/ledger'
const month = ref(today().slice(0, 7)),
  kind = ref<Kind>('expense'),
  period = ref('month'),
  selectedBar = ref(-1)
const periodEntries = computed(() =>
  entries.value.filter((e) =>
    period.value === 'month'
      ? e.date.startsWith(month.value + '-')
      : e.date.startsWith(month.value.slice(0, 4) + '-'),
  ),
)
const total = computed(() => summarize(periodEntries.value)),
  groups = computed(() => categoryTotals(periodEntries.value, kind.value))
const previous = computed(() => {
  const prefix =
    period.value === 'month'
      ? shiftMonth(month.value, -1)
      : String(Number(month.value.slice(0, 4)) - 1)
  return summarize(entries.value.filter((e) => e.date.startsWith(prefix + '-')))[kind.value]
})
const comparison = computed(() =>
  previous.value
    ? `${total.value[kind.value] >= previous.value ? '增加' : '减少'} ${Math.abs(((total.value[kind.value] - previous.value) / previous.value) * 100).toFixed(1)}%`
    : '上期无记录，暂无对比',
)
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
const daysRecorded = computed(() => new Set(periodEntries.value.map((e) => e.date)).size)
function changePeriod(value: string) {
  period.value = value
  selectedBar.value = -1
}
function changeMonth(e: any) {
  month.value = e.detail.value
  selectedBar.value = -1
}
function drill(name: string) {
  if (period.value === 'year') {
    uni.showToast({ title: '切换到月度可查看分类明细', icon: 'none' })
    return
  }
  recordFilter.value = { month: month.value, kind: kind.value, category: name }
  uni.switchTab({ url: '/pages/records/index' })
}
onShow(refresh)
</script>
<template>
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
        {{ period === 'month' ? '本月' : '本年' }}{{ kind === 'expense' ? '支出' : '收入' }}
      </view>
      <view class="balance">¥ {{ money(total[kind]) }}</view>
      <view class="muted small">
        较{{ period === 'month' ? '上个完整月份' : '上个完整年度' }}：{{ comparison }}
      </view>
      <view class="divider" />
      <view class="metrics">
        <view>
          <text class="muted small">结余</text>
          <view class="metric-number">{{ money(total.income - total.expense) }}</view>
        </view>
        <view>
          <text class="muted small">记账天数</text>
          <view class="metric-number">{{ daysRecorded }} 天</view>
        </view>
        <view>
          <text class="muted small">账单笔数</text>
          <view class="metric-number">{{ periodEntries.length }} 笔</view>
        </view>
      </view>
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
          <text class="small">¥ {{ money(item.cents) }} {{ period === 'month' ? '›' : '' }}</text>
        </view>
        <view class="progress-track">
          <view class="progress-fill" :style="{ width: item.percent + '%' }" />
        </view>
      </view>
    </view>
    <view class="section">大额{{ kind === 'expense' ? '支出' : '收入' }} · TOP 5</view>
    <view class="card">
      <view v-if="!biggest.length" class="empty">暂无记录</view>
      <view v-for="entry in biggest" :key="entry.id" class="row top-entry">
        <view>
          <view>{{ entry.category }}</view>
          <view class="muted small">{{ entry.date }}</view>
        </view>
        <text class="amount">{{ money(entry.cents) }}</text>
      </view>
    </view>
  </view>
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
