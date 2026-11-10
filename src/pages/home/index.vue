<script setup lang="ts">
import SessionNotice from '@/components/SessionNotice.vue'
import { useNavigationIcons } from '@/services/navigation'
useNavigationIcons()
import { browseReady, authenticated } from '@/services/auth'
import GuestNotice from '@/components/GuestNotice.vue'
import { computed } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { today, money, summarize, inMonth, budgetProgress } from '@/core/ledger'
import {
  state,
  currentBookName,
  entries,
  loadError,
  refresh,
  openEntry,
  navigate,
  repository,
  toastError,
  storageLabel,
  syncBusy,
} from '@/services/ledger'
import BillList from '@/components/BillList.vue'
const month = computed(() => today().slice(0, 7)),
  monthly = computed(() => inMonth(entries.value, month.value)),
  total = computed(() => summarize(monthly.value)),
  recent = computed(() => entries.value.slice(0, 5)),
  budget = computed(() => state.value.budgets[month.value])
const progress = computed(() => budgetProgress(budget.value?.total || 0, total.value.expense))
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
async function hide() {
  if (syncBusy.value) return
  try {
    await repository.setHidden(!state.value.hideAmounts)
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
  <SessionNotice />
  <template v-if="browseReady">
    <view class="page home-page">
      <GuestNotice />
      <view class="page-header">
        <view class="title">小青账本</view>
        <view class="book-switch" @tap="authenticated && navigate('groups')">
          <text class="book-name">{{ currentBookName }}</text>
          <text v-if="authenticated" class="book-arrow">⌄</text>
        </view>
      </view>
      <view v-if="loadError" class="error">{{ loadError }}</view>
      <view class="hero">
        <view class="row hero-top">
          <text class="month-label">{{ month.replace('-', ' 年 ') }} 月</text>
          <button class="hide-button" @tap="hide">
            {{ state.hideAmounts ? '显示' : '隐藏' }}
          </button>
        </view>
        <view class="hero-label expense-label">本月支出</view>
        <view class="hero-amount">
          <text class="currency">¥</text>
          <text>{{ display(total.expense) }}</text>
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
      <button class="primary add" @tap="openEntry()"><text class="add-symbol">＋</text>记一笔</button>
      <view class="card budget-card" @tap="navigate('budget')">
        <view class="row">
          <text class="budget-title">本月预算</text>
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
              ? '¥ ••••'
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
      <view class="quick-links">
        <button @tap="navigate('budget')"><text class="shortcut-icon mint">¥</text><text>预算</text></button>
        <button @tap="navigate('categories')"><text class="shortcut-icon blue">分</text><text>分类</text></button>
        <button @tap="navigate('backup')"><text class="shortcut-icon sand">备</text><text>备份</text></button>
      </view>
      <view class="row section">
        <text>最近账单</text>
        <button class="text-btn" @tap="all">查看全部 ›</button>
      </view>
      <view class="card recent">
        <view v-if="!recent.length" class="empty">
          <view>暂无账单</view>
        </view>
        <BillList :items="recent" :hidden="state.hideAmounts" />
      </view>
      <view v-if="authenticated" class="sync-status" @tap="navigate('sync')"><text class="status-dot" />{{ storageLabel }} ›</view>
    </view>
  </template>
</template>
<style scoped>
.book-switch { display: flex; align-items: center; gap: 12rpx; max-width: 52%; padding: 12rpx 18rpx; border-radius: 18rpx; background: #fff; color: #58736a; font-size: 24rpx; }
.book-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.book-arrow { color: #16846b; }
.hero { padding: 32rpx 34rpx; border-radius: 36rpx; color: #fff; background: linear-gradient(120deg, #174f42 0%, #207a60 100%); box-shadow: 0 16rpx 32rpx #1c66532a; }
.month-label { font-size: 24rpx; font-weight: 500; color: #d4e9e0; }
.hide-button { padding: 2rpx 18rpx; border: 1rpx solid #ffffff28; border-radius: 30rpx; background: #ffffff0d; color: #e1efe8; font-size: 21rpx; line-height: 2; }
.expense-label { margin-top: 28rpx; }
.hero-amount { display: flex; align-items: baseline; gap: 12rpx; margin: 4rpx 0 32rpx; font-size: 76rpx; font-weight: 650; letter-spacing: -2rpx; line-height: 1.3; font-variant-numeric: tabular-nums; }
.hero-amount > text:last-child { min-width: 0; overflow-wrap: anywhere; }
.currency { font-size: 36rpx; font-weight: 400; letter-spacing: 0; }
.hero-bottom { display: flex; gap: 32rpx; padding-top: 24rpx; border-top: 1rpx solid #ffffff22; }
.hero-bottom > view { flex: 1; min-width: 0; }
.hero-bottom > view + view { padding-left: 30rpx; border-left: 1rpx solid #ffffff22; }
.hero-label { font-size: 23rpx; color: #bbd9ca; }
.hero-number { margin-top: 8rpx; font-size: 31rpx; font-weight: 550; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.add { display: flex; align-items: center; justify-content: center; gap: 14rpx; margin-top: 22rpx; padding: 0; line-height: 92rpx; box-shadow: 0 8rpx 20rpx #16846b1a; }
.add-symbol { font-size: 38rpx; font-weight: 400; }
.budget-card { padding: 26rpx 28rpx; }
.budget-title { font-size: 27rpx; font-weight: 600; }
.budget-note { margin-top: 12rpx; }
.quick-links { display: flex; gap: 18rpx; margin-top: 22rpx; }
.quick-links button { display: flex; flex: 1; flex-direction: column; align-items: center; gap: 12rpx; min-width: 0; padding: 22rpx 8rpx; border-radius: 26rpx; background: #fff; color: #526b61; font-size: 24rpx; line-height: 1.5; }
.shortcut-icon { display: flex; align-items: center; justify-content: center; width: 64rpx; height: 64rpx; border-radius: 20rpx; font-size: 29rpx; font-weight: 600; }
.mint { background: #e6f4ec; color: #218264; }
.blue { background: #ecf1fb; color: #6487b2; }
.sand { background: #fcf1df; color: #b28a4d; }
.recent { margin-top: 0; padding-top: 8rpx; padding-bottom: 8rpx; }
.sync-status { display: flex; align-items: center; justify-content: center; gap: 10rpx; margin-top: 28rpx; color: #83958c; font-size: 22rpx; }
.status-dot { width: 8rpx; height: 8rpx; border-radius: 50%; background: #7bae94; }
</style>
