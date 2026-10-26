<script setup lang="ts">
import { computed } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { entries, loadError, refresh, navigate } from '@/services/ledger'
const days = computed(() => new Set(entries.value.map((e) => e.date)).size)
onShow(refresh)
</script>
<template>
  <view class="page">
    <view class="brand">
      <image class="logo" src="/static/avatar.png" mode="aspectFill" />
      <view>
        <view class="title">小青账本</view>
        <view class="subtitle">认真记录，也好好生活。</view>
      </view>
    </view>
    <view class="card">
      <view class="row">
        <text class="section heading">日常账本</text>
        <text class="badge">本机保存</text>
      </view>
      <view class="row counts">
        <view>
          <text class="count">{{ entries.length }}</text>
          <text class="muted">笔记录</text>
        </view>
        <view>
          <text class="count">{{ days }}</text>
          <text class="muted">天记账</text>
        </view>
      </view>
      <view class="muted small">
        账单保存在当前设备，尚未连接云端。请定期备份，避免清理缓存或更换设备导致记录丢失。
      </view>
    </view>
    <view v-if="loadError" class="error">{{ loadError }}</view>
    <view class="card menu">
      <view class="menu-row" @tap="navigate('budget')">
        <view>
          <view>预算管理</view>
          <view class="muted small">月度总预算 · 分类限额</view>
        </view>
        <text>›</text>
      </view>
      <view class="menu-row" @tap="navigate('categories')">
        <view>
          <view>分类管理</view>
          <view class="muted small">为你的生活添加专属分类</view>
        </view>
        <text>›</text>
      </view>
      <view class="menu-row" @tap="navigate('backup')">
        <view>
          <view>数据与备份</view>
          <view class="muted small">JSON 恢复 · CSV 导出</view>
        </view>
        <text>›</text>
      </view>
    </view>
    <view class="card">
      <view class="section heading">关于小青</view>
      <view class="muted">当前版本 0.2.0 · 本地增强版</view>
      <view class="divider" />
      <view class="muted small">
        快速记账、预算计划、收支日历与趋势统计，让日常开销更清楚。微信登录、云端同步和电脑端将在后续接入。
      </view>
    </view>
    <view class="footer">小小的一笔，也是生活的印记。</view>
  </view>
</template>
<style scoped>
.brand {
  display: flex;
  align-items: center;
  gap: 24rpx;
  margin-bottom: 34rpx;
}
.logo {
  width: 124rpx;
  height: 124rpx;
  border-radius: 30rpx;
}
.brand .title {
  font-size: 42rpx;
}
.heading {
  margin: 0 0 16rpx;
}
.counts {
  margin: 10rpx 0 24rpx;
}
.count {
  font-size: 52rpx;
  font-weight: 600;
}
.menu {
  padding-top: 8rpx;
  padding-bottom: 8rpx;
}
.menu-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 26rpx 0;
  border-bottom: 1rpx solid #edf1e9;
}
.menu-row:last-child {
  border: 0;
}
.footer {
  text-align: center;
  color: #9ba79c;
  font-size: 22rpx;
  margin-top: 44rpx;
}
</style>
