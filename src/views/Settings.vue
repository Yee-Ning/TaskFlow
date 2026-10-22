<script setup lang="ts">
import { ref, reactive, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useStore } from 'vuex'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  ArrowLeft, User, Lock, Setting, Check, Camera, Moon, Sunny
} from '@element-plus/icons-vue'
import { userApi, authApi } from '../api/database'

const router = useRouter()
const store = useStore()
const currentUser = computed(() => store.state.user.currentUser)

// ==================== Tabs ====================
const activeTab = ref('profile')
const tabs = [
  { id: 'profile', label: '个人资料', icon: User },
  { id: 'security', label: '账号安全', icon: Lock },
  { id: 'preference', label: '通用设置', icon: Setting },
]

// ==================== Profile ====================
const profileForm = reactive({
  nickname: '',
  avatar: '',
})

const formattedAvatar = computed(() => {
  const path = profileForm.avatar
  if (!path) return ''
  if (path.startsWith('http') || path.startsWith('file://')) return path
  // Windows 路径补丁
  return `file:///${path.replace(/\\/g, '/')}`
})

async function loadProfile() {
  if (currentUser.value) {
    profileForm.nickname = currentUser.value.nickname
    profileForm.avatar = currentUser.value.avatar
  }
}

async function handleSaveProfile() {
  if (!currentUser.value) return
  try {
    const success = await store.dispatch('user/updateProfile', {
      nickname: profileForm.nickname
    })
    if (success) {
      ElMessage.success('个人资料已更新')
    } else {
      ElMessage.error('更新失败')
    }
  } catch (e: any) {
    ElMessage.error(e.message || '更新失败')
  }
}

async function handleUploadAvatar() {
  if (!currentUser.value) return
  try {
    const newAvatar = await userApi.saveAvatar(currentUser.value.id)
    if (newAvatar) {
      profileForm.avatar = newAvatar
      // Update store
      store.commit('user/UPDATE_USER_INFO', { avatar: newAvatar })
      ElMessage.success('头像已更新')
    }
  } catch {
    ElMessage.error('上传头像失败')
  }
}


// ==================== Security ====================
// --- 修改密码 ---
const passwordForm = reactive({
  oldPassword: '',
  newPassword: '',
  confirmPassword: '',
})

async function handleChangePassword() {
  if (passwordForm.newPassword !== passwordForm.confirmPassword) {
    ElMessage.warning('两次输入的新密码不一致')
    return
  }
  if (!currentUser.value) return

  try {
    const result = await authApi.changePassword({
      userId: currentUser.value.id,
      oldPassword: passwordForm.oldPassword,
      newPassword: passwordForm.newPassword
    })
    if (result.success) {
      ElMessage.success(result.message)
      passwordForm.oldPassword = ''
      passwordForm.newPassword = ''
      passwordForm.confirmPassword = ''
    } else {
      ElMessage.error(result.message)
    }
  } catch (e: any) {
    ElMessage.error(e.message || '修改密码失败')
  }
}

// --- 安全问题 ---
const securityForm = reactive({
  question: '',
  answer: '',
})
// 预设问题
const preQuestions = [
  '你的第一只宠物叫什么名字？',
  '你最喜欢的电影是哪一部？',
  '你的母亲的中间名是什么？',
  '你上小学的第一位老师姓什么？',
  '你的出生地是哪里？',
]

async function handleSetSecurityQuestion() {
  if (!currentUser.value) return
  if (!securityForm.question || !securityForm.answer) {
    ElMessage.warning('请填写完整的问题和答案')
    return
  }
  try {
    const result = await authApi.setSecurityQuestion({
      userId: currentUser.value.id,
      question: securityForm.question,
      answer: securityForm.answer
    })
    if (result.success) {
      ElMessage.success('安全问题已设置')
      securityForm.answer = '' // 清空敏感信息
    } else {
      ElMessage.error(result.message || '设置失败')
    }
  } catch {
    ElMessage.error('设置失败')
  }
}

// ==================== Preference ====================
const theme = computed({
  get: () => currentUser.value?.theme || 'light',
  set: (val) => {
    store.dispatch('user/updateProfile', { theme: val })
    // 这里简单处理，实际应用可能需要在 App.vue 监听变化应用样式
    document.documentElement.setAttribute('data-theme', val)
  }
})

