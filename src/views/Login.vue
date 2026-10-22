<script setup lang="ts">
import { ref, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { useStore } from 'vuex'
import { User, Lock } from '@element-plus/icons-vue'

const store = useStore()
const router = useRouter()

const formRef = ref()
const loading = ref(false)
const errorMsg = ref('')

const loginForm = reactive({
  username: '',
  password: '',
})

const rules = {
  username: [
    { required: true, message: '请输入用户名', trigger: 'blur' },
    { min: 2, max: 20, message: '用户名长度在 2 到 20 个字符之间', trigger: 'blur' },
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { min: 6, max: 30, message: '密码长度在 6 到 30 个字符之间', trigger: 'blur' },
  ],
}

async function handleLogin() {
  if (!formRef.value) return
  try {
    await formRef.value.validate()
  } catch {
    // 验证失败，el-form-item 会自动显示错误提示
    return
  }
  loading.value = true
  errorMsg.value = ''
  try {
    const result = await store.dispatch('user/login', {
      username: loginForm.username,
      password: loginForm.password,
    })
    if (result.success) {
      router.push('/')
    } else {
      errorMsg.value = result.message || '登录失败'
    }
  } catch {
    errorMsg.value = '登录出错，请重试'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="auth-desktop">
    <!-- 装饰光晕 -->
    <div class="glow glow-1"></div>
    <div class="glow glow-2"></div>
    <div class="glow glow-3"></div>

    <!-- 登录卡片 -->
    <div class="auth-window">
      <!-- 窗口控制点 -->
      <div class="window-controls">
        <div class="control-dot close"></div>
        <div class="control-dot minimize"></div>
        <div class="control-dot maximize"></div>
      </div>

      <!-- Logo 区域 -->
      <div class="auth-header">
        <div class="logo-icon">✅</div>
        <h1 class="app-name">TaskFlow</h1>
        <p class="app-desc">个人任务管理 · 让每一天都井然有序</p>
      </div>

      <!-- 表单 -->
      <div class="auth-body">
        <el-form
          ref="formRef"
          :model="loginForm"
          :rules="rules"
          label-position="top"
          hide-required-asterisk
          @submit.prevent="handleLogin"
        >
          <el-form-item prop="username">
            <div class="input-wrapper">
              <el-icon class="input-icon"><User /></el-icon>
              <input
                v-model="loginForm.username"
                type="text"
                placeholder="用户名"
                class="glass-input"
                autocomplete="username"
              />
            </div>
          </el-form-item>

          <el-form-item prop="password">
            <div class="input-wrapper">
              <el-icon class="input-icon"><Lock /></el-icon>
              <input
                v-model="loginForm.password"
                type="password"
                placeholder="密码"
                class="glass-input"
                autocomplete="current-password"
                @keyup.enter="handleLogin"
              />
            </div>
          </el-form-item>

          <!-- 错误提示 -->
          <Transition name="shake">
            <div v-if="errorMsg" class="error-tip">
              {{ errorMsg }}
            </div>
          </Transition>

          <button
            type="submit"
            class="auth-btn"
            :class="{ loading }"
            :disabled="loading"
          >
            <span v-if="!loading">登  录</span>
            <span v-else class="btn-loading">
              <span class="dot-pulse"></span>
            </span>
          </button>
        </el-form>
      </div>

      <!-- 底部链接 -->
      <div class="auth-footer">
        <span>还没有账号？</span>
        <router-link to="/register" class="link">立即注册</router-link>
        <span class="divider">|</span>
        <router-link to="/forgot-password" class="link">忘记密码</router-link>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ==================== 全屏背景 ==================== */
.auth-desktop {
  width: 100vw;
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: radial-gradient(circle at 50% 50%, #ffffff 0%, #eef1f5 100%);
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Rounded", "SF Pro Text",
    "Helvetica Neue", Helvetica, "PingFang SC", sans-serif;
  overflow: hidden;
  position: relative;
}

/* 装饰光晕 */
.glow {
  position: absolute;
  border-radius: 50%;
  filter: blur(80px);
  opacity: 0.5;
  pointer-events: none;
}
.glow-1 {
  width: 400px;
  height: 400px;
  background: radial-gradient(circle, rgba(0, 122, 255, 0.12) 0%, transparent 70%);
  top: -80px;
  left: -100px;
  animation: float 8s ease-in-out infinite;
}
.glow-2 {
  width: 350px;
  height: 350px;
  background: radial-gradient(circle, rgba(88, 86, 214, 0.1) 0%, transparent 70%);
  bottom: -60px;
  right: -80px;
  animation: float 10s ease-in-out infinite reverse;
}
.glow-3 {
  width: 200px;
  height: 200px;
  background: radial-gradient(circle, rgba(52, 199, 89, 0.08) 0%, transparent 70%);
  top: 50%;
  right: 20%;
  animation: float 12s ease-in-out infinite 2s;
}

@keyframes float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-30px); }
}

/* ==================== 登录窗口 ==================== */
.auth-window {
  width: 420px;
  background: rgba(255, 255, 255, 0.55);
  backdrop-filter: blur(40px) saturate(180%);
  -webkit-backdrop-filter: blur(40px) saturate(180%);
  border-radius: 24px;
  box-shadow:
    0 20px 60px rgba(0, 0, 0, 0.08),
    0 0 0 1px rgba(255, 255, 255, 0.6) inset;
  border: 1px solid rgba(255, 255, 255, 0.5);
  padding: 32px 40px 28px;
  position: relative;
  z-index: 1;
  animation: windowIn 0.6s cubic-bezier(0.16, 1, 0.3, 1) both;
}

@keyframes windowIn {
  0% {
    opacity: 0;
    transform: scale(0.92) translateY(20px);
  }
  100% {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

/* 窗口控制点 */
.window-controls {
  display: flex;
  gap: 8px;
  margin-bottom: 28px;
}
.control-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.15);
}
.close { background: #FF5F57; border: 1px solid rgba(0, 0, 0, 0.06); }
.minimize { background: #FEBC2E; border: 1px solid rgba(0, 0, 0, 0.06); }
.maximize { background: #28C840; border: 1px solid rgba(0, 0, 0, 0.06); }

/* ==================== Logo 区域 ==================== */
.auth-header {
  text-align: center;
  margin-bottom: 32px;
}
.logo-icon {
  font-size: 48px;
  margin-bottom: 12px;
  animation: breathe 3s ease-in-out infinite;
}
@keyframes breathe {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.06); }
}
.app-name {
  font-size: 26px;
  font-weight: 700;
  color: #1d1d1f;
  letter-spacing: -0.5px;
  margin: 0 0 6px 0;
}
.app-desc {
  font-size: 13px;
  color: rgba(0, 0, 0, 0.45);
  margin: 0;
  font-weight: 400;
}

/* ==================== 表单区域 ==================== */
.auth-body {
  margin-bottom: 20px;
}

/* 隐藏 el-form-item 默认样式 */
.auth-body :deep(.el-form-item) {
  margin-bottom: 16px;
}
.auth-body :deep(.el-form-item__content) {
  line-height: normal;
}
.auth-body :deep(.el-form-item__error) {
  font-size: 11px;
  padding-top: 4px;
  color: #FF3B30;
}

/* 输入框容器 */
.input-wrapper {
  display: flex;
  align-items: center;
  width: 100%;
  background: rgba(0, 0, 0, 0.03);
  border: 1px solid rgba(0, 0, 0, 0.06);
  border-radius: 12px;
  padding: 0 16px;
  transition: all 0.25s ease;
}
.input-wrapper:focus-within {
  background: rgba(255, 255, 255, 0.7);
  border-color: rgba(0, 122, 255, 0.4);
  box-shadow: 0 0 0 3px rgba(0, 122, 255, 0.08);
}
.input-icon {
  color: rgba(0, 0, 0, 0.3);
  font-size: 16px;
  flex-shrink: 0;
  transition: color 0.25s;
}
.input-wrapper:focus-within .input-icon {
  color: #007AFF;
}
.glass-input {
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  padding: 14px 12px;
  font-size: 14px;
  color: #1d1d1f;
  font-family: inherit;
}
.glass-input::placeholder {
  color: rgba(0, 0, 0, 0.3);
}

/* 错误提示 */
.error-tip {
  background: rgba(255, 59, 48, 0.08);
  color: #FF3B30;
  font-size: 12px;
  padding: 10px 14px;
  border-radius: 10px;
  margin-bottom: 16px;
  text-align: center;
  border: 1px solid rgba(255, 59, 48, 0.12);
}

/* 抖动动画 */
.shake-enter-active {
  animation: shake 0.4s ease;
}
@keyframes shake {
  0%, 100% { transform: translateX(0); }
  20% { transform: translateX(-8px); }
  40% { transform: translateX(8px); }
  60% { transform: translateX(-5px); }
  80% { transform: translateX(5px); }
}

/* ==================== 登录按钮 ==================== */
.auth-btn {
  width: 100%;
  padding: 14px;
  border: 1px solid rgba(0,0,0,0.05);
  border-radius: 14px;
  background: #f5f5f7; /* 简约灰白 */
  color: #1d1d1f; /* 深色文字 */
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.25, 0.1, 0.25, 1);
  position: relative;
  overflow: hidden;
  letter-spacing: 2px;
  font-family: inherit;
  margin-top: 4px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.03);
}

