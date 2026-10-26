<script setup lang="ts">
import { useProtectedPage } from '@/services/auth'
const { authenticated } = useProtectedPage()
import { ref, computed } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { categoryOptions, type Kind } from '@/core/ledger'
import { state, repository, refresh, toastError, syncBusy, canManageBook } from '@/services/ledger'
const busy = ref(false),
  kind = ref<Kind>('expense'),
  name = ref('')
const editing = ref<{ kind: Kind; name: string } | null>(null),
  newName = ref('')
const deleting = ref<{ kind: Kind; name: string } | null>(null)
const items = computed(() => categoryOptions(state.value, kind.value))
onShow(refresh)
async function run(action: () => Promise<any>) {
  if (busy.value || syncBusy.value) return
  busy.value = true
  try {
    await action()
    editing.value = null
    deleting.value = null
    uni.showToast({ title: '分类已更新', icon: 'none' })
  } catch (e) {
    toastError(e)
  } finally {
    busy.value = false
  }
}
function add() {
  run(async () => {
    await repository.addCategory(kind.value, name.value)
    name.value = ''
  })
}
function rename() {
  const target = editing.value
  if (target) run(() => repository.renameCategory(target.kind, target.name, newName.value))
}
function remove() {
  const target = deleting.value
  if (target) run(() => repository.removeCategory(target.kind, target.name))
}
function beginDelete(value: string) {
  deleting.value = { kind: kind.value, name: value }
  editing.value = null
}
function edit(value: string) {
  editing.value = { kind: kind.value, name: value }
  newName.value = value
  deleting.value = null
}
</script>
<template>
  <view v-if="authenticated" class="page">
    <view class="title">分类管理</view>
    <view class="subtitle">所有分类均可重命名或删除，不区分默认与自定义。</view>
    <view v-if="!canManageBook" class="muted book">群组分类由群主管理。</view>
    <view class="chips book">
      <view class="chip" :class="{ active: kind === 'expense' }" @tap="kind = 'expense'">
        支出分类
      </view>
      <view class="chip" :class="{ active: kind === 'income' }" @tap="kind = 'income'">
        收入分类
      </view>
    </view>
    <view v-if="canManageBook" class="card">
      <text class="label">新增分类（1–12 个字）</text>
      <input v-model="name" class="input" maxlength="12" placeholder="输入分类名称" />
      <button class="primary book" :disabled="busy || syncBusy" @tap="add">添加分类</button>
      <view class="muted small book">每种收支类型最多 50 个分类。</view>
    </view>
    <view class="card">
      <view v-if="!items.length" class="empty">暂无分类，请先添加分类再记账。</view>
      <view v-for="item in items" :key="item" class="row category-row">
        <text>{{ item }}</text>
        <view v-if="canManageBook" class="row">
          <button class="text-btn" :disabled="busy || syncBusy" @tap="edit(item)">修改</button>
          <button class="text-btn warning" :disabled="busy || syncBusy" @tap="beginDelete(item)">
            删除
          </button>
        </view>
      </view>
    </view>
    <view v-if="editing" class="card">
      <view class="label">修改“{{ editing.name }}”</view>
      <input v-model="newName" class="input" maxlength="12" />
      <view class="muted small book">历史账单和已有分类预算保留原名称，定期任务使用新名称。</view>
      <view class="row book">
        <button class="secondary" :disabled="busy" @tap="editing = null">取消</button>
        <button class="primary" :disabled="busy || syncBusy" @tap="rename">保存名称</button>
      </view>
    </view>
    <view v-if="deleting" class="card">
      <view class="label">删除“{{ deleting.name }}”？</view>
      <view class="muted">历史账单和已有预算保留；新账单不可再选此分类，相关定期任务将暂停。</view>
      <view class="row book">
        <button class="secondary" :disabled="busy" @tap="deleting = null">取消</button>
        <button class="primary" :disabled="busy || syncBusy" @tap="remove">确认删除</button>
      </view>
    </view>
  </view>
</template>
<style scoped>
.book {
  margin-top: 24rpx;
}
.category-row {
  padding: 12rpx 0;
  border-bottom: 1rpx solid #edf1e9;
}
</style>
