<script setup lang="ts">
import SessionNotice from '@/components/SessionNotice.vue'
import { ensureSession } from '@/services/auth'
import { ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { useProtectedPage, currentUser, updateProfile } from '@/services/auth'
import { refreshWorkspace, workspaceAction, toastError } from '@/services/ledger'
const { authenticated } = useProtectedPage()
const name = ref(''),
  avatar = ref(''),
  avatarPath = ref(''),
  busy = ref(false),
  version = ref(0)
onShow(async () => {
  if (!(await ensureSession())) return
  try {
    await refreshWorkspace()
    name.value = currentUser.value?.name || ''
    avatar.value = currentUser.value?.avatar || ''
    version.value = currentUser.value?.version || 0
  } catch (e) {
    toastError(e)
  }
})
function nickname(e: any) {
  name.value = String(e.detail.value || '')
}
function chooseAvatar(e: any) {
  avatarPath.value = e.detail.avatarUrl
  avatar.value = e.detail.avatarUrl
}
async function avatarData(path: string): Promise<string> {
  let file = path
  try {
    file = (
      (await uni.compressImage({
        src: path,
        quality: 65,
        compressedWidth: 160,
        compressedHeight: 160,
      } as any)) as any
    ).tempFilePath
  } catch {
    /* Validate the original size on the server if compression is unavailable. */
  }
  return new Promise((resolve, reject) =>
    (uni as any)
      .getFileSystemManager()
      .readFile({
        filePath: file,
        encoding: 'base64',
        success: (r: any) => resolve(r.data),
        fail: reject,
      }),
  )
}
async function save() {
  if (busy.value) return
  busy.value = true
  try {
    const args: any = { name: name.value, version: version.value }
    if (avatarPath.value) args.avatarBase64 = await avatarData(avatarPath.value)
    const result = await workspaceAction('profileSave', args)
    updateProfile(result.profile)
    version.value = result.profile.version
    avatarPath.value = ''
    uni.showToast({ title: '资料已保存', icon: 'success' })
  } catch (e) {
    toastError(e)
  } finally {
    busy.value = false
  }
}
</script>
<template>
  <SessionNotice />
  <view v-if="authenticated" class="page">
    <view class="title">我的资料</view>
    <view class="subtitle">头像和昵称均可选填，不影响记账功能。</view>
    <view class="card">
      <button class="avatar-button" open-type="chooseAvatar" @chooseavatar="chooseAvatar">
        <image :src="avatar || '/static/avatar.png'" mode="aspectFill" />
      </button>
      <view class="muted small centered">头像选填，点击选择图片</view>
      <view class="field">
        <text class="label">昵称（选填）</text>
        <input
          v-model="name"
          type="nickname"
          maxlength="24"
          class="input"
          placeholder="填写你希望展示的昵称"
          @blur="nickname"
        />
      </view>
      <button class="primary" :disabled="busy" :loading="busy" @tap="save">保存资料</button>
      <view class="muted small notice">
        仅在你主动选择并确认后保存，用于个人展示和群组账单的记账人信息；也可以保留默认资料。
      </view>
    </view>
  </view>
</template>
<style scoped>
.avatar-button {
  padding: 0;
  width: 144rpx;
  height: 144rpx;
  border-radius: 40rpx;
  margin: 16rpx auto;
}
.avatar-button image {
  width: 100%;
  height: 100%;
}
.centered {
  text-align: center;
}
.notice {
  margin-top: 24rpx;
}
</style>