.auth-btn:hover:not(:disabled) {
  background: #e5e5ea;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0,0,0,0.08);
}

.auth-btn:active:not(:disabled) {
  transform: translateY(0);
  background: #d1d1d6;
  box-shadow: 0 1px 2px rgba(0,0,0,0.05);
}

.auth-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  background: #f5f5f7;
}

/* 加载动画 */
.btn-loading {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 20px;
}
.dot-pulse {
  display: inline-flex;
  gap: 6px;
}
.dot-pulse::before,
.dot-pulse::after,
.dot-pulse {
  position: relative;
}
.dot-pulse::before,
.dot-pulse::after {
  content: '';
  display: inline-block;
  width: 8px;
  height: 8px;
  background: #86868b; /* 灰色圆点 */
  border-radius: 50%;
  animation: pulse 1.2s ease-in-out infinite;
}
.dot-pulse::before { animation-delay: 0s; }
.dot-pulse::after { animation-delay: 0.4s; }
@keyframes pulse {
  0%, 80%, 100% { transform: scale(0.6); opacity: 0.5; }
  40% { transform: scale(1); opacity: 1; }
}

/* ==================== 底部链接 ==================== */
.auth-footer {
  text-align: center;
  font-size: 13px;
  color: rgba(0, 0, 0, 0.4);
}
.link {
  color: #007AFF;
  text-decoration: none;
  font-weight: 500;
  margin-left: 4px;
  transition: color 0.2s;
}
.link:hover {
  color: #5856D6;
}
.link:active {
  color: #0051a8;
}
.divider {
  margin: 0 10px;
  color: #ccc;
  font-size: 12px;
}
</style>
