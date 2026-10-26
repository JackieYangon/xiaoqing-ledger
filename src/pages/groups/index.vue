<script setup lang="ts">
import { ref, computed } from 'vue'
import { onLoad, onShow, onShareAppMessage } from '@dcloudio/uni-app'
import { useProtectedPage, currentUser } from '@/services/auth'
import {
  groups,
  currentBookId,
  refreshWorkspace,
  switchBook,
  workspaceAction,
  toastError,
  copyText,
} from '@/services/ledger'
const { authenticated } = useProtectedPage()
const name = ref(''),
  code = ref(''),
  invite = ref(''),
  inviteName = ref(''),
  busy = ref(false),
  members = ref<any[]>([])
const selected = computed(() => groups.value.find((g) => g.id === currentBookId.value))
const requestId = ref(
  'group_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2),
)
onLoad((args) => {
  if (args?.invite) code.value = String(args.invite)
})
onShow(async () => {
  if (!authenticated.value) return
  try {
    await refreshWorkspace()
  } catch (e) {
    toastError(e)
  }
})
onShareAppMessage(() => ({
  title: invite.value ? '邀请你加入「' + inviteName.value + '」共同记账' : '小青账本',
  path: '/pages/login/index' + (invite.value ? '?invite=' + invite.value : ''),
}))
async function run(fn: () => Promise<void>) {
  if (busy.value) return
  busy.value = true
  try {
    await fn()
  } catch (e) {
    toastError(e)
  } finally {
    busy.value = false
  }
}
async function create() {
  await run(async () => {
    const r = await workspaceAction('groupCreate', { name: name.value, requestId: requestId.value })
    await refreshWorkspace()
    await switchBook(r.groupId)
    name.value = ''
    requestId.value = 'group_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2)
    uni.showToast({ title: '已创建并切换', icon: 'none' })
  })
}
async function join() {
  await run(async () => {
    const r = await workspaceAction('groupJoin', { code: code.value })
    await refreshWorkspace()
    await switchBook(r.groupId)
    code.value = ''
    uni.showToast({ title: '已加入并切换', icon: 'none' })
  })
}
async function select(id: string) {
  await run(async () => {
    await switchBook(id)
    members.value = []
    invite.value = ''
  })
}
async function makeInvite() {
  await run(async () => {
    const r = await workspaceAction('groupInvite', { groupId: currentBookId.value })
    invite.value = r.code
    inviteName.value = selected.value?.name || ''
  })
}
async function showMembers() {
  await run(async () => {
    const r = await workspaceAction('groupDetails', { groupId: currentBookId.value })
    members.value = r.members
  })
}
async function removeEmpty() {
  uni.showModal({
    title: '删除空群组？',
    content: '仅允许删除没有账单、定期项目和其他成员的群组，群组预算设置也会移除。',
    success: (r) => {
      if (r.confirm)
        run(async () => {
          await workspaceAction('groupDelete', { groupId: currentBookId.value })
          await refreshWorkspace()
          await switchBook('')
          members.value = []
          invite.value = ''
        })
    },
  })
}
async function leave() {
  uni.showModal({
    title: '退出群组？',
    content: '退出后无法查看群组账本；你已记入群组的账单会保留。',
    success: (r) => {
      if (r.confirm)
        run(async () => {
          await workspaceAction('groupLeave', { groupId: currentBookId.value })
          await refreshWorkspace()
          await switchBook('')
          members.value = []
        })
    },
  })
}
</script>
<template>
  <view v-if="authenticated" class="page">
    <view class="title">一起记账</view>
    <view class="subtitle">个人账本保持私密，群组账单共同可见。</view>
    <view class="card">
      <view class="section heading">切换账本</view>
      <button :class="!currentBookId ? 'primary' : 'secondary'" :disabled="busy" @tap="select('')">
        个人账本
      </button>
      <button
        v-for="g in groups"
        :key="g.id"
        class="book"
        :class="currentBookId === g.id ? 'primary' : 'secondary'"
        :disabled="busy"
        @tap="select(g.id)"
      >
        {{ g.name }} · {{ g.size }} 人 {{ currentBookId === g.id ? '✓' : '' }}
      </button>
    </view>
    <view v-if="selected" class="card">
      <view class="section heading">{{ selected.name }}</view>
      <view class="muted small">成员可查看共享账单、记录自己的消费；群主管理共享预算和分类。</view>
      <button class="secondary book" @tap="showMembers">查看成员</button>
      <view v-for="m in members" :key="m.id" class="member">
        <image :src="m.avatar || '/static/avatar.png'" mode="aspectFill" />
        <text>{{ m.name }}{{ m.id === selected.creator ? ' · 群主' : '' }}</text>
      </view>
      <template v-if="selected.creator === currentUser?.accountId">
        <button class="secondary book" :disabled="busy" @tap="makeInvite">
          {{ invite ? '重新生成邀请' : '生成邀请' }}
        </button>
        <view v-if="invite" class="invite">
          <view class="code">{{ invite }}</view>
          <view class="muted small">有效期 7 天，重新生成后旧邀请失效。</view>
          <button class="primary book" open-type="share">分享给微信好友</button>
          <button class="text-btn" @tap="copyText(invite)">复制邀请码</button>
        </view>
      </template>
      <button
        v-if="selected.creator === currentUser?.accountId"
        class="danger"
        :disabled="busy"
        @tap="removeEmpty"
      >
        删除空群组
      </button>
      <button v-else class="danger" :disabled="busy" @tap="leave">退出群组</button>
    </view>
    <view class="card">
      <view class="section heading">加入群组</view>
      <input v-model="code" class="input" maxlength="16" placeholder="填写好友发来的 16 位邀请码" />
      <view class="muted small notice">
        确认加入后，你主动记入该群组的账单会对成员可见，个人账单不会共享。
      </view>
      <button class="primary book" :disabled="busy" @tap="join">确认加入</button>
    </view>
    <view class="card">
      <view class="section heading">创建群组</view>
      <input v-model="name" class="input" maxlength="24" placeholder="例如：家庭日常" />
      <button class="secondary book" :disabled="busy" @tap="create">创建并切换</button>
    </view>
  </view>
</template>
<style scoped>
.heading {
  margin-top: 0;
}
.book {
  margin-top: 20rpx;
}
.notice {
  margin-top: 16rpx;
}
.code {
  font-size: 30rpx;
  letter-spacing: 2rpx;
  margin: 24rpx 0 12rpx;
  overflow-wrap: anywhere;
}
.member {
  display: flex;
  align-items: center;
  gap: 18rpx;
  margin-top: 20rpx;
  font-size: 26rpx;
}
.member image {
  width: 64rpx;
  height: 64rpx;
  border-radius: 20rpx;
}
</style>
