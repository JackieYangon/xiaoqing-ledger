<script setup lang="ts">
import { authStatus, authError, resumeSession } from '@/services/auth'
async function reconnect() {
  if (!(await resumeSession())) return
  // Re-run page loaders after an offline cold start, preserving deep-link arguments.
  const pages = getCurrentPages()
  const page = pages[pages.length - 1] as any
  const query = Object.entries(page?.options || {})
    .map(([key, value]) => encodeURIComponent(key) + '=' + encodeURIComponent(String(value)))
    .join('&')
  uni.reLaunch({ url: '/' + (page?.route || 'pages/home/index') + (query ? '?' + query : '') })
}
</script>
<template>
  <view v-if="authStatus === 'checking' || authStatus === 'offline'" class="page">
    <view class="card">
      <view class="section">{{ authStatus === 'checking' ? '正在连接你的账本' : '暂时无法连接账本' }}</view>
      <view class="muted">
        {{ authStatus === 'checking' ? '正在恢复已保存的登录状态，请稍候。' : '登录状态已保留，请联网后重试，无需重新授权。' }}
      </view>
      <view v-if="authStatus === 'offline' && authError" class="muted small notice">{{ authError }}</view>
      <button v-if="authStatus === 'offline'" class="secondary notice" @tap="reconnect">重新连接</button>
    </view>
  </view>
</template>
<style scoped>
.section { margin-top: 0; }
.notice { margin-top: 24rpx; }
</style>
