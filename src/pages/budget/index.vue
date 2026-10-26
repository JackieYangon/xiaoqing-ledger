<script setup lang="ts">
import { ref, computed } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import {
  today,
  money,
  parseMoney,
  inMonth,
  summarize,
  categoryOptions,
  budgetProgress,
  type Budget,
} from '@/core/ledger'
import { state, entries, repository, refresh, toastError, syncBusy } from '@/services/ledger'
const month = ref(today().slice(0, 7)),
  totalInput = ref(''),
  limits = ref<Record<string, string>>({}),
  busy = ref(false)
const categories = computed(() => categoryOptions(state.value, 'expense'))
const spending = computed(() => summarize(inMonth(entries.value, month.value)).expense)
const saved = computed(() => state.value.budgets[month.value])
const progress = computed(() => budgetProgress(saved.value?.total || 0, spending.value))
async function load() {
  busy.value = true
  const ok = await refresh()
  busy.value = false
  if (!ok) return
  const b = state.value.budgets[month.value]
  totalInput.value = b?.total ? money(b.total) : ''
  limits.value = {}
  for (const name of categories.value)
    limits.value[name] = b?.categories[name] ? money(b.categories[name]) : ''
}
onLoad((args) => {
  if (args?.month) month.value = String(args.month)
  load()
})
function changeMonth(e: any) {
  month.value = e.detail.value
  load()
}
async function save() {
  if (busy.value || syncBusy.value) return
  try {
    busy.value = true
    const b: Budget = {
      total: totalInput.value.trim() ? parseMoney(totalInput.value) : 0,
      categories: {},
    }
    for (const [name, limit] of Object.entries(limits.value))
      if (limit.trim()) b.categories[name] = parseMoney(limit)
    await repository.setBudget(month.value, b)
    refresh()
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
  <view class="page">
    <view class="row">
      <view class="title compact-title">给开销一点计划</view>
      <picker mode="date" fields="month" :value="month" @change="changeMonth">
        <text class="badge">{{ month }} ▾</text>
      </picker>
    </view>
    <view class="subtitle">每个月单独设置，留白表示不设限。</view>
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
      <view class="field">
        <text class="label">月度总预算（元）</text>
        <input
          v-model="totalInput"
          class="input"
          type="digit"
          maxlength="11"
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
          type="digit"
          maxlength="11"
          placeholder="不设限"
        />
      </view>
    </view>
    <button class="primary save-budget" :loading="busy" :disabled="busy || syncBusy" @tap="save">
      保存预算
    </button>
  </view>
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
