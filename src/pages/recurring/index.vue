<script setup lang="ts">
import { ref, computed } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { useProtectedPage, currentUser } from '@/services/auth'
import {
  currentBookName,
  rules,
  state,
  repository,
  refresh,
  toastError,
  canManageBook,
  checkRecurring,
  refreshWorkspace,
  schedulerStatus,
} from '@/services/ledger'
import { categoryOptions, parseMoney, money, today } from '@/core/ledger'
const { authenticated } = useProtectedPage()
const name = ref(''),
  amount = ref(''),
  note = ref(''),
  frequency = ref('monthly'),
  day = ref(1),
  category = ref('居家'),
  busy = ref(false)
const categories = computed(() => categoryOptions(state.value, 'expense'))
const selectedDate = ref(today().slice(0, 7) + '-01')
const weekdays = ['星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日']
function changeDate(e: any) {
  selectedDate.value = e.detail.value
  day.value = Number(selectedDate.value.slice(-2))
}
onShow(async () => {
  if (!authenticated.value) return
  try {
    await refreshWorkspace()
    await refresh()
  } catch (e) {
    toastError(e)
  }
})
function changeFrequency(e: any) {
  frequency.value = Number(e.detail.value) === 0 ? 'monthly' : 'weekly'
  day.value = frequency.value === 'monthly' ? Number(selectedDate.value.slice(-2)) : 1
}
async function save() {
  if (busy.value) return
  busy.value = true
  try {
    await repository.createRule({
      name: name.value,
      cents: parseMoney(amount.value),
      frequency: frequency.value,
      day: day.value,
      category: category.value,
      note: note.value,
    })
    name.value = ''
    amount.value = ''
    note.value = ''
    uni.showToast({ title: '定期项目已创建', icon: 'none' })
  } catch (e) {
    toastError(e)
  } finally {
    busy.value = false
  }
}
async function toggle(rule: any) {
  if (busy.value) return
  busy.value = true
  try {
    await repository.toggleRule(rule.id, !rule.active)
  } catch (e) {
    toastError(e)
  } finally {
    busy.value = false
  }
}
async function checkNow() {
  if (busy.value) return
  busy.value = true
  try {
    const r = await checkRecurring()
    uni.showToast({ title: '本次补记 ' + r.created + ' 笔', icon: 'none' })
  } catch (e) {
    toastError(e)
  } finally {
    busy.value = false
  }
}
function record(rule: any) {
  uni.navigateTo({ url: '/pages/entry/index?ruleId=' + rule.id })
}
</script>
<template>
  <view v-if="authenticated" class="page">
    <view class="title">定期记账</view>
    <view class="badge">{{ currentBookName }}</view>
    <view class="muted small notice">
      {{
        schedulerStatus
          ? '后台最近检查：' +
            new Date(schedulerStatus.lastRun).toLocaleString() +
            (schedulerStatus.healthy ? '' : ' · 部分项目失败，请检查')
          : '尚未检测到后台定时执行，请确认触发器已上传；可先点击下方手动校验。'
      }}
    </view>
    <button class="secondary book" :disabled="busy" @tap="checkNow">立即校验到期项目</button>
    <view class="card">
      <view class="muted">
        到期自动记一笔，不会实际扣款。手动记账时关联项目，该周期只保留一笔；自动生成后手动记同一项目，会更新原记录。
      </view>
      <view class="muted small notice">
        按北京时间执行。每月 29–31
        日遇短月份取月底；暂停再开启不补记暂停期间。删除关联账单后，该周期不会再自动生成。
      </view>
    </view>
    <view v-for="rule in rules" :key="rule.id" class="card">
      <view class="row">
        <text class="section heading">{{ rule.name }}</text>
        <text class="badge">{{ rule.active ? '已启用' : '已暂停' }}</text>
      </view>
      <view>¥ {{ money(rule.cents) }} · {{ rule.category }}</view>
      <view class="muted">
        {{
          rule.frequency === 'monthly'
            ? '每月 ' + rule.day + ' 日'
            : '每周' + ['一', '二', '三', '四', '五', '六', '日'][rule.day - 1]
        }}
        · 下次 {{ rule.nextDate }}
      </view>
      <button v-if="rule.active" class="secondary book" @tap="record(rule)">手动记本期</button>
      <button
        v-if="rule.creator === currentUser?.accountId || canManageBook"
        class="text-btn book"
        :disabled="busy"
        @tap="toggle(rule)"
      >
        {{ rule.active ? '暂停自动记账' : '恢复自动记账' }}
      </button>
    </view>
    <view class="card">
      <view class="section heading">新增定期项目</view>
      <input
        v-model="name"
        class="input book"
        maxlength="24"
        placeholder="名称，例如：房租、会员订阅"
      />
      <input v-model="amount" type="digit" class="input book" placeholder="每期金额（元）" />
      <picker :range="['每月', '每周']" @change="changeFrequency">
        <view class="input book">周期：{{ frequency === 'monthly' ? '每月' : '每周' }} ▾</view>
      </picker>
      <picker v-if="frequency === 'monthly'" mode="date" :value="selectedDate" @change="changeDate">
        <view class="input book">记账日期：每月 {{ day }} 日 ▾</view>
      </picker>
      <picker
        v-else
        :range="weekdays"
        :value="day - 1"
        @change="day = Number($event.detail.value) + 1"
      >
        <view class="input book">记账日期：每周{{ weekdays[day - 1].slice(2) }} ▾</view>
      </picker>
      <view v-if="frequency === 'monthly'" class="muted small notice">
        点击选择日期，按所选日期的“几号”每月重复，年月不作为开始日期；短月份自动取月底。
      </view>
      <picker :range="categories" @change="category = categories[Number($event.detail.value)]">
        <view class="input book">分类：{{ category }} ▾</view>
      </picker>
      <input v-model="note" class="input book" maxlength="100" placeholder="备注（选填）" />
      <button class="primary book" :loading="busy" :disabled="busy" @tap="save">
        创建定期项目
      </button>
    </view>
  </view>
</template>
<style scoped>
.heading {
  margin: 0 0 16rpx;
}
.book,
.notice {
  margin-top: 20rpx;
}
</style>
