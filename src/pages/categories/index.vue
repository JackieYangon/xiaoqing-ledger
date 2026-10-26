<script setup lang="ts">
import { ref, computed } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { categories, type Kind } from '@/core/ledger'
import { state, repository, refresh, toastError } from '@/services/ledger'
const kind = ref<Kind>('expense'),
  name = ref('')
const custom = computed(() => state.value.customCategories[kind.value])
onShow(refresh)
function add() {
  try {
    repository.addCategory(kind.value, name.value)
    refresh()
    name.value = ''
    uni.showToast({ title: '分类已添加', icon: 'success' })
  } catch (e) {
    toastError(e)
  }
}
function remove(value: string) {
  const selectedKind = kind.value
  uni.showModal({
    title: '删除自定义分类？',
    content: '已用于账单或预算的分类将保留。',
    success: (r) => {
      if (r.confirm)
        try {
          repository.removeCategory(selectedKind, value)
          refresh()
        } catch (e) {
          toastError(e)
        }
    },
  })
}
</script>
<template>
  <view class="page">
    <view class="title compact-title">让分类更懂你</view>
    <view class="subtitle">为咖啡、宠物或旅行，留一个专属位置。</view>
    <view class="chips kind-tabs">
      <view class="chip" :class="{ active: kind === 'expense' }" @tap="kind = 'expense'">
        支出分类
      </view>
      <view class="chip" :class="{ active: kind === 'income' }" @tap="kind = 'income'">
        收入分类
      </view>
    </view>
    <view class="card">
      <text class="label">新增分类（最多 12 个字）</text>
      <input v-model="name" class="input" maxlength="12" placeholder="例如：咖啡" />
      <button class="primary add-category" @tap="add">添加分类</button>
      <view class="muted small tip">每种收支类型最多添加 40 个自定义分类。</view>
    </view>
    <view class="section">自定义分类 · {{ custom.length }}</view>
    <view class="card">
      <view v-if="!custom.length" class="empty">还没有自定义分类</view>
      <view v-for="item in custom" :key="item" class="custom-row row">
        <text>{{ item }}</text>
        <button class="text-btn warning" @tap="remove(item)">删除</button>
      </view>
    </view>
    <view class="section">默认分类</view>
    <view class="card chips">
      <text v-for="item in categories[kind]" :key="item" class="chip">{{ item }}</text>
    </view>
    <view class="muted small tip">默认分类保留，避免影响历史账单。</view>
  </view>
</template>
<style scoped>
.compact-title {
  font-size: 40rpx;
}
.kind-tabs {
  margin-top: 24rpx;
}
.add-category {
  margin-top: 24rpx;
}
.custom-row {
  padding: 12rpx 0;
  border-bottom: 1rpx solid #edf1e9;
}
.tip {
  margin-top: 20rpx;
}
</style>
