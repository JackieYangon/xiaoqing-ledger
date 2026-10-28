<script setup lang="ts">
import SessionNotice from '@/components/SessionNotice.vue'
import { useNavigationIcons } from '@/services/navigation'
useNavigationIcons()
import { browseReady } from '@/services/auth'
import GuestNotice from '@/components/GuestNotice.vue'
import { ref, computed, watch } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { today, money, summarize, groupDays, calendar, categoryOptions, monthDays, toCsv, type Kind } from '@/core/ledger'
import { filterEntries, type EntrySort } from '@/core/insights'
import { entries, state, loadError, refresh, openEntry, recordFilter, currentBookId, copyText } from '@/services/ledger'
import BillList from '@/components/BillList.vue'
const month = ref(today().slice(0, 7)),
  kind = ref<Kind | 'all'>('all'),
  query = ref(''),
  category = ref(''),
  view = ref('list'),
  day = ref(''),
  rangeMode = ref<'month' | 'range' | 'all'>('month'),
  startDate = ref(''),
  endDate = ref(''),
  minAmount = ref(''),
  maxAmount = ref(''),
  sort = ref<EntrySort>('date-desc'),
  showAdvanced = ref(false)
const kindOptions: Array<{ id: Kind | 'all'; name: string }> = [
  { id: 'all', name: '全部' },
  { id: 'expense', name: '支出' },
  { id: 'income', name: '收入' },
]
const rangeOptions = ['按月', '日期范围', '全部日期']
const rangeValues = ['month', 'range', 'all'] as const
const sortOptions = ['日期从新到旧', '日期从旧到新', '金额从高到低', '金额从低到高']
const sortValues: EntrySort[] = ['date-desc', 'date-asc', 'amount-desc', 'amount-asc']
const categoryList = computed(() => [
  '全部分类',
  ...Array.from(
    new Set([
      ...categoryOptions(state.value, 'expense'),
      ...categoryOptions(state.value, 'income'),
      ...entries.value.map((e) => e.category),
    ]),
  ),
])
const result = computed(() => {
  try {
    if (rangeMode.value === 'range' && (!startDate.value || !endDate.value))
      throw new Error('请选择开始和结束日期')
    return {
      items: filterEntries(entries.value, {
        startDate: rangeMode.value === 'month' ? month.value + '-01' : rangeMode.value === 'range' ? startDate.value : '',
        endDate: rangeMode.value === 'month' ? `${month.value}-${monthDays(month.value)}` : rangeMode.value === 'range' ? endDate.value : '',
        kind: kind.value,
        category: category.value,
        query: query.value,
        minAmount: minAmount.value,
        maxAmount: maxAmount.value,
        sort: sort.value,
      }),
      error: '',
    }
  } catch (e) {
    return { items: [], error: e instanceof Error ? e.message : '请检查筛选条件' }
  }
})
const base = computed(() => result.value.items)
const filtered = computed(() =>
  base.value.filter((e) => view.value !== 'calendar' || !day.value || e.date === day.value),
)
const groups = computed(() => {
    const items = groupDays(filtered.value)
    return sort.value === 'date-asc' ? items.reverse() : items
  }),
  total = computed(() => summarize(filtered.value)),
  cells = computed(() => calendar(month.value, base.value)),
  amountSorted = computed(() => sort.value.startsWith('amount-')),
  rangeLabel = computed(() => rangeMode.value === 'month' ? month.value : rangeMode.value === 'all' ? '全部日期' : `${startDate.value || '开始日期'} 至 ${endDate.value || '结束日期'}`)
