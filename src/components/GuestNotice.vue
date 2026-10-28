<script setup lang="ts">
import { guestMode, toLogin, authError } from '@/services/auth'
</script>
<template>
  <view v-if="guestMode" class="guest-notice">
    <view class="guest-title">游客体验 · 示例账本</view>
    <view class="muted small">
      可试记、筛选账单和查看统计。体验修改仅在本次打开期间保留，不会写入正式账本。
    </view>
    <button class="text-btn guest-login" @tap="toLogin">登录我的账本 ›</button>
    <view v-if="authError" class="error small">{{ authError }}</view>
  </view>
</template>
<style scoped>
.guest-notice {
  padding: 24rpx;
  margin-bottom: 28rpx;
  border-radius: 20rpx;
  background: #eaf2e8;
}
.guest-title {
  color: #267858;
  font-size: 25rpx;
  font-weight: 600;
  margin-bottom: 8rpx;
}
.guest-login {
  margin-top: 10rpx;
  padding: 0;
  text-align: left;
}
</style>
