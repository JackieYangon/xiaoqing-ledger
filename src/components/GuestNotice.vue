<script setup lang="ts">
import { guestMode, toLogin, authError } from '@/services/auth'
</script>
<template>
  <view v-if="guestMode" class="guest-notice">
    <view class="guest-row">
      <text class="guest-title">示例账本</text>
      <button class="text-btn guest-login" @tap="toLogin">登录 ›</button>
    </view>
    <view v-if="authError" class="error small">{{ authError }}</view>
  </view>
</template>
<style scoped>
.guest-notice {
  padding: 8rpx 20rpx;
  margin-bottom: 24rpx;
  border-radius: 18rpx;
  background: #e8f3ee;
}
.guest-row { display: flex; align-items: center; justify-content: space-between; }
.guest-title {
  color: #267858;
  font-size: 25rpx;
  font-weight: 600;
}
.guest-login {
  padding: 0;
  font-size: 23rpx;
}
</style>
