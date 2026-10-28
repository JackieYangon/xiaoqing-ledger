<script setup lang="ts">
import SessionNotice from '@/components/SessionNotice.vue'
import { onShow, onLoad } from '@dcloudio/uni-app'
import { authenticated, authStatus, authError, login, ensureSession, browseReady } from '@/services/auth'
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
    <view class="eyebrow">小青账本</view>
    <view class="title">登录，记录自己的生活</view>
    <view class="subtitle">可先浏览体验，再自行选择登录。</view>
    <view class="card">
      <view class="section">你的账号，你的账本</view>
      <view class="muted">
        无需登录即可体验记账、账单筛选、统计和预算。登录后可保存正式账本、同步与备份，同一账号换手机也能继续查看。体验记录不会导入正式账本。
      </view>
      <button
        class="primary login-button"
        :loading="authStatus === 'signingIn'"
        :disabled="!cloudEnabled || authStatus === 'signingIn'"
        @tap="signIn"
      >
        {{ cloudEnabled ? '登录我的账本' : '请在小青账本小程序中登录' }}
      </button>
      <button class="secondary browse-button" :disabled="authStatus === 'signingIn'" @tap="browse">
        暂不登录，继续体验
      </button>
      <view v-if="authError" class="error">{{ authError }}</view>
      <view class="muted small notice">
        登录无需提供手机号，头像和昵称可在登录后自行选填。不同账号的账本相互独立。
      </view>
    </view>
    <view v-if="!cloudEnabled" class="muted notice">
      网页可浏览体验；登录并保存正式账本，请在小青账本小程序中操作。
    </view>
  </view>
</template>
<style scoped>
.login-page {
  padding-top: 100rpx;
}
.logo {
  width: 144rpx;
  height: 144rpx;
  border-radius: 36rpx;
  margin-bottom: 40rpx;
}
.title {
  font-size: 44rpx;
}
.section {
  margin-top: 0;
}
.card {
  margin-top: 54rpx;
}
.login-button {
  margin-top: 36rpx;
}
.browse-button {
  margin-top: 20rpx;
}
.notice {
  margin-top: 28rpx;
}
</style>