// 自动退出设置 (模拟，仅保存在 localStorage，App.vue 读取)
const autoLogout = ref(localStorage.getItem('setting_auto_logout') === 'true')
function handleAutoLogoutChange(val: boolean) {
  localStorage.setItem('setting_auto_logout', String(val))
  ElMessage.success(val ? '已开启自动退出（10分钟无操作）' : '已关闭自动退出')
}

// ==================== Lifecycle ====================
onMounted(() => {
  if (!currentUser.value) {
    router.push('/login')
    return
  }
  loadProfile()
})

function goBack() {
  router.push('/')
}
</script>

<template>
  <div class="settings-page">
    <div class="settings-container">
      <!-- 侧边栏 -->
      <aside class="settings-sidebar">
        <div class="header">
          <button class="icon-btn back-btn" @click="goBack">
            <el-icon><ArrowLeft /></el-icon>
            返回
          </button>
          <div class="page-title">设置</div>
        </div>

        <nav class="nav-menu">
          <button
            v-for="tab in tabs"
            :key="tab.id"
            class="nav-item"
            :class="{ active: activeTab === tab.id }"
            @click="activeTab = tab.id"
          >
            <el-icon :size="18"><component :is="tab.icon" /></el-icon>
            {{ tab.label }}
          </button>
        </nav>
      </aside>

      <!-- 主内容区 -->
      <main class="settings-content">

        <!-- 个人资料 -->
        <section v-if="activeTab === 'profile'" class="setting-section">
          <h2 class="section-title">个人资料</h2>

          <div class="form-group avatar-group">
            <div class="avatar-preview">
              <img v-if="formattedAvatar" :src="formattedAvatar" class="avatar-img" />
              <div v-else class="avatar-placeholder">
                <el-icon :size="32"><User /></el-icon>
              </div>
              <div class="avatar-overlay" @click="handleUploadAvatar">
                <el-icon><Camera /></el-icon>
              </div>
            </div>
            <div class="avatar-desc">
              <h3>头像</h3>
              <p>点击上方图标更换头像，支持 JPG, PNG, WEBP</p>
            </div>
          </div>

          <div class="form-group">
            <label>昵称</label>
            <el-input v-model="profileForm.nickname" placeholder="输入你的昵称" />
          </div>

          <div class="form-actions">
            <el-button type="primary" @click="handleSaveProfile">保存修改</el-button>
          </div>
        </section>

        <!-- 账号安全 -->
        <section v-if="activeTab === 'security'" class="setting-section">
          <h2 class="section-title">账号安全</h2>

          <div class="sub-section">
            <h3 class="sub-title">修改密码</h3>
            <div class="form-group">
              <label>旧密码</label>
              <el-input v-model="passwordForm.oldPassword" type="password" show-password />
            </div>
            <div class="form-group">
              <label>新密码</label>
              <el-input v-model="passwordForm.newPassword" type="password" show-password />
            </div>
            <div class="form-group">
              <label>确认新密码</label>
              <el-input v-model="passwordForm.confirmPassword" type="password" show-password />
            </div>
            <div class="form-actions">
              <el-button type="primary" @click="handleChangePassword">修改密码</el-button>
            </div>
          </div>

          <div class="divider"></div>

          <div class="sub-section">
            <h3 class="sub-title">密码找回设置</h3>
            <p class="desc-text">设置安全问题，用于忘记密码时重置。</p>
            <div class="form-group">
              <label>安全问题</label>
              <el-select v-model="securityForm.question" placeholder="选择一个问题" style="width: 100%" allow-create filterable default-first-option>
                <el-option v-for="q in preQuestions" :key="q" :label="q" :value="q" />
              </el-select>
            </div>
            <div class="form-group">
              <label>答案</label>
              <el-input v-model="securityForm.answer" placeholder="输入问题的答案" type="password" show-password />
            </div>
            <div class="form-actions">
              <el-button type="primary" @click="handleSetSecurityQuestion">设置安全问题</el-button>
            </div>
          </div>
        </section>

        <!-- 通用设置 -->
        <section v-if="activeTab === 'preference'" class="setting-section">
          <h2 class="section-title">通用设置</h2>

          <div class="form-group row">
            <div class="label-box">
              <label>外观模式</label>
              <p class="desc-text">切换应用的亮色或暗色外观</p>
            </div>
            <el-radio-group v-model="theme">
              <el-radio-button label="light">
                <el-icon><Sunny /></el-icon> 浅色
              </el-radio-button>
              <el-radio-button label="dark">
                <el-icon><Moon /></el-icon> 深色
              </el-radio-button>
            </el-radio-group>
          </div>

          <div class="divider"></div>

          <div class="form-group row">
            <div class="label-box">
              <label>自动退出登录</label>
              <p class="desc-text">应用在后台闲置 10 分钟后自动退出</p>
            </div>
            <el-switch v-model="autoLogout" @change="handleAutoLogoutChange" />
          </div>
        </section>

      </main>
    </div>
  </div>
