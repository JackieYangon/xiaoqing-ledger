<script setup lang="ts">
import { useProtectedPage } from '@/services/auth'
const { authenticated, currentUserLabel } = useProtectedPage()
import { ref, computed } from 'vue'
import { onLoad, onShow } from '@dcloudio/uni-app'
import { categoryOptions, today, money, calculateMoney, type Kind } from '@/core/ledger'
import {
  repository,
  state,
  entries,
  refresh,
  toastError,
  navigate,
  storageLabel,
  saveMessage,
  syncBusy,
} from '@/services/ledger'
function newId() {
  return 'entry_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 14)
}
const createId = ref(newId())
const id = ref(''),
  version = ref(0),
  kind = ref<Kind>('expense'),
  amount = ref(''),
  category = ref('餐饮'),
  date = ref(today()),
  note = ref(''),
  busy = ref(false),
  invalid = ref(false)
const options = computed(() => categoryOptions(state.value, kind.value))
const suggestions = computed(() =>
  Array.from(
    new Set(
      entries.value
        .filter((e) => e.kind === kind.value && e.category === category.value && e.note)
        .map((e) => e.note),
    ),
  ).slice(0, 4),
)
const calculated = computed(() => {
  try {
    return money(calculateMoney(amount.value))
  } catch {
    return '—'
  }
})
onShow(refresh)
onLoad(async (args) => {
  busy.value = true
  if (!(await refresh())) {
    busy.value = false
    invalid.value = true
    return
  }
  if (args?.date) date.value = String(args.date)
  if (args?.id) {
    id.value = String(args.id)
    try {
      const e = repository.list().find((e) => e.id === id.value)
      if (!e) throw new Error('该账单已不存在')
      version.value = e.version
      kind.value = e.kind
      amount.value = money(e.cents)
      category.value = e.category
      date.value = e.date
      note.value = e.note
      uni.setNavigationBarTitle({ title: '编辑账单' })
    } catch (e) {
      invalid.value = true
      toastError(e)
    }
  }
  busy.value = false
})
function changeKind(value: Kind) {
  kind.value = value
  category.value = categoryOptions(state.value, value)[0]
}
function changeDate(e: any) {
  date.value = e.detail.value
}
function done() {
  uni.navigateBack({ fail: () => uni.switchTab({ url: '/pages/records/index' }) })
}
function key(value: string) {
  if (value === '⌫') {
    amount.value = amount.value.slice(0, -1)
    return
  }
  if (value === '=') {
    try {
      amount.value = money(calculateMoney(amount.value))
    } catch (e) {
      toastError(e)
    }
    return
  }
  if (amount.value.length < 80) amount.value += value
}
async function save(again = false) {
  if (busy.value || invalid.value || syncBusy.value) return
  busy.value = true
  try {
    await repository.save(
      {
        kind: kind.value,
        cents: calculateMoney(amount.value),
        category: category.value,
        date: date.value,
        note: note.value,
      },
      id.value || undefined,
      version.value,
      createId.value,
    )
    refresh()
    uni.showToast({ title: saveMessage.value, icon: 'success' })
    if (again) {
      createId.value = newId()
      amount.value = ''
      note.value = ''
      setTimeout(() => (busy.value = false), 400)
    } else done()
  } catch (e) {
    busy.value = false
    toastError(e)
  }
}
function copy() {
  createId.value = newId()
  id.value = ''
  version.value = 0
  date.value = today()
  uni.setNavigationBarTitle({ title: '再记一笔' })
}
function remove() {
  uni.showModal({
    title: '删除这笔账单？',
    content: '删除后无法恢复，请确认。',
    confirmText: '删除',
    confirmColor: '#b35e4f',
    success: async (result) => {
      if (result.confirm && !busy.value) {
        busy.value = true
        try {
          await repository.remove(id.value, version.value)
          refresh()
          done()
        } catch (e) {
          busy.value = false
          toastError(e)
        }
      }
    },
  })
}
</script>
<template>
  <template v-if="authenticated">
    <view class="muted small" style="padding: 24rpx 32rpx 0">记账人：{{ currentUserLabel }}</view>
  <view class="page entry-page">
    <view v-if="invalid" class="error">账单未能加载，请返回同步后重新打开。</view>
    <view class="row">
      <view class="title compact">{{ id ? '编辑这一笔' : '记下生活的一笔' }}</view>
      <button v-if="id" class="text-btn" @tap="copy">再记一笔</button>
    </view>
    <view class="chips">
      <view class="chip" :class="{ active: kind === 'expense' }" @tap="changeKind('expense')">
        支出
      </view>
      <view class="chip" :class="{ active: kind === 'income' }" @tap="changeKind('income')">
        收入
      </view>
    </view>
    <view class="card">
      <view class="row">
        <text class="label">选择分类</text>
        <button class="text-btn" @tap="navigate('categories')">管理 ›</button>
      </view>
      <scroll-view scroll-y class="category-scroll">
        <view class="category-grid">
          <view
            v-for="item in options"
            :key="item"
            class="category"
            :class="{ selected: category === item }"
            @tap="category = item"
          >
            <view class="category-icon">{{ item.slice(0, 1) }}</view>
            <text class="category-name">{{ item }}</text>
          </view>
        </view>
      </scroll-view>
      <view class="divider" />
      <view class="amount-row">
        <text>¥</text>
        <input v-model="amount" type="text" maxlength="80" placeholder="0.00" class="money-input" />
      </view>
      <view class="muted small">
        支持加减计算 · 结果 {{ calculated === '—' ? '待输入' : '¥ ' + calculated }}
      </view>
      <view class="details">
        <picker mode="date" :value="date" @change="changeDate">
          <view class="badge">{{ date === today() ? '今天' : date }} ▾</view>
        </picker>
        <input v-model="note" class="note-input" maxlength="100" placeholder="添加备注（选填）" />
      </view>
      <view v-if="suggestions.length" class="chips suggestions">
        <view v-for="text in suggestions" :key="text" class="chip" @tap="note = text">
          {{ text }}
        </view>
      </view>
    </view>
    <view class="keypad">
      <button
        v-for="item in ['1', '2', '3', '+', '4', '5', '6', '-', '7', '8', '9', '⌫', '.', '0', '=']"
        :key="item"
        class="key"
        :class="{ operator: ['+', '-', '⌫', '='].includes(item) }"
        @tap="key(item)"
      >
        {{ item }}
      </button>
      <button class="key clear" @tap="amount = ''">清空</button>
    </view>
    <view class="actions">
      <button
        v-if="!id"
        class="secondary"
        :disabled="busy || invalid || syncBusy"
        @tap="save(true)"
      >
        保存并再记
      </button>
      <button class="primary" :disabled="busy || invalid" :loading="busy" @tap="save(false)">
        {{ id ? '保存修改' : '保存这一笔' }}
      </button>
    </view>
    <button v-if="id" class="danger" :disabled="busy || invalid" @tap="remove">删除账单</button>
    <view class="hint muted">{{ storageLabel }}</view>
  </view>
  </template>
