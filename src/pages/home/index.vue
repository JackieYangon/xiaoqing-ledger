<script setup lang="ts">
import { computed } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { today, money, summarize } from '@/core/ledger'
import { entries, loadError, refresh, openEntry } from '@/services/ledger'
const month=computed(()=>today().slice(0,7))
const total=computed(()=>summarize(entries.value.filter(e=>e.date.startsWith(month.value))))
const recent=computed(()=>entries.value.slice(0,5))
onShow(refresh)
function all(){uni.switchTab({url:'/pages/records/index'})}
</script>
<template>
<view class="page">
  <view class="row"><text class="eyebrow">XIAOQING · DAILY LEDGER</text><text class="badge">本机保存</text></view>
  <view class="title">把日子，记清楚。</view><view class="subtitle">从每一笔小事开始，慢慢积攒生活的底气。</view>
  <view v-if="loadError" class="error">{{loadError}}</view>
  <view class="hero"><view class="row"><text>{{month.replace('-', ' 年 ')}} 月支出</text><text class="hero-mark">青</text></view><view class="hero-amount"><text class="currency">¥ </text>{{money(total.expense)}}</view><view class="hero-bottom"><view><view class="hero-label">本月收入</view><view class="hero-number">¥ {{money(total.income)}}</view></view><view><view class="hero-label">本月结余</view><view class="hero-number">¥ {{money(total.income-total.expense)}}</view></view></view></view>
  <button class="primary add" @tap="openEntry()">＋ 记一笔</button>
  <view class="row section"><text>最近账单</text><button class="text-btn" @tap="all">查看全部 ›</button></view>
  <view class="card recent"><view v-if="!recent.length" class="empty"><view class="empty-symbol">＋</view><view>账本还是空白的</view><view class="small">从今天的第一笔收支开始吧</view></view><view v-for="entry in recent" :key="entry.id" class="bill" @tap="openEntry(entry.id)"><view class="category-icon">{{entry.category.slice(0,1)}}</view><view class="bill-body"><view class="bill-name">{{entry.category}}</view><view class="bill-note">{{entry.date}} · {{entry.note || '日常账本'}}</view></view><text class="amount" :class="{income:entry.kind==='income'}">{{entry.kind==='income'?'+':'−'}}{{money(entry.cents)}}</text></view></view>
  <view class="footnote">认真记录，也好好生活。</view>
</view>
</template>
<style scoped>
.hero{margin-top:36rpx;padding:36rpx;border-radius:32rpx;color:#fff;background:linear-gradient(125deg,#245f48,#338568);box-shadow:0 16rpx 36rpx #276c491a}.hero-mark{border:1rpx solid #ffffff50;border-radius:50%;width:54rpx;height:54rpx;line-height:50rpx;text-align:center;color:#dfebc4}.hero-amount{font-size:76rpx;font-weight:600;margin:24rpx 0 38rpx;letter-spacing:1rpx}.currency{font-size:38rpx}.hero-bottom{display:flex;gap:70rpx;border-top:1rpx solid #ffffff25;padding-top:26rpx}.hero-label{font-size:23rpx;color:#c6dfcf}.hero-number{font-size:31rpx;margin-top:12rpx}.add{margin-top:28rpx;line-height:82rpx}.recent{margin-top:0;padding-top:8rpx;padding-bottom:8rpx}.empty-symbol{font-size:62rpx;color:#719c72;margin-bottom:12rpx}.footnote{text-align:center;font-size:22rpx;color:#9aa69b;margin-top:40rpx}
</style>