</template>

<style scoped>
.settings-page {
  height: 100vh;
  width: 100vw;
  background: var(--bg-deep);
  display: flex;
  justify-content: center;
  align-items: center;
}

.settings-container {
  width: 900px;
  height: 600px;
  background: var(--glass-bg);
  backdrop-filter: blur(20px);
  border-radius: 12px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.1);
  display: flex;
  overflow: hidden;
  border: 1px solid var(--glass-border);
}

/* 侧边栏 */
.settings-sidebar {
  width: 240px;
  background: var(--glass-bg-hover);
  border-right: 1px solid var(--glass-border);
  display: flex;
  flex-direction: column;
}

.header {
  padding: 20px;
  border-bottom: 1px solid var(--glass-border);
}

.icon-btn.back-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  background: transparent;
  border: none;
  font-size: 14px;
  color: #007AFF;
  cursor: pointer;
  padding: 0;
  margin-bottom: 12px;
}
.icon-btn.back-btn:hover {
  text-decoration: underline;
}

.page-title {
  font-size: 24px;
  font-weight: 600;
  color: var(--text-primary);
}

.nav-menu {
  flex: 1;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border: none;
  background: transparent;
  width: 100%;
  border-radius: 8px;
  text-align: left;
  font-size: 14px;
  color: var(--text-primary);
  cursor: pointer;
  transition: all 0.2s;
}
.nav-item:hover {
  background: var(--glass-bg-hover);
}
.nav-item.active {
  background: #007AFF;
  color: #fff;
}

/* 主内容区 */
.settings-content {
  flex: 1;
  padding: 40px;
  overflow-y: auto;
}

.setting-section {
  max-width: 480px;
  margin: 0 auto;
}

.section-title {
  font-size: 22px;
  font-weight: 600;
  margin-bottom: 30px;
  color: var(--text-primary);
}

.sub-title {
  font-size: 16px;
  font-weight: 500;
  margin-bottom: 16px;
  color: var(--text-primary);
}

.form-group {
  margin-bottom: 24px;
}
.form-group label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
  margin-bottom: 8px;
}
.desc-text {
  font-size: 13px;
  color: var(--text-muted);
  margin-bottom: 12px;
  margin-top: -4px;
}

.form-group.row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

/* 头像上传 */
.avatar-group {
  display: flex;
  align-items: center;
  gap: 20px;
  margin-bottom: 30px;
}
.avatar-preview {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  overflow: hidden;
  position: relative;
  border: 1px solid rgba(0, 0, 0, 0.1);
  background: #f0f0f0;
}
.avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.avatar-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #999;
}
.avatar-overlay {
  position: absolute;
  top: 0; left: 0; width: 100%; height: 100%;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  opacity: 0;
  transition: opacity 0.2s;
  cursor: pointer;
}
.avatar-preview:hover .avatar-overlay {
  opacity: 1;
}
.avatar-desc h3 {
  font-size: 16px;
  margin: 0 0 4px 0;
  color: var(--text-primary);
}
.avatar-desc p {
  font-size: 13px;
  color: var(--text-muted);
  margin: 0;
}

.divider {
  height: 1px;
  background: var(--glass-border);
  margin: 30px 0;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
}
</style>
