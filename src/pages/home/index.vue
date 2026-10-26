<script setup lang="ts">
import { computed } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { today, money, summarize, inMonth, budgetProgress } from '@/core/ledger'
import {
  state,
  entries,
  loadError,
  refresh,
  openEntry,
  navigate,
  repository,
  toastError,
} from '@/services/ledger'
import BillList from '@/components/BillList.vue'
const month = computed(() => today().slice(0, 7)),
  monthly = computed(() => inMonth(entries.value, month.value)),
  total = computed(() => summarize(monthly.value)),
  recent = computed(() => entries.value.slice(0, 5)),
  budget = computed(() => state.value.budgets[month.value])
const progress = computed(() => budgetProgress(budget.value?.total || 0, total.value.expense))
const days = computed(() => new Set(entries.value.map((e) => e.date)).size)
const categoryWarnings = computed(() =>
  Object.entries(budget.value?.categories || {})
    .map(([name, limit]) => ({
      name,
      over:
        monthly.value
          .filter((e) => e.kind === 'expense' && e.category === name)
          .reduce((s, e) => s + e.cents, 0) - limit,
    }))
    .filter((e) => e.over > 0),
)
function display(cents: number) {
  return state.value.hideAmounts ? '••••' : money(cents)
}
function hide() {
  try {
    repository.setHidden(!state.value.hideAmounts)
    refresh()
  } catch (e) {
    toastError(e)
  }
}
function all() {
  uni.switchTab({ url: '/pages/records/index' })
}
onShow(refresh)
</script>
<template>
  <view class="page">
    <view class="row">
      <text class="eyebrow">XIAOQING · DAILY LEDGER</text>
      <text class="badge">本机保存</text>
    </view>
    <view class="title">把日子，记清楚。</view>
    <view class="subtitle">已记录 {{ days }} 天，让每一笔都有意义。</view>
    <view v-if="loadError" class="error">{{ loadError }}</view>
    <view class="hero">
      <view class="row">
        <text>{{ month.replace('-', ' 年 ') }} 月支出</text>
        <button class="hide-button" @tap="hide">
          {{ state.hideAmounts ? '显示金额' : '隐藏金额' }}
        </button>
      </view>
      <view class="hero-amount">
        <text class="currency">¥</text>
        {{ display(total.expense) }}
      </view>
      <view class="hero-bottom">
        <view>
          <view class="hero-label">本月收入</view>
          <view class="hero-number">¥ {{ display(total.income) }}</view>
        </view>
        <view>
          <view class="hero-label">本月结余</view>
          <view class="hero-number">¥ {{ display(total.income - total.expense) }}</view>
        </view>
      </view>
    </view>
    <view class="card budget-card" @tap="navigate('budget')">
      <view class="row">
        <text>本月预算</text>
        <text class="small" :class="{ warning: progress.over }">
          {{
            budget?.total
              ? (progress.over ? '已超支 ¥ ' : '剩余 ¥ ') + display(Math.abs(progress.remaining))
              : '设置预算 ›'
          }}
        </text>
      </view>
      <view v-if="budget?.total" class="progress-track">
        <view
          class="progress-fill"
          :class="{ over: progress.over }"
          :style="{ width: progress.percent + '%' }"
        />
      </view>
      <view v-if="budget?.total" class="muted small budget-note">
        {{
          state.hideAmounts
            ? '预算详情已隐藏'
            : '总预算 ¥ ' +
              money(budget.total) +
              ' · 已用 ' +
              Math.round((total.expense / budget.total) * 100) +
              '%'
        }}
      </view>
      <view v-if="categoryWarnings.length" class="warning small budget-note">
        {{ categoryWarnings.map((e) => e.name).join('、') }}分类已超支
      </view>
    </view>
    <button class="primary add" @tap="openEntry()">＋ 记一笔</button>
    <view class="quick-links">
      <button @tap="navigate('budget')">预算计划</button>
      <button @tap="navigate('categories')">分类管理</button>
      <button @tap="navigate('backup')">备份恢复</button>
    </view>
    <view class="row section">
      <text>最近账单</text>
      <button class="text-btn" @tap="all">查看全部 ›</button>
    </view>
    <view class="card recent">
      <view v-if="!recent.length" class="empty">
        <view class="empty-symbol">＋</view>
        <view>账本还是空白的</view>
        <view class="small">从今天的第一笔收支开始吧</view>
      </view>
      <BillList :items="recent" :hidden="state.hideAmounts" />
    </view>
    <view class="footnote">认真记录，也好好生活。</view>
  </view>
</template>
<style scoped>
.hero {
  margin-top: 30rpx;
  padding: 34rpx;
  border-radius: 30rpx;
  color: #fff;
  background: linear-gradient(125deg, #245f48, #338568);
  box-shadow: 0 16rpx 36rpx #276c491a;
}
.hide-button {
  background: #ffffff15;
  color: #dfebce;
  font-size: 22rpx;
  line-height: 2;
  padding: 6rpx 16rpx;
  border-radius: 24rpx;
}
.hero-amount {
  font-size: 72rpx;
  font-weight: 600;
  margin: 24rpx 0 34rpx;
  overflow-wrap: anywhere;
}
.currency {
  font-size: 36rpx;
}
.hero-bottom {
  display: flex;
  gap: 50rpx;
  border-top: 1rpx solid #ffffff25;
  padding-top: 24rpx;
}
.hero-bottom > view {
  min-width: 0;
  flex: 1;
}
.hero-label {
  font-size: 23rpx;
  color: #c6dfcf;
}
.hero-number {
  font-size: 29rpx;
  margin-top: 12rpx;
  word-break: break-all;
}
.budget-card {
  padding: 26rpx 30rpx;
}
.budget-note {
  margin-top: 12rpx;
}
.add {
  margin-top: 24rpx;
  line-height: 80rpx;
}
.quick-links {
  display: flex;
  gap: 10rpx;
  margin-top: 16rpx;
}
.quick-links button {
  flex: 1;
  background: #edf2e9;
  color: #5c785f;
  font-size: 24rpx;
  padding: 0;
  border-radius: 18rpx;
}
.recent {
  margin-top: 0;
  padding-top: 8rpx;
  padding-bottom: 8rpx;
}
.empty-symbol {
  font-size: 62rpx;
  color: #719c72;
  margin-bottom: 12rpx;
}
.footnote {
  text-align: center;
  font-size: 22rpx;
  color: #9aa69b;
  margin-top: 40rpx;
}
</style>
