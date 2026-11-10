<script setup lang="ts">
import SessionNotice from '@/components/SessionNotice.vue'
import { APP_VERSION } from '@/config/version'
import { useNavigationIcons } from '@/services/navigation'
useNavigationIcons()
import { browseReady, authenticated, currentUserLabel, logout, currentUser, ensureSession, toLogin } from '@/services/auth'
import GuestNotice from '@/components/GuestNotice.vue'
import { computed } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import {
  entries,
  loadError,
  refresh,
  navigate,
  storageLabel,
  currentBookId,
  currentBookName,
  groups,
  switchBook,
  refreshWorkspace,
  toastError,
} from '@/services/ledger'
const days = computed(() => new Set(entries.value.map((e) => e.date)).size)
const bookNames = computed(() => ['个人账本', ...groups.value.map((g) => g.name)])
const bookIndex = computed(() =>
  Math.max(0, groups.value.findIndex((g) => g.id === currentBookId.value) + 1),
)
const menuItems = [
  { page: 'groups', label: '群组与账本', icon: '群', tone: 'mint' },
  { page: 'recurring', label: '定期记账', icon: '周', tone: 'blue' },
  { page: 'sync', label: '云同步', icon: '云', tone: 'mint' },
  { page: 'budget', label: '预算管理', icon: '¥', tone: 'sand' },
  { page: 'categories', label: '分类管理', icon: '分', tone: 'blue' },
  { page: 'backup', label: '数据与备份', icon: '备', tone: 'sand' },
]
onShow(async () => {
  try {
    if (await ensureSession()) await refreshWorkspace()
    await refresh()
  } catch (e) {
    toastError(e)
  }
})
async function chooseBook(e: any) {
  try {
    await switchBook(
      Number(e.detail.value) === 0 ? '' : groups.value[Number(e.detail.value) - 1].id,
    )
  } catch (err) {
    toastError(err)
  }
}
</script>
<template>
  <SessionNotice />
  <template v-if="browseReady">
    <view class="page">
      <GuestNotice />
      <view class="brand">
        <image class="logo" :src="currentUser?.avatar || '/static/avatar.png'" mode="aspectFill" />
        <view class="profile-name">
          <view class="title">{{ currentUserLabel }}</view>
          <button v-if="authenticated" class="text-btn profile-action" @tap="navigate('profile')">编辑资料 ›</button>
          <button v-else class="text-btn profile-action" @tap="toLogin">登录 ›</button>
        </view>
      </view>
      <view class="card account-card">
        <view class="row">
          <text class="section heading">{{ currentBookName }}</text>
          <text v-if="authenticated" class="badge" @tap="navigate('sync')">{{ storageLabel }} ›</text>
          <text v-else class="badge">{{ storageLabel }}</text>
        </view>
        <view class="row counts">
          <view>
            <view class="count">{{ entries.length }}</view>
            <view class="muted small">账单笔数</view>
          </view>
          <view>
            <view class="count">{{ days }}</view>
            <view class="muted small">记账天数</view>
          </view>
        </view>
        <picker v-if="authenticated" :range="bookNames" :value="bookIndex" @change="chooseBook">
          <view class="book-picker">切换账本 <text>⌄</text></view>
        </picker>
      </view>
      <view v-if="loadError" class="error">{{ loadError }}</view>
      <view class="section">账本管理</view>
      <view class="card menu">
        <view v-for="item in menuItems" :key="item.page" class="menu-row" @tap="navigate(item.page)">
          <view class="menu-icon" :class="item.tone">{{ item.icon }}</view>
          <text class="menu-label">{{ item.label }}</text>
          <text class="menu-arrow">›</text>
        </view>
      </view>
      <button v-if="authenticated" class="secondary logout" @tap="logout">退出登录</button>
      <view class="version">小青账本 · {{ APP_VERSION }}</view>
    </view>
  </template>
</template>
<style scoped>
.brand { display: flex; align-items: center; gap: 24rpx; padding: 16rpx 4rpx 8rpx; }
.logo { width: 116rpx; height: 116rpx; flex-shrink: 0; border: 6rpx solid #fff; border-radius: 38rpx; box-shadow: 0 6rpx 20rpx #173d3210; }
.profile-name { min-width: 0; }
.brand .title { margin: 0; font-size: 38rpx; overflow-wrap: anywhere; }
.profile-action { padding: 4rpx 0 0; font-size: 24rpx; text-align: left; }
.heading { margin: 0; font-size: 29rpx; }
.account-card .row > .heading { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.account-card .badge { flex-shrink: 0; font-size: 21rpx; }
.counts { justify-content: flex-start; gap: 0; margin: 28rpx 0 4rpx; }
.counts > view { flex: 1; min-width: 0; }
.counts > view + view { padding-left: 30rpx; border-left: 1rpx solid #edf1f0; }
.count { margin-bottom: 4rpx; font-size: 50rpx; font-weight: 650; font-variant-numeric: tabular-nums; }
.book-picker { display: flex; justify-content: space-between; align-items: center; margin-top: 24rpx; padding-top: 22rpx; border-top: 1rpx solid #edf1f0; color: #16846b; font-size: 25rpx; }
.menu { margin-top: 0; padding: 4rpx 26rpx; }
.menu-row { display: flex; align-items: center; gap: 20rpx; padding: 24rpx 0; border-bottom: 1rpx solid #edf1f0; }
.menu-row:last-child { border: 0; }
.menu-icon { display: flex; align-items: center; justify-content: center; flex: 0 0 58rpx; width: 58rpx; height: 58rpx; border-radius: 18rpx; font-size: 25rpx; font-weight: 600; }
.menu-label { flex: 1; font-size: 28rpx; }
.menu-arrow { color: #a0afa8; font-size: 34rpx; }
.mint { background: #e8f4ed; color: #378970; }
.blue { background: #edf2fa; color: #6a88b6; }
.sand { background: #fcf2e2; color: #b08c57; }
.logout { margin-top: 28rpx; padding: 4rpx 0; }
.version { margin-top: 32rpx; text-align: center; color: #8d9d95; font-size: 22rpx; }
</style>
