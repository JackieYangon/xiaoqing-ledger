<script setup lang="ts">
import { onLaunch, onShow } from '@dcloudio/uni-app'
import { initializeAuth, resumeSession } from '@/services/auth'
onLaunch(initializeAuth)
onShow(resumeSession)
</script>
<style>
@import './styles/theme.css';
</style>
