<script setup lang="ts">
import { useProtectedPage } from '@/services/auth'
const { authenticated, currentUserLabel } = useProtectedPage()
import { ref, computed, watch } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { today, toCsv, inMonth } from '@/core/ledger'
import {
  entries,
  repository,
  refresh,
  toastError,
  copyText,
  loadError,
  cloudEnabled,
  syncBusy,
} from '@/services/ledger'
const pasted = ref(''),
  preview = ref<{ added: number; skipped: number; conflicts: number } | null>(null),
  previewText = ref(''),
  busy = ref(false),
  month = ref(today().slice(0, 7)),
  scope = ref('all')
const exportEntries = computed(() =>
  scope.value === 'all' ? entries.value : inMonth(entries.value, month.value),
)
onShow(refresh)
watch(pasted, () => {
  preview.value = null
})
function backup() {
  try {
    copyText(repository.exportBackup())
  } catch (e) {
    toastError(e)
  }
}
function csv() {
  try {
    repository.read()
    copyText(toCsv(exportEntries.value))
  } catch (e) {
    toastError(e)
  }
}
function check() {
  try {
    preview.value = repository.previewImport(pasted.value)
    previewText.value = pasted.value
  } catch (e) {
    preview.value = null
    toastError(e)
  }
}
function restore() {
  if (busy.value || !preview.value) return
  if (pasted.value !== previewText.value) {
    preview.value = null
    toastError(new Error('备份内容已修改，请重新校验'))
    return
  }
  uni.showModal({
    title: '确认合并备份？',
    content: `新增 ${preview.value.added} 笔，跳过 ${preview.value.skipped} 笔。相同 ID 的记录保留当前账本版本；已有月份预算和隐私设置不覆盖。`,
    success: async (r) => {
      if (r.confirm) {
        try {
          busy.value = true
          const result = await repository.importBackup(previewText.value)
          refresh()
          pasted.value = ''
          preview.value = null
          uni.showToast({ title: `已导入 ${result.added} 笔`, icon: 'none' })
        } catch (e) {
          toastError(e)
        } finally {
          busy.value = false
        }
      }
    },
  })
}
</script>
<template>
  <template v-if="authenticated">
  <view class="page">
    <view class="title compact-title">让记录有备份</view>
    <view class="subtitle">导出一份安心，需要时再恢复。</view>
    <view v-if="loadError" class="error">{{ loadError }}</view>
    <view class="card">
      <view class="section heading">完整备份 · JSON</view>
      <view class="muted">包含全部账单、自定义分类和预算。复制后粘贴到文本文件保存。</view>
      <button class="primary action" @tap="backup">复制完整备份</button>
    </view>
    <view class="card">
      <view class="section heading">表格数据 · CSV</view>
      <view class="chips">
        <view class="chip" :class="{ active: scope === 'all' }" @tap="scope = 'all'">全部账单</view>
        <view class="chip" :class="{ active: scope === 'month' }" @tap="scope = 'month'">
          按月导出
        </view>
        <picker
          v-if="scope === 'month'"
          mode="date"
          fields="month"
          :value="month"
          @change="month = $event.detail.value"
        >
          <view class="badge">{{ month }} ▾</view>
        </picker>
      </view>
      <view class="muted small tip">
        共 {{ exportEntries.length }} 笔。复制后保存为 UTF-8 编码 .csv 文件，用 Excel 打开。CSV
        用于分析，不用于恢复账本。
      </view>
      <button class="secondary action" @tap="csv">复制 CSV 数据</button>
    </view>
    <view class="card">
      <view class="section heading">恢复 JSON 备份</view>
      <view class="muted small">
        支持旧版和新版备份。先检查，再合并；不覆盖当前已有账单。导入前建议先备份当前数据。
      </view>
      <textarea
        v-model="pasted"
        class="backup-input"
        :maxlength="2000000"
        placeholder="在这里粘贴完整 JSON 备份内容"
      />
      <button class="secondary" @tap="check">校验备份</button>
      <view v-if="preview" class="import-summary">
        <view>可新增 {{ preview.added }} 笔 · 跳过 {{ preview.skipped }} 笔</view>
        <view class="muted small">
          其中 {{ preview.conflicts }} 笔同 ID 内容不同，保留当前账本版本。
        </view>
        <button class="primary action" :disabled="busy || syncBusy" :loading="busy" @tap="restore">
          确认合并导入
        </button>
      </view>
    </view>
    <view class="muted small tip">
      备份和 CSV 含有你的账单信息，请妥善保管，不要发送给陌生人。{{
        cloudEnabled ? '恢复操作将合并到当前微信账号的云端账本。' : '网页预览数据仅在本机保存。'
      }}
    </view>
  </view>
  </template>
</template>
<style scoped>
.compact-title {
  font-size: 40rpx;
}
.heading {
  margin: 0 0 20rpx;
}
.action {
  margin-top: 24rpx;
}
.tip {
  margin-top: 20rpx;
}
.backup-input {
  box-sizing: border-box;
  width: 100%;
  height: 260rpx;
  margin: 24rpx 0;
  padding: 20rpx;
  border-radius: 18rpx;
  background: #f5f7f2;
  font-size: 23rpx;
}
.import-summary {
  margin-top: 24rpx;
  padding: 22rpx;
  border-radius: 18rpx;
  background: #edf4e9;
  line-height: 1.8;
}
</style>