function selectMonth(e: any) {
  month.value = e.detail.value
  day.value = ''
}
function changeRange(e: any) {
  rangeMode.value = rangeValues[Number(e.detail.value)]
  day.value = ''
  if (rangeMode.value !== 'month') view.value = 'list'
  if (rangeMode.value === 'range' && !startDate.value && !endDate.value) {
    startDate.value = month.value + '-01'
    endDate.value = `${month.value}-${monthDays(month.value)}`
  }
}
function changeView(value: string) {
  view.value = value
  day.value = ''
  if (value === 'calendar' && rangeMode.value !== 'month') {
    rangeMode.value = 'month'
    uni.showToast({ title: '日历已切换为按月查看', icon: 'none' })
  }
}
function resetFilters() {
  rangeMode.value = 'month'
  startDate.value = ''
  endDate.value = ''
  minAmount.value = ''
  maxAmount.value = ''
  kind.value = 'all'
  category.value = ''
  query.value = ''
  sort.value = 'date-desc'
  day.value = ''
  view.value = 'list'
}
function exportFiltered() {
  if (!result.value.error && filtered.value.length) copyText(toCsv(filtered.value))
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
    resetFilters()
    month.value = recordFilter.value.month
    kind.value = recordFilter.value.kind
    category.value = recordFilter.value.category
    if (recordFilter.value.startDate && recordFilter.value.endDate) {
      rangeMode.value = 'range'
      startDate.value = recordFilter.value.startDate
      endDate.value = recordFilter.value.endDate
      showAdvanced.value = true
    }
    recordFilter.value = null
  }
})
watch(currentBookId, () => {
  resetFilters()
  month.value = today().slice(0, 7)
})
</script>
<template>
  <SessionNotice />
  <template v-if="browseReady">
  <view class="page">
    <GuestNotice />
    <view class="row">
      <view class="title compact-title">收支明细</view>
      <button class="text-btn" @tap="openEntry(undefined, day || undefined)">＋ 记一笔</button>
    </view>
    <view class="row">
      <picker v-if="rangeMode === 'month'" mode="date" fields="month" :value="month" @change="selectMonth">
        <view class="badge">{{ month }} ▾</view>
      </picker>
      <text v-else class="badge">{{ rangeMode === 'all' ? '全部日期' : '日期范围' }}</text>
      <view class="chips">
        <view class="chip" :class="{ active: view === 'list' }" @tap="changeView('list')">明细</view>
        <view class="chip" :class="{ active: view === 'calendar' }" @tap="changeView('calendar')">
          日历
        </view>
      </view>
    </view>
    <view v-if="loadError" class="error">{{ loadError }}</view>
    <input v-model="query" class="input search" placeholder="搜索分类、备注或记账人" maxlength="100" />
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
      <picker :range="categoryList" :value="Math.max(0, categoryList.indexOf(category))" @change="selectCategory">
        <text class="filter-category">{{ category || '全部分类' }} ▾</text>
      </picker>
    </view>
    <view class="row advanced-actions">
      <button class="text-btn" @tap="showAdvanced = !showAdvanced">{{ showAdvanced ? '收起筛选' : '更多筛选' }} ▾</button>
      <button class="text-btn" @tap="resetFilters">重置筛选</button>
    </view>
    <view v-if="showAdvanced" class="card advanced">
      <view class="row">
        <text class="small muted">日期</text>
        <picker :range="rangeOptions" :value="rangeValues.indexOf(rangeMode)" @change="changeRange">
          <text class="filter-category">{{ rangeOptions[rangeValues.indexOf(rangeMode)] }} ▾</text>
        </picker>
      </view>
      <view v-if="rangeMode === 'range'" class="range-inputs">
        <picker mode="date" :value="startDate" @change="startDate = $event.detail.value">
          <view class="input date-input">{{ startDate || '开始日期' }} ▾</view>
        </picker>
        <text class="muted small">至</text>
        <picker mode="date" :value="endDate" @change="endDate = $event.detail.value">
          <view class="input date-input">{{ endDate || '结束日期' }} ▾</view>
        </picker>
      </view>
      <text class="label amount-label">金额范围（元，含边界，留空不限）</text>
      <view class="range-inputs">
        <input v-model="minAmount" class="input" type="digit" maxlength="11" placeholder="最低金额" />
        <text class="muted small">至</text>
        <input v-model="maxAmount" class="input" type="digit" maxlength="11" placeholder="最高金额" />
      </view>
      <view class="row sort-row">
        <text class="muted small">排列顺序</text>
        <picker :range="sortOptions" :value="sortValues.indexOf(sort)" @change="sort = sortValues[Number($event.detail.value)]">
          <text class="filter-category">{{ sortOptions[sortValues.indexOf(sort)] }} ▾</text>
        </picker>
      </view>
    </view>
    <view v-if="result.error" class="error">{{ result.error }}</view>
    <view v-if="view === 'calendar' && !result.error" class="card calendar">
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
    <view v-if="!result.error" class="muted summary">
      <view>{{ rangeLabel }}{{ day && view === 'calendar' ? ' · ' + day : '' }} · {{ sortOptions[sortValues.indexOf(sort)] }}</view>
      <view>{{ filtered.length }} 笔 · 收入 {{ money(total.income) }} · 支出 {{ money(total.expense) }}</view>
      <button class="text-btn export" :disabled="!filtered.length" @tap="exportFiltered">复制筛选结果 CSV</button>
    </view>
    <view v-if="!result.error && !filtered.length" class="card empty">
      没有符合条件的账单
      <view class="small">换个筛选条件，或记下新的一笔</view>
    </view>
    <view v-if="!result.error && amountSorted && filtered.length" class="card day-group">
      <view v-for="entry in filtered" :key="entry.id" class="sorted-entry">
        <text class="muted small">{{ entry.date }}</text>
        <BillList :items="[entry]" />
      </view>
    </view>
    <template v-if="!result.error && !amountSorted">
    <view v-for="group in groups" :key="group.date" class="card day-group">
      <view class="row day-title">
        <text>{{ group.date === today() ? '今天' : group.date }}</text>
        <text class="small muted">
          支 {{ money(group.expense) }} · 收 {{ money(group.income) }}
        </text>
      </view>
      <BillList :items="group.entries" />
    </view>
    </template>
  </view>
  </template>
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
.advanced-actions {
  margin-top: 18rpx;
}
.advanced {
  margin-top: 8rpx;
}
.range-inputs {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  gap: 10rpx;
  margin-top: 18rpx;
}
.range-inputs .input {
  width: 100%;
  padding: 16rpx 12rpx;
  font-size: 24rpx;
}
.date-input {
  height: auto;
  line-height: 1.8;
  white-space: nowrap;
}
.amount-label,
.sort-row {
  margin-top: 28rpx;
}
.amount-label {
  margin-bottom: 0;
}
.export {
  display: inline-block;
  padding-left: 0;
  margin-top: 10rpx;
}
.sorted-entry {
  padding-top: 16rpx;
  border-bottom: 1rpx solid #edf1e9;
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