</template>
<style scoped>
.compact {
  font-size: 38rpx;
}
.entry-page {
  padding-top: 20rpx;
}
.category-scroll {
  max-height: 310rpx;
}
.category-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10rpx;
}
.category {
  display: flex;
  align-items: center;
  flex-direction: column;
  gap: 10rpx;
  font-size: 23rpx;
  padding: 12rpx 2rpx;
  border-radius: 18rpx;
}
.category-name {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.category-icon {
  width: 66rpx;
  height: 66rpx;
}
.selected {
  background: #e7f0df;
  color: #246342;
}
.selected .category-icon {
  background: #2e7957;
  color: white;
}
.amount-row {
  display: flex;
  align-items: center;
  gap: 16rpx;
  font-size: 44rpx;
}
.money-input {
  font-size: 52rpx;
  height: 90rpx;
  flex: 1;
  min-width: 0;
}
.details {
  display: flex;
  align-items: center;
  gap: 20rpx;
  margin-top: 24rpx;
}
.details .badge {
  white-space: nowrap;
}
.note-input {
  flex: 1;
  min-width: 0;
  font-size: 25rpx;
}
.suggestions {
  margin-top: 20rpx;
}
.suggestions .chip {
  font-size: 22rpx;
  max-width: 240rpx;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.keypad {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12rpx;
  margin-top: 24rpx;
}
.key {
  background: white;
  border-radius: 16rpx;
  font-size: 36rpx;
  line-height: 84rpx;
}
.operator {
  background: #e8f0e9;
  color: #267858;
}
.clear {
  font-size: 25rpx;
  color: #84918b;
}
.actions {
  display: flex;
  gap: 18rpx;
  margin-top: 24rpx;
}
.actions button {
  flex: 1;
  line-height: 76rpx;
}
.hint {
  text-align: center;
  font-size: 22rpx;
  margin-top: 24rpx;
}
</style>
