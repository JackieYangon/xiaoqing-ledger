<script setup lang="ts">
import { useProtectedPage, logout, currentUser } from '@/services/auth'
const { authenticated, currentUserLabel } = useProtectedPage()
import { computed } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import {
  entries,
  loadError,
  refresh,
  navigate,
  storageLabel,
  cloudEnabled,
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
onShow(async () => {
  if (!authenticated.value) return
  try {
    await refreshWorkspace()
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
  <template v-if="authenticated">
    <view class="page">
      <view class="brand" @tap="navigate('profile')">
        <image class="logo" :src="currentUser?.avatar || '/static/avatar.png'" mode="aspectFill" />
        <view>
          <view class="title">{{ currentUserLabel }}</view>
          <view class="subtitle">编辑微信头像与昵称 ›</view>
        </view>
      </view>
      <view class="card">
        <view class="row">
          <text class="section heading">{{ currentBookName }}</text>
          <text class="badge" @tap="navigate('sync')">{{ storageLabel }} ›</text>
        </view>
        <picker :range="bookNames" :value="bookIndex" @change="chooseBook">
          <view class="secondary" style="padding: 20rpx; border-radius: 16rpx; margin: 12rpx 0">
            切换账本：{{ currentBookName }} ▾
          </view>
        </picker>
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
          {{
            cloudEnabled
              ? '云端账本绑定当前微信身份，保存成功后换手机可读取。旧版本地记录请到云同步页面确认迁移。'
              : '网页为独立本地预览。云端账本请在微信小程序中使用。'
          }}
        </view>
      </view>
      <view v-if="loadError" class="error">{{ loadError }}</view>
      <view class="card menu">
        <view class="menu-row" @tap="navigate('groups')">
          <view>
            <view>群组与账本</view>
            <view class="muted small">邀请成员 · 共享预算 · 切换账本</view>
          </view>
          <text>›</text>
        </view>
        <view class="menu-row" @tap="navigate('recurring')">
          <view>
            <view>定期记账</view>
            <view class="muted small">每周 / 每月 · 关联项目防重复</view>
          </view>
          <text>›</text>
        </view>
        <view class="menu-row" @tap="navigate('sync')">
          <view>
            <view>云同步与迁移</view>
            <view class="muted small">同步状态 · 旧版账单迁移</view>
          </view>
          <text>›</text>
        </view>
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
        <view class="muted">当前版本 0.5.0 · 共享账本与定期记账</view>
        <view class="divider" />
        <view class="muted small">
          快速记账、预算计划、收支日历与趋势统计。微信端通过云函数保存账本，请使用当前微信账号登录后操作。
        </view>
      </view>
      <button class="secondary" style="margin-top: 32rpx" @tap="logout">退出登录</button>
      <view class="footer">小小的一笔，也是生活的印记。</view>
    </view>
  </template>
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
