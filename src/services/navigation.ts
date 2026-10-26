import { nextTick } from 'vue'
import { onShow } from '@dcloudio/uni-app'
// #ifdef MP-WEIXIN
import { navigationIcons } from '@/config/navigation-icons'
// #endif

export function useNavigationIcons() {
  onShow(() => {
    // Apply after the native tab bar is mounted, including after login and tab switches.
    // #ifdef MP-WEIXIN
    nextTick(() => {
      navigationIcons.forEach((icons, index) => uni.setTabBarItem({ index, ...icons }))
    })
    // #endif
  })
}
