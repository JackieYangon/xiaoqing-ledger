<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { money } from '@/core/ledger'
import type { monthlyCashflow } from '@/core/insights'
const props = defineProps<{ months: ReturnType<typeof monthlyCashflow> }>()
const selectedMonth = ref('')
watch(() => props.months, () => { selectedMonth.value = '' })
const selected = computed(() => props.months.find(item => item.month === selectedMonth.value))
const width = 520, height = 280
const scale = computed(() => {
  const values = props.months.filter(item => item.hasData).flatMap(item => [item.income, item.expense, item.balance])
  return { max: Math.max(100, ...values), min: Math.min(0, ...values) }
})
const y = (value: number) => (scale.value.max - value) / (scale.value.max - scale.value.min) * height
const zero = computed(() => y(0))
const points = computed(() => props.months.map((item, index) => ({
  ...item, x: (index + .5) * width / props.months.length,
  incomeY: y(item.income), expenseY: y(item.expense), balanceY: y(item.balance),
})))
const lines = computed(() => {
  const result: Array<{ key: string; kind: string; style: Record<string, string> }> = []
  for (let i = 1; i < points.value.length; i++) {
    const previous = points.value[i - 1], current = points.value[i]
    if (!previous.hasData || !current.hasData) continue
    for (const kind of ['income', 'expense'] as const) {
      const dx = current.x - previous.x, dy = current[`${kind}Y`] - previous[`${kind}Y`]
      result.push({ key: `${current.month}-${kind}`, kind, style: {
        left: previous.x + 'rpx', top: previous[`${kind}Y`] + 'rpx',
        width: Math.hypot(dx, dy) + 'rpx', transform: `rotate(${Math.atan2(dy, dx)}rad)`,
      } })
    }
  }
  return result
})
</script>
<template>
  <view class="card cashflow-card">
    <view class="row cashflow-legend">
      <text class="muted small">元</text>
      <view class="legend-items"><text class="legend income-key">收入</text><text class="legend expense-key">支出</text><text class="legend balance-key">结余</text></view>
    </view>
    <view v-if="!months.length" class="empty">暂无已开始月份</view>
    <view v-else class="cashflow-chart">
      <view class="axis"><text class="axis-top">{{ money(scale.max) }}</text><text v-if="scale.min < 0" class="axis-bottom">{{ money(scale.min) }}</text><text :style="{ top: zero + 'rpx' }">0</text></view>
      <view class="plot">
        <view class="grid-line top-grid" />
        <view class="grid-line zero-grid" :style="{ top: zero + 'rpx' }" />
        <view v-if="scale.min < 0" class="grid-line bottom-grid" />
        <template v-for="point in points" :key="point.month">
          <view v-if="point.hasData && point.balance !== 0" class="balance-bar" :class="{ negative: point.balance < 0 }" :style="{ left: point.x + 'rpx', top: Math.min(zero, point.balanceY) + 'rpx', height: Math.abs(point.balanceY - zero) + 'rpx' }" />
        </template>
        <view v-for="line in lines" :key="line.key" class="cashflow-line" :class="line.kind" :style="line.style" />
        <template v-for="point in points" :key="point.month">
          <template v-if="point.hasData">
            <view class="dot income-dot" :style="{ left: point.x + 'rpx', top: point.incomeY + 'rpx' }" />
            <view class="dot expense-dot" :style="{ left: point.x + 'rpx', top: point.expenseY + 'rpx' }" />
          </template>
          <view class="month-hit" :style="{ left: (point.x - width / months.length / 2) + 'rpx', width: width / months.length + 'rpx' }" @tap="selectedMonth = point.month">
            <text class="month-label" :class="{ chosen: selectedMonth === point.month }">{{ point.label }}月</text>
          </view>
        </template>
      </view>
    </view>
    <view v-if="selected" class="cashflow-detail">
      <view class="small muted">{{ selected.month }}</view>
      <view v-if="selected.hasData" class="detail-values"><text>收入 {{ money(selected.income) }}</text><text>支出 {{ money(selected.expense) }}</text><text>结余 {{ money(selected.balance) }}</text></view>
      <text v-else class="small muted">暂无账单</text>
    </view>
  </view>
</template>
<style scoped>
.cashflow-card { padding: 28rpx 20rpx; }
.cashflow-legend { padding: 0 8rpx; }
.legend-items { display: flex; gap: 22rpx; font-size: 22rpx; }
.legend::before { content: ''; display: inline-block; width: 18rpx; height: 6rpx; margin-right: 8rpx; vertical-align: middle; border-radius: 3rpx; }
.income-key::before, .income-dot, .cashflow-line.income { background: #16846b; }
.expense-key::before, .expense-dot, .cashflow-line.expense { background: #df9062; }
.balance-key::before { background: #a2bddf; height: 16rpx; }
.cashflow-chart { display: flex; justify-content: center; padding-top: 34rpx; padding-bottom: 46rpx; }
.axis { position: relative; width: 86rpx; height: 280rpx; flex-shrink: 0; font-size: 16rpx; color: #89958e; }
.axis text { position: absolute; right: 12rpx; transform: translateY(-50%); max-width: 80rpx; overflow-wrap: anywhere; text-align: right; }
.axis-top { top: 0; }.axis-bottom { top: 280rpx; }
.plot { position: relative; width: 520rpx; height: 280rpx; flex-shrink: 0; }
.grid-line { position: absolute; left: 0; right: 0; height: 1rpx; background: #edf1f0; }
.top-grid { top: 0; }.bottom-grid { top: 280rpx; }.zero-grid { background: #c7d4cf; }
.balance-bar { position: absolute; width: 20rpx; margin-left: -10rpx; background: #a2bddf; border-radius: 5rpx; }
.balance-bar.negative { background: #ddafb4; }
.cashflow-line { position: absolute; height: 3rpx; transform-origin: 0 50%; }
.dot { position: absolute; width: 9rpx; height: 9rpx; margin: -4.5rpx; border-radius: 50%; }
.month-hit { position: absolute; top: 0; height: 320rpx; }
.month-label { display: block; position: absolute; top: 294rpx; width: 100%; text-align: center; font-size: 17rpx; color: #7a8b85; white-space: nowrap; }
.month-label.chosen { color: #16846b; font-weight: 700; }
.cashflow-detail { padding: 18rpx; border-radius: 16rpx; background: #f4f8f6; }
.detail-values { display: flex; flex-wrap: wrap; gap: 10rpx 22rpx; margin-top: 8rpx; font-size: 22rpx; }
</style>
