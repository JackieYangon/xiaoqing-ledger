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
        <view class="bill-note">{{ entry.note || entry.date }}</view>
      </view>
      <text class="amount" :class="{ income: entry.kind === 'income' }">
        {{ hidden ? '••••' : (entry.kind === 'income' ? '+' : '−') + money(entry.cents) }}
      </text>
    </view>
  </view>
</template>
