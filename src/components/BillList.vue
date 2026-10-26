<script setup lang="ts">
import { money, type Entry } from '@/core/ledger'
import { openEntry } from '@/services/ledger'
defineProps<{ items: Entry[]; hidden?: boolean }>()
</script>
<template>
  <view>
    <view v-for="entry in items" :key="entry.id" class="bill" @tap="openEntry(entry.id)">
      <view class="category-icon">{{ entry.category.slice(0, 1) }}</view>
      <view class="bill-body">
        <view class="bill-name">{{ entry.category }}</view>
        <view v-if="entry.author" class="author">
          <image :src="entry.author.avatar || '/static/avatar.png'" mode="aspectFill" />
          <text>{{ entry.author.name }}{{ entry.automatic ? ' · 自动记账' : '' }}</text>
        </view>
        <view class="bill-note">{{ entry.note || entry.date }}</view>
      </view>
      <text class="amount" :class="{ income: entry.kind === 'income' }">
        {{ hidden ? '••••' : (entry.kind === 'income' ? '+' : '−') + money(entry.cents) }}
      </text>
    </view>
  </view>
</template>

<style scoped>
.author {
  display: flex;
  align-items: center;
  gap: 8rpx;
  color: #7c8c83;
  font-size: 21rpx;
  margin-top: 8rpx;
}
.author image {
  width: 32rpx;
  height: 32rpx;
  border-radius: 50%;
}
</style>
