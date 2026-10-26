<script setup lang="ts">
import { onLaunch, onShow } from '@dcloudio/uni-app'
import { installAuthGuards, resumeSession } from '@/services/auth'
onLaunch(installAuthGuards)
onShow(resumeSession)
</script>
<style>
page {
  background: #f6f8f4;
  color: #233f34;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: 28rpx;
}
view,
text,
input,
button {
  box-sizing: border-box;
}
button {
  font-size: 28rpx;
  margin: 0;
}
button::after {
  border: 0;
}
.page {
  padding: 36rpx 32rpx 56rpx;
  max-width: 960rpx;
  margin: auto;
}
.eyebrow {
  font-size: 22rpx;
  letter-spacing: 3rpx;
  color: #7b8d80;
}
.title {
  font-size: 48rpx;
  font-weight: 700;
  margin: 14rpx 0;
}
.subtitle,
.muted {
  color: #7c8c83;
  font-size: 25rpx;
  line-height: 1.7;
}
.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
}
.card {
  background: white;
  border: 1rpx solid #e8eee7;
  border-radius: 28rpx;
  padding: 30rpx;
  margin-top: 24rpx;
}
.section {
  font-size: 30rpx;
  font-weight: 600;
  margin: 36rpx 0 18rpx;
}
.primary {
  background: #267858;
  color: #fff;
  border-radius: 20rpx;
  padding: 6rpx 24rpx;
  font-weight: 600;
}
.secondary {
  background: #e8f0e9;
  color: #2e6d51;
  border-radius: 18rpx;
}
.text-btn {
  background: transparent;
  color: #267858;
  font-size: 25rpx;
  padding: 0 12rpx;
  line-height: 2;
}
.badge {
  font-size: 22rpx;
  background: #e8f0e9;
  color: #387458;
  padding: 8rpx 16rpx;
  border-radius: 30rpx;
}
.empty {
  text-align: center;
  padding: 60rpx 18rpx;
  color: #819087;
  line-height: 1.8;
}
.bill {
  display: flex;
  align-items: center;
  gap: 20rpx;
  padding: 26rpx 0;
  border-bottom: 1rpx solid #f0f3ee;
}
.bill:last-child {
  border-bottom: 0;
}
.category-icon {
  width: 76rpx;
  height: 76rpx;
  border-radius: 24rpx;
  background: #edf4eb;
  color: #477455;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  font-size: 30rpx;
}
.bill-body {
  flex: 1;
  min-width: 0;
}
.bill-name {
  font-size: 29rpx;
  font-weight: 600;
}
.bill-note {
  font-size: 23rpx;
  color: #8a958d;
  margin-top: 8rpx;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.amount {
  font-size: 31rpx;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.income {
  color: #267858;
}
.error {
  background: #fff1e9;
  color: #9b4b32;
  padding: 24rpx;
  border-radius: 18rpx;
  margin: 20rpx 0;
}
.chips {
  display: flex;
  gap: 14rpx;
  flex-wrap: wrap;
}
.chip {
  padding: 14rpx 26rpx;
  border-radius: 18rpx;
  background: #edf0eb;
  color: #7b897e;
  font-size: 26rpx;
}
.chip.active {
  background: #267858;
  color: white;
}
.field {
  margin: 28rpx 0;
}
.label {
  display: block;
  font-size: 25rpx;
  color: #718476;
  margin-bottom: 18rpx;
}
.input {
  background: #f5f7f2;
  border-radius: 16rpx;
  padding: 22rpx;
  height: 88rpx;
  font-size: 28rpx;
}
.small {
  font-size: 22rpx;
}
.danger {
  color: #b35e4f;
  background: #fbefeb;
  border-radius: 18rpx;
  margin-top: 24rpx;
}
.divider {
  height: 1rpx;
  background: #edf1e9;
  margin: 24rpx 0;
}
.progress-track {
  height: 14rpx;
  border-radius: 12rpx;
  background: #edf2e8;
  margin-top: 20rpx;
  overflow: hidden;
}
.progress-fill {
  height: 100%;
  background: #86a773;
  border-radius: 12rpx;
}
.progress-fill.over {
  background: #c97b59;
}
.warning {
  color: #ad6042;
}
.amount {
  overflow-wrap: anywhere;
  max-width: 48%;
}
.title {
  line-height: 1.4;
}
</style>
