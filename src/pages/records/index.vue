<script setup lang="ts">
import { ref, computed } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { today, money, summarize, groupDays, calendar, categoryOptions } from '@/core/ledger'
import { entries, state, loadError, refresh, openEntry, recordFilter } from '@/services/ledger'
import BillList from '@/components/BillList.vue'
const month = ref(today().slice(0, 7)),
  kind = ref('all'),
  query = ref(''),
  category = ref(''),
  view = ref('list'),
  day = ref('')
const kindOptions = [
  { id: 'all', name: '全部' },
  { id: 'expense', name: '支出' },
  { id: 'income', name: '收入' },
]
const categoryList = computed(() => [
  '全部分类',
  ...Array.from(
    new Set([
      ...categoryOptions(state.value, 'expense'),
      ...categoryOptions(state.value, 'income'),
    ]),
  ),
])
const base = computed(() =>
  entries.value.filter(
    (e) =>
      e.date.startsWith(month.value + '-') &&
      (kind.value === 'all' || e.kind === kind.value) &&
      (!category.value || e.category === category.value) &&
      `${e.category} ${e.note}`.includes(query.value.trim()),
  ),
)
const filtered = computed(() =>
  base.value.filter((e) => view.value !== 'calendar' || !day.value || e.date === day.value),
)
const groups = computed(() => groupDays(filtered.value)),
  total = computed(() => summarize(filtered.value)),
  cells = computed(() => calendar(month.value, base.value))
function selectMonth(e: any) {
  month.value = e.detail.value
  day.value = ''
}
function selectCategory(e: any) {
  const i = Number(e.detail.value)
  category.value = i ? categoryList.value[i] : ''
}
function compact(cents: number) {
  return cents >= 100000 ? (cents / 100000).toFixed(1) + 'k' : money(cents)
}
onShow(() => {
  refresh()
  if (recordFilter.value) {
    month.value = recordFilter.value.month
    kind.value = recordFilter.value.kind
    category.value = recordFilter.value.category
    query.value = ''
    day.value = ''
    view.value = 'list'
    recordFilter.value = null
  }
})
</script>
<template>
  <view class="page">
    <view class="row">
      <view class="title compact-title">收支明细</view>
      <button class="text-btn" @tap="openEntry(undefined, day || undefined)">＋ 记一笔</button>
    </view>
    <view class="row">
      <picker mode="date" fields="month" :value="month" @change="selectMonth">
        <view class="badge">{{ month }} ▾</view>
      </picker>
      <view class="chips">
        <view class="chip" :class="{ active: view === 'list' }" @tap="view = 'list'">明细</view>
        <view class="chip" :class="{ active: view === 'calendar' }" @tap="view = 'calendar'">
          日历
        </view>
      </view>
    </view>
    <view v-if="loadError" class="error">{{ loadError }}</view>
    <input v-model="query" class="input search" placeholder="搜索分类或备注" maxlength="100" />
    <view class="row filters">
      <view class="chips">
        <view
          v-for="item in kindOptions"
          :key="item.id"
          class="chip"
          :class="{ active: kind === item.id }"
          @tap="kind = item.id"
        >
          {{ item.name }}
        </view>
      </view>
      <picker :range="categoryList" @change="selectCategory">
        <text class="filter-category">{{ category || '全部分类' }} ▾</text>
      </picker>
    </view>
    <view v-if="view === 'calendar'" class="card calendar">
      <view class="week">
        <text v-for="weekday in ['一', '二', '三', '四', '五', '六', '日']" :key="weekday">
          {{ weekday }}
        </text>
      </view>
      <view class="calendar-grid">
        <view
          v-for="(cell, i) in cells"
          :key="i"
          class="day"
          :class="{ selected: cell.date && cell.date === day, today: cell.date === today() }"
          @tap="cell.date && (day = day === cell.date ? '' : cell.date)"
        >
          <text>{{ cell.day || '' }}</text>
          <text v-if="cell.expense" class="day-expense">−{{ compact(cell.expense) }}</text>
          <text v-if="cell.income" class="day-income">+{{ compact(cell.income) }}</text>
        </view>
      </view>
      <view class="row calendar-footer">
        <text class="muted small">{{ day || '点击日期查看当天账单' }}</text>
        <button v-if="day" class="text-btn" @tap="openEntry(undefined, day)">补记当天</button>
      </view>
    </view>
    <view class="muted summary">
      {{ filtered.length }} 笔 · 收入 {{ money(total.income) }} · 支出 {{ money(total.expense) }}
    </view>
    <view v-if="!groups.length" class="card empty">
      没有符合条件的账单
      <view class="small">换个筛选条件，或记下新的一笔</view>
    </view>
    <view v-for="group in groups" :key="group.date" class="card day-group">
      <view class="row day-title">
        <text>{{ group.date === today() ? '今天' : group.date }}</text>
        <text class="small muted">
          支 {{ money(group.expense) }} · 收 {{ money(group.income) }}
        </text>
      </view>
      <BillList :items="group.entries" />
    </view>
  </view>
</template>
<style scoped>
.compact-title {
  font-size: 40rpx;
}
.search {
  margin: 24rpx 0;
  background: #fff;
  border: 1rpx solid #e5ece2;
}
.filters {
  flex-wrap: wrap;
}
.filter-category {
  font-size: 24rpx;
  color: #267858;
}
.summary {
  margin-top: 24rpx;
  font-size: 23rpx;
}
.day-title {
  border-bottom: 1rpx solid #edf1e9;
  padding-bottom: 20rpx;
  font-size: 25rpx;
}
.day-group {
  padding-bottom: 8rpx;
}
.week,
.calendar-grid {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  text-align: center;
}
.week {
  font-size: 22rpx;
  color: #8b988b;
  margin-bottom: 16rpx;
}
.day {
  height: 104rpx;
  display: flex;
  align-items: center;
  flex-direction: column;
  gap: 2rpx;
  border-radius: 14rpx;
  padding-top: 8rpx;
  font-size: 25rpx;
  overflow: hidden;
}
.day.today {
  color: #267858;
  font-weight: 600;
}
.day.selected {
  background: #e4efdc;
  box-shadow: inset 0 0 0 2rpx #80a77d;
}
.day-expense,
.day-income {
  font-size: 17rpx;
  max-width: 100%;
  white-space: nowrap;
}
.day-expense {
  color: #b77050;
}
.day-income {
  color: #267858;
}
.calendar {
  padding: 22rpx 16rpx;
}
.calendar-footer {
  padding: 20rpx 10rpx 0;
  border-top: 1rpx solid #edf1e9;
}
</style>
