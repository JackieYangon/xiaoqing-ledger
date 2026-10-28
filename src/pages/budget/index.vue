<script setup lang="ts">
import { useProtectedPage } from '@/services/auth'
const { authenticated } = useProtectedPage()
import { ref, computed, watch } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import {
  today,
  money,
  parseMoney,
  inMonth,
  summarize,
  categoryOptions,
  budgetProgress,
  validMonth,
  type Budget,
} from '@/core/ledger'
import { budgetPace, previousMonthBudget, sumCategoryBudget } from '@/core/insights'
import {
  state,
  entries,
  repository,
  refresh,
  toastError,
  syncBusy,
  canManageBook,
  currentBookName,
  currentBookId,
  loadError,
} from '@/services/ledger'
const month = ref(today().slice(0, 7)),
  totalInput = ref(''),
  limits = ref<Record<string, string>>({}),
  busy = ref(false),
  draftNotice = ref(''),
  ready = ref(false),
  baseline = ref<Budget | null>(null)
const categories = computed(() =>
  Array.from(
    new Set([
      ...categoryOptions(state.value, 'expense'),
      ...Object.keys(state.value.budgets[month.value]?.categories || {}),
      ...Object.keys(limits.value),
    ]),
  ),
)
const spending = computed(() => summarize(inMonth(entries.value, month.value)).expense)
const saved = computed(() => state.value.budgets[month.value])
function cloneBudget(b?: Budget | null): Budget | null {
  return b ? { total: b.total, categories: { ...b.categories } } : null
}
function budgetKey(b?: Budget | null) {
  return b ? JSON.stringify([b.total, Object.entries(b.categories).sort(([a], [b]) => a.localeCompare(b))]) : 'null'
}
const changedElsewhere = computed(() => ready.value && budgetKey(saved.value) !== budgetKey(baseline.value))
const progress = computed(() => budgetProgress(saved.value?.total || 0, spending.value))
const pace = computed(() => budgetPace(entries.value, saved.value, month.value))
function fillDraft(b?: Budget | null) {
  const next: Record<string, string> = {}
  for (const name of new Set([...categoryOptions(state.value, 'expense'), ...Object.keys(b?.categories || {})]))
    next[name] = b?.categories[name] ? money(b.categories[name]) : ''
  totalInput.value = b?.total ? money(b.total) : ''
  limits.value = next
}
async function load() {
  const loadingMonth = month.value
  const loadingBook = currentBookId.value
  busy.value = true
  ready.value = false
  const ok = await refresh()
  if (loadingMonth !== month.value || loadingBook !== currentBookId.value) return
  busy.value = false
  if (!ok) return
  baseline.value = cloneBudget(state.value.budgets[month.value])
  fillDraft(state.value.budgets[month.value])
  draftNotice.value = ''
  ready.value = true
}
onLoad((args) => {
  if (args?.month && validMonth(String(args.month))) month.value = String(args.month)
  load()
})
function changeMonth(e: any) {
  if (busy.value || syncBusy.value) return
  month.value = e.detail.value
  fillDraft()
  draftNotice.value = ''
  load()
}
watch(currentBookId, () => {
  fillDraft()
  draftNotice.value = ''
  load()
})
function reusePrevious() {
  if (!canManageBook.value || !ready.value || busy.value || syncBusy.value) return
  try {
    const previous = previousMonthBudget(state.value, month.value)
    if (!previous) throw new Error('上月还没有预算，可先填写本月预算')
    const targetMonth = month.value
    const targetBook = currentBookId.value
    const apply = () => {
      if (month.value !== targetMonth || currentBookId.value !== targetBook || !canManageBook.value || busy.value || syncBusy.value) return
      fillDraft(previous)
      draftNotice.value = '已填入上月预算，保存后生效。'
    }
    if (totalInput.value.trim() || Object.values(limits.value).some((value) => value.trim())) {
      uni.showModal({
        title: '沿用上月预算',
        content: '将替换当前页面填写的总预算和分类限额，云端预算在点击保存前保持不变。',
        confirmText: '填入草稿',
        success: (result) => { if (result.confirm) apply() },
      })
    } else apply()
  } catch (e) {
    toastError(e)
  }
}
function fillCategoryTotal() {
  if (!canManageBook.value || !ready.value || busy.value || syncBusy.value) return
  try {
    const sum = sumCategoryBudget(limits.value)
    if (!sum) throw new Error('请先填写至少一个分类预算')
    totalInput.value = money(sum)
    draftNotice.value = '已将分类预算合计填入总预算，保存后生效。'
  } catch (e) {
    toastError(e)
  }
}
async function save() {
  if (!canManageBook.value || !ready.value || busy.value || syncBusy.value) return
  if (changedElsewhere.value) {
    toastError(new Error('预算已在其他设备或页面更新，请重新加载后再保存'))
    return
  }
  try {
    busy.value = true
    const b: Budget = {
      total: totalInput.value.trim() ? parseMoney(totalInput.value) : 0,
      categories: {},
    }
    for (const [name, limit] of Object.entries(limits.value))
      if (limit.trim()) b.categories[name] = parseMoney(limit)
    await repository.setBudget(month.value, b, cloneBudget(baseline.value))
    baseline.value = cloneBudget(b)
    draftNotice.value = ''
    uni.showToast({ title: '预算已保存', icon: 'success' })
  } catch (e) {
    toastError(e)
  } finally {
    busy.value = false
  }
}
function spent(name: string) {
  return inMonth(entries.value, month.value)
    .filter((e) => e.kind === 'expense' && e.category === name)
    .reduce((s, e) => s + e.cents, 0)
}
</script>
<template>
  <template v-if="authenticated">
    <view class="page">
      <view class="row">
        <view class="title compact-title">给开销一点计划</view>
        <picker mode="date" fields="month" :value="month" :disabled="busy || syncBusy" @change="changeMonth">
          <text class="badge">{{ month }} ▾</text>
        </picker>
      </view>
      <view class="subtitle">{{ currentBookName }} · 每个月单独设置，留白表示不设限。</view>
      <view v-if="loadError" class="error">
        {{ loadError }}
        <button class="text-btn" :disabled="busy || syncBusy" @tap="load">重新加载预算</button>
      </view>
      <view v-if="changedElsewhere" class="error">
        预算已在其他设备或页面更新，当前填写内容已保留。重新加载会用最新预算替换当前草稿，请核对后再保存。
        <button class="text-btn" :disabled="busy || syncBusy" @tap="load">重新加载最新预算</button>
      </view>
      <view v-if="!canManageBook" class="muted small">
        共享预算由群主管理，所有成员的群组支出共同消耗预算。
      </view>
      <view class="card">
        <view class="muted">{{ month }} 已支出</view>
        <view class="budget-amount">¥ {{ money(spending) }}</view>
        <view v-if="saved?.total" :class="progress.over ? 'warning' : 'income'">
          {{ progress.over ? '已超支' : '预算剩余' }} ¥ {{ money(Math.abs(progress.remaining)) }}
        </view>
        <view v-if="saved?.total" class="progress-track">
          <view
            class="progress-fill"
            :class="{ over: progress.over }"
            :style="{ width: progress.percent + '%' }"
          />
        </view>
        <view v-if="pace.hasBudget" class="pace">
          <view v-if="pace.phase === 'past'" class="muted small">该月份已结束，以上为已保存预算的最终余量。</view>
          <template v-else>
            <view class="row">
              <text class="muted small">{{ pace.phase === 'future' ? '计划每日可用' : '剩余每日可用' }}</text>
              <text class="income">¥ {{ money(pace.dailyAllowance || 0) }}</text>
            </view>
            <view class="muted small">
              {{ pace.phase === 'future' ? '按整月' : '含今天剩余' }} {{ pace.daysRemaining }} 天均分已保存预算的余量，已计入该月全部账单。
            </view>
          </template>
        </view>
        <view v-if="canManageBook" class="budget-tools">
          <button class="secondary" :disabled="!ready || busy || syncBusy" @tap="reusePrevious">沿用上月预算</button>
          <button class="secondary" :disabled="!ready || busy || syncBusy" @tap="fillCategoryTotal">分类合计填入总额</button>
        </view>
        <view v-if="draftNotice" class="muted small draft-notice">{{ draftNotice }}</view>
        <view class="field">
          <text class="label">月度总预算（元）</text>
          <input
            v-model="totalInput"
            class="input"
            type="digit"
            maxlength="11"
            :disabled="!canManageBook || !ready || busy || syncBusy"
            placeholder="例如 3000.00"
          />
        </view>
      </view>
      <view class="section">分类预算</view>
      <view class="muted small">分类限额独立提醒，不自动分摊总预算。</view>
      <view class="card">
        <view v-for="name in categories" :key="name" class="limit-row">
          <view>
            <view>{{ name }}</view>
            <view class="muted small">已花 {{ money(spent(name)) }}</view>
            <view
              v-if="saved?.categories[name] && spent(name) > saved.categories[name]"
              class="warning small"
            >
              超支 {{ money(spent(name) - saved.categories[name]) }}
            </view>
          </view>
          <input
            v-model="limits[name]"
            class="input limit-input"
            :disabled="!canManageBook || !ready || busy || syncBusy"
            type="digit"
            maxlength="11"
            placeholder="不设限"
          />
        </view>
      </view>
      <button
        class="primary save-budget"
        :loading="busy"
        :disabled="!canManageBook || !ready || busy || syncBusy || changedElsewhere"
        @tap="save"
      >
        保存预算
      </button>
    </view>
  </template>
</template>
<style scoped>
.compact-title {
  font-size: 34rpx;
}
.budget-amount {
  font-size: 58rpx;
  font-weight: 600;
  margin: 18rpx 0;
}
.pace {
  margin-top: 24rpx;
  padding: 20rpx;
  border-radius: 18rpx;
  background: #f0f5eb;
}
.budget-tools {
  display: flex;
  flex-wrap: wrap;
  gap: 14rpx;
  margin-top: 24rpx;
}
.budget-tools button {
  font-size: 24rpx;
  padding: 4rpx 20rpx;
}
.draft-notice {
  margin-top: 16rpx;
}
.limit-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20rpx;
  padding: 18rpx 0;
  border-bottom: 1rpx solid #edf1e9;
}
.limit-row:last-child {
  border: 0;
}
.limit-input {
  width: 240rpx;
  text-align: right;
}
.save-budget {
  margin-top: 28rpx;
  line-height: 80rpx;
}
</style>
