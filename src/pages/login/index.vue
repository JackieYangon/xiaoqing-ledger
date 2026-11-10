<script setup lang="ts">
import SessionNotice from '@/components/SessionNotice.vue'
import { onShow, onLoad } from '@dcloudio/uni-app'
import { authStatus, authError, login, ensureSession, browseReady } from '@/services/auth'
import { cloudEnabled } from '@/services/cloud-transport'
let invite = ''
let desktop = ''
onLoad((args) => {
  if (typeof args?.desktop === 'string' && /^[a-f0-9]{24}$/.test(args.desktop))
    desktop = args.desktop
  if (typeof args?.invite === 'string' && /^[A-Fa-f0-9]{16}$/.test(args.invite))
    invite = args.invite
})
function destination() {
  return desktop
    ? '/pages/desktop-login/index?scene=' + desktop
    : invite
      ? '/pages/groups/index?invite=' + invite
      : '/pages/home/index'
}
async function signIn() {
  if (await login()) uni.reLaunch({ url: destination() })
}
function browse() {
  uni.reLaunch({ url: '/pages/home/index' })
}
onShow(async () => {
  if (await ensureSession()) uni.reLaunch({ url: destination() })
})
</script>
<template>
  <SessionNotice />
  <view v-if="browseReady || authStatus === 'signingIn'" class="page login-page">
    <image class="logo" src="/static/avatar.png" mode="aspectFill" />
    <view class="title">小青账本</view>
    <view class="card">
      <button
        class="primary login-button"
        :loading="authStatus === 'signingIn'"
        :disabled="!cloudEnabled || authStatus === 'signingIn'"
        @tap="signIn"
      >
        {{ cloudEnabled ? '登录我的账本' : '请在小青账本小程序中登录' }}
      </button>
      <button class="secondary browse-button" :disabled="authStatus === 'signingIn'" @tap="browse">
        体验示例账本
      </button>
      <view v-if="authError" class="error">{{ authError }}</view>
    </view>
  </view>
</template>
<style scoped>
.login-page {
  padding-top: 120rpx;
  text-align: center;
}
.logo {
  width: 144rpx;
  height: 144rpx;
  border-radius: 44rpx;
  border: 6rpx solid #fff;
  box-shadow: 0 8rpx 30rpx #233d3510;
  margin-bottom: 24rpx;
}
.title {
  font-size: 44rpx;
}
.card {
  margin-top: 56rpx;
  padding: 36rpx 30rpx;
}
.login-button {
  margin-top: 0;
}
.browse-button {
  margin-top: 20rpx;
}
</style>
