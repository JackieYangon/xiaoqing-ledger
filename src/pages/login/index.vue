<script setup lang="ts">
import { onShow } from '@dcloudio/uni-app'
import { authenticated, authStatus, authError, login } from '@/services/auth'
import { cloudEnabled } from '@/services/cloud-transport'
async function signIn() {
  if (await login()) uni.reLaunch({ url: '/pages/home/index' })
}
onShow(() => { if (authenticated.value) uni.reLaunch({ url: '/pages/home/index' }) })
</script>
<template>
  <view class="page login-page">
    <image class="logo" src="/static/avatar.png" mode="aspectFill" />
    <view class="eyebrow">小青账本</view>
    <view class="title">登录，记录自己的生活</view>
    <view class="subtitle">每一笔收支，都属于你。</view>
    <view class="card">
      <view class="section">你的微信，你的账本</view>
      <view class="muted">登录后可使用记账、统计、预算与备份。账本绑定当前微信账号，同一账号换手机也能继续查看。</view>
      <button class="primary login-button" :loading="authStatus === 'signingIn'" :disabled="!cloudEnabled || authStatus === 'signingIn'" @tap="signIn">{{ cloudEnabled ? '微信登录' : '请在微信小程序中登录' }}</button>
      <view v-if="authError" class="error">{{ authError }}</view>
      <view class="muted small notice">使用当前微信身份登录，无需提供头像、昵称或手机号。不同微信账号的账本相互独立。</view>
    </view>
    <view v-if="!cloudEnabled" class="muted notice">网页暂不支持微信登录，请通过微信开发者工具预览或在微信中打开小青账本。</view>
  </view>
</template>
<style scoped>
.login-page { padding-top: 100rpx; }
.logo { width: 144rpx; height: 144rpx; border-radius: 36rpx; margin-bottom: 40rpx; }
.title { font-size: 44rpx; }
.section { margin-top: 0; }
.card { margin-top: 54rpx; }
.login-button { margin-top: 36rpx; }
.notice { margin-top: 28rpx; }
</style>
