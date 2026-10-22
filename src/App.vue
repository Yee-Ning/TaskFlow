<script setup lang="ts">
import { onMounted, onUnmounted, computed, watch, ref } from 'vue'
import { useStore } from 'vuex'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { shortcutApi } from './api/database'

const store = useStore()
const router = useRouter()
const isLoggedIn = computed(() => store.getters['user/isLoggedIn'])
const theme = computed(() => store.getters['user/theme'])

// ==================== 主题 ====================
watch(theme, (val) => {
  document.documentElement.setAttribute('data-theme', val)
}, { immediate: true })

// ==================== 自动退出 ====================
const INACTIVITY_LIMIT = 10 * 60 * 1000 // 10分钟

let inactivityTimer: ReturnType<typeof setTimeout> | null = null

function resetInactivityTimer() {
  if (inactivityTimer) clearTimeout(inactivityTimer)

  // 只有已登录 且 开启了自动退出 时才计时
  const autoLogoutEnabled = localStorage.getItem('setting_auto_logout') === 'true'

  if (isLoggedIn.value && autoLogoutEnabled) {
    inactivityTimer = setTimeout(() => {
      logoutDueToInactivity()
    }, INACTIVITY_LIMIT)
  }
}

function logoutDueToInactivity() {
  store.dispatch('user/logout')
  router.push('/login')
  ElMessage.info('由于长时间未操作，已自动退出')
}

// 监听活动
const activityEvents = ['mousemove', 'keydown', 'click', 'scroll']
function setupActivityListeners() {
  activityEvents.forEach(event => {
    window.addEventListener(event, resetInactivityTimer)
  })
}
function removeActivityListeners() {
  activityEvents.forEach(event => {
    window.removeEventListener(event, resetInactivityTimer)
  })
  if (inactivityTimer) clearTimeout(inactivityTimer)
}

// 监听登录状态变化
watch(isLoggedIn, (val) => {
  if (val) {
    resetInactivityTimer()
  } else {
    if (inactivityTimer) clearTimeout(inactivityTimer)
  }
})

// ==================== 快捷键触发响应 ====================
function handleShortcutTriggered(actionId: string) {
  if (!isLoggedIn.value) return

  switch (actionId) {
    case 'create-task':
      // 确保在首页，然后通知 TaskManager 打开创建对话框
      if (router.currentRoute.value.name !== 'Home') {
        router.push('/').then(() => {
          window.dispatchEvent(new CustomEvent('shortcut:create-task'))
        })
      } else {
        window.dispatchEvent(new CustomEvent('shortcut:create-task'))
      }
      break

    case 'complete-task':
      // 通知 TaskManager 标记当前任务完成
      window.dispatchEvent(new CustomEvent('shortcut:complete-task'))
      break

    case 'filter-tasks':
      // 确保在首页，然后通知 TaskManager 切换筛选
      if (router.currentRoute.value.name !== 'Home') {
        router.push('/').then(() => {
          window.dispatchEvent(new CustomEvent('shortcut:filter-tasks'))
        })
      } else {
        window.dispatchEvent(new CustomEvent('shortcut:filter-tasks'))
      }
      break

    case 'open-settings':
      router.push('/settings')
      break
  }
}

onMounted(() => {
  setupActivityListeners()
  resetInactivityTimer()
  shortcutApi.onTriggered(handleShortcutTriggered)
})

onUnmounted(() => {
  removeActivityListeners()
})
</script>

<template>
  <router-view />
</template>

<style>
#app {
  max-width: 100%;
  margin: 0;
  padding: 0;
  text-align: left;
  min-height: 100vh;
  background:
    radial-gradient(ellipse 80% 60% at 20% 10%, rgba(124, 108, 240, 0.08) 0%, transparent 60%),
    radial-gradient(ellipse 60% 50% at 80% 80%, rgba(91, 141, 239, 0.06) 0%, transparent 60%),
    var(--bg-deep);
}
</style>
