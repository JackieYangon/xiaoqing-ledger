<script setup lang="ts">
import SessionNotice from '@/components/SessionNotice.vue'
import { ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { authenticated, authenticatedCall, currentUserLabel, ensureSession, guestMode } from '@/services/auth'
const scene = ref(''),
  busy = ref(false),
  finished = ref('')
const pairingCode = ref('')
onLoad(async (args) => {
  const value = typeof args?.scene === 'string' ? decodeURIComponent(args.scene) : ''
  if (!/^[a-f0-9]{24}$/.test(value)) {
    finished.value = '二维码无效，请在电脑重新获取'
    return
  }
  scene.value = value
  pairingCode.value = String(parseInt(value.slice(0, 8), 16) % 1000000).padStart(6, '0')
  if (!(await ensureSession()) && guestMode.value)
    uni.reLaunch({ url: '/pages/login/index?desktop=' + value })
})
function goHome() {
  uni.switchTab({ url: '/pages/home/index' })
}
async function decide(decision: 'approve' | 'deny') {
  if (busy.value || !scene.value) return
  busy.value = true
  try {
    const result = await authenticatedCall({
      action: 'desktopConfirm',
      scene: scene.value,
      decision,
    })
    if (!result.ok) throw new Error(result.message || '请求已失效')
    finished.value =
      decision === 'approve' ? '已确认电脑登录。请回到电脑继续操作。' : '已取消电脑登录。'
  } catch (e) {
    finished.value = e instanceof Error ? e.message : '确认失败，请重新扫码'
  } finally {
    busy.value = false
  }
}
</script>
<template>
  <SessionNotice />
  <view class="page">
    <view class="title">电脑登录确认</view>
    <view class="card">
      <template v-if="!finished">
        <view class="section">{{ currentUserLabel }}</view>
        <view class="muted">
          请确认这是你正在操作的电脑。确认后，电脑将能访问你的个人账本及已加入的群组账本。
        </view>
        <view class="code">{{ pairingCode }}</view>
        <view class="muted">请核对电脑上显示的六位数字。数字不一致或不是你本人操作，请取消。</view>
        <button
          class="primary action"
          :loading="busy"
          :disabled="busy || !authenticated"
          @tap="decide('approve')"
        >
          确认登录
        </button>
        <button class="secondary action" :disabled="busy || !authenticated" @tap="decide('deny')">
          取消
        </button>
      </template>
      <template v-else>
        <view class="section">{{ finished }}</view>
        <button class="secondary action" @tap="goHome">返回首页</button>
      </template>
    </view>
  </view>
</template>
<style scoped>
.code {
  text-align: center;
  font-size: 56rpx;
  font-weight: 700;
  letter-spacing: 12rpx;
  margin: 36rpx 0;
  color: #267858;
}
.action {
  margin-top: 24rpx;
}
</style>
