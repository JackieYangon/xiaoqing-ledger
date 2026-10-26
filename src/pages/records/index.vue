<script setup lang="ts">
import { ref, computed } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { today, money, summarize } from '@/core/ledger'
import { entries,loadError,refresh,openEntry } from '@/services/ledger'
const month=ref(today().slice(0,7)); const kind=ref('all'); const query=ref('')
const filtered=computed(()=>entries.value.filter(e=>e.date.startsWith(month.value)&&(kind.value==='all'||e.kind===kind.value)&&`${e.category} ${e.note}`.includes(query.value.trim())))
const total=computed(()=>summarize(filtered.value))
function selectMonth(e:any){month.value=e.detail.value}
onShow(refresh)
</script>
<template><view class="page"><view class="row"><view class="title">每一笔，都有迹可循</view></view><view class="row"><picker mode="date" fields="month" :value="month" @change="selectMonth"><view class="badge">{{month}} ▾</view></picker><button class="text-btn" @tap="openEntry()">＋ 记一笔</button></view><view v-if="loadError" class="error">{{loadError}}</view><input v-model="query" class="input search" placeholder="搜索分类或备注" maxlength="100"/><view class="chips"><view v-for="item in [{id:'all',name:'全部'},{id:'expense',name:'支出'},{id:'income',name:'收入'}]" :key="item.id" class="chip" :class="{active:kind===item.id}" @tap="kind=item.id">{{item.name}}</view></view><view class="muted summary">{{filtered.length}} 笔 · 收入 {{money(total.income)}} · 支出 {{money(total.expense)}}</view><view class="card"><view v-if="!filtered.length" class="empty">没有找到符合条件的账单<view class="small">试试其他月份，或记下新的一笔</view></view><view v-for="entry in filtered" :key="entry.id" class="bill" @tap="openEntry(entry.id)"><view class="category-icon">{{entry.category.slice(0,1)}}</view><view class="bill-body"><view class="bill-name">{{entry.category}}</view><view class="bill-note">{{entry.date}} · {{entry.note || '无备注'}}</view></view><text class="amount" :class="{income:entry.kind==='income'}">{{entry.kind==='income'?'+':'−'}}{{money(entry.cents)}}</text></view></view></view></template>
<style scoped>.title{font-size:38rpx;margin-bottom:28rpx}.search{margin:26rpx 0;background:#fff;border:1rpx solid #e5ece2}.summary{margin-top:24rpx;font-size:23rpx}</style>
