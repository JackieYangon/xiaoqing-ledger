<script setup lang="ts">
import { ref, computed } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { CLOUD_ENV } from '@/config/cloud'
import {
  cloudEnabled,
  storageLabel,
  loadError,
  lastSync,
  accountId,
  refresh,
  syncBusy,
  pendingOperation,
  canDiscardPending,
  discardPending,
  pendingText,
  repository,
  localRepository,
  copyText,
  toastError,
  entries,
} from '@/services/ledger'
const busy = ref(false),
  localCount = ref(0),
  localError = ref(''),
  hasLocal = ref(false)
function readLocal() {
  try {
    const data = localRepository.read()
    localCount.value = data.entries.length
    hasLocal.value =
      !!data.entries.length ||
      !!Object.keys(data.budgets).length ||
      data.customCategories.expense.length > 0 ||
      data.customCategories.income.length > 0
    localError.value = ''
  } catch (e) {
    localError.value = e instanceof Error ? e.message : '本地账本读取失败'
  }
}
onShow(async () => {
  readLocal()
  await refresh()
})
const accountHint = computed(() =>
  accountId.value ? accountId.value.slice(0, 8) + '…' : '尚未连接',
)
async function reconnect() {
  if (busy.value || syncBusy.value) return
  busy.value = true
  try {
    const ok = await refresh()
    if (ok) uni.showToast({ title: cloudEnabled ? '云端已同步' : '本地已刷新', icon: 'success' })
  } finally {
    busy.value = false
  }
}
function backupLocal() {
  try {
    copyText(localRepository.exportBackup())
  } catch (e) {
    toastError(e)
  }
}
async function migrate() {
  if (busy.value || syncBusy.value) return
  try {
    if (!cloudEnabled) throw new Error('请在微信小程序中迁移到云端')
    const text = localRepository.exportBackup(),
      plan = repository.previewImport(text)
    uni.showModal({
      title: '迁移到当前微信账号？',
      content: `本地 ${localCount.value} 笔，预计新增 ${plan.added} 笔、跳过 ${plan.skipped} 笔。请确认这些记录属于当前微信账号。原本地数据不会删除。`,
      success: async (r) => {
        if (r.confirm) {
          busy.value = true
          try {
            const result = await repository.importBackup(text)
            uni.showToast({ title: `已迁移 ${result.added} 笔`, icon: 'none' })
          } catch (e) {
            toastError(e)
          } finally {
            busy.value = false
          }
        }
      },
    })
  } catch (e) {
    toastError(e)
  }
}
function discard() {
  uni.showModal({
    title: '保留草稿并停止重试？',
    content:
      '仅用于云端已明确拒绝的操作。原请求会另存为本地草稿，不会撤销或删除云端账单。请先复制待确认内容。',
    success: async (r) => {
      if (r.confirm)
        try {
          await discardPending()
        } catch (e) {
          toastError(e)
        }
    },
  })
}
</script>
<template>
  <view class="page">
    <view class="title compact-title">记录，随你而行</view>
    <view class="subtitle">同一个微信账号，连接同一份云端账本。</view>
    <view class="card">
      <view class="row">
        <text>当前状态</text>
        <text class="badge">{{ storageLabel }}</text>
      </view>
      <view class="detail muted">
        {{
          cloudEnabled
            ? '云端保存成功后，换手机可用同一个微信账号读取。'
            : '网页是独立的本地预览，不连接微信云端账本。'
        }}
      </view>
      <view v-if="cloudEnabled" class="muted small">
        账号标识 {{ accountHint }} · 云端 {{ entries.length }} 笔
      </view>
      <view v-if="lastSync" class="muted small">最近同步 {{ lastSync }}</view>
      <view v-if="loadError" class="error">{{ loadError }}</view>
      <button
        class="primary action"
        :disabled="busy || syncBusy"
        :loading="busy || syncBusy"
        @tap="reconnect"
      >
        {{ pendingOperation ? '确认上次操作并同步' : '立即同步' }}
      </button>
    </view>
    <view v-if="pendingOperation" class="card">
      <view class="section heading">有一项操作等待确认</view>
      <view class="muted small">
        网络中断时，云端可能已经收到请求。请先同步确认，避免重复记账。未确认前不会继续提交新操作。
      </view>
      <button class="secondary action" @tap="copyText(pendingText())">复制待确认内容</button>
      <button v-if="canDiscardPending" class="danger" @tap="discard">保存草稿并停止重试</button>
    </view>
    <view class="card">
      <view class="section heading">迁移旧版本地账本</view>
      <view v-if="localError" class="error">{{ localError }}</view>
      <view v-else class="muted">
        当前设备原有
        {{ localCount }} 笔本地记录。迁移需要你确认账号，重复记录会跳过，原数据保持不变。
      </view>
      <button class="secondary action" @tap="backupLocal">先复制本地备份</button>
      <button
        class="primary action"
        :disabled="busy || syncBusy || !cloudEnabled || !hasLocal || !!loadError || !!localError"
        @tap="migrate"
      >
        确认迁移到当前微信
      </button>
    </view>
    <view class="card">
      <view class="section heading">使用说明</view>
      <view class="muted small">
        账单、分类和预算通过微信身份隔离。网络不可用时不能确认云端保存；未完成的操作会保留请求以便重试。进入页面会拉取云端最新记录，不是实时推送。云端仍建议定期导出备份。
      </view>
      <view class="muted small detail">环境：{{ CLOUD_ENV }}</view>
    </view>
  </view>
</template>
<style scoped>
.compact-title {
  font-size: 40rpx;
}
.heading {
  margin: 0 0 18rpx;
}
.action,
.detail {
  margin-top: 24rpx;
}
.small {
  word-break: break-all;
}
</style>
