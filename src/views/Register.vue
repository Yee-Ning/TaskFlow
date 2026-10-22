<script setup lang="ts">
import { ref, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { useStore } from 'vuex'
import { User, Lock, Avatar } from '@element-plus/icons-vue'

const store = useStore()
const router = useRouter()

const formRef = ref()
const loading = ref(false)
const errorMsg = ref('')

const registerForm = reactive({
  username: '',
  nickname: '',
  password: '',
  confirmPassword: '',
})

/** 确认密码的自定义验证 */
const validateConfirm = (_rule: any, value: string, callback: any) => {
  if (value !== registerForm.password) {
    callback(new Error('两次密码不一致'))
  } else {
    callback()
  }
}

const rules = {
  username: [
    { required: true, message: '请输入用户名', trigger: 'blur' },
    { min: 2, max: 20, message: '长度在 2 到 20 个字符之间', trigger: 'blur' },
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { min: 6, max: 30, message: '密码长度在 6 到 30 个字符之间', trigger: 'blur' },
  ],
  confirmPassword: [
    { required: true, message: '请再次输入密码', trigger: 'blur' },
    { validator: validateConfirm, trigger: 'blur' },
  ],
}

async function handleRegister() {
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
    const result = await store.dispatch('user/register', {
      username: registerForm.username,
      password: registerForm.password,
      nickname: registerForm.nickname || undefined,
    })
    if (result.success) {
      router.push('/')
    } else {
      errorMsg.value = result.message || '注册失败'
    }
  } catch {
    errorMsg.value = '注册出错，请重试'
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

    <!-- 注册卡片 -->
    <div class="auth-window">
      <!-- 窗口控制点 -->
      <div class="window-controls">
        <div class="control-dot close"></div>
        <div class="control-dot minimize"></div>
        <div class="control-dot maximize"></div>
      </div>

      <!-- Logo 区域 -->
      <div class="auth-header">
        <div class="logo-icon">🚀</div>
        <h1 class="app-name">创建账号</h1>
        <p class="app-desc">开始你的高效任务管理之旅</p>
      </div>

      <!-- 表单 -->
      <div class="auth-body">
        <el-form
          ref="formRef"
          :model="registerForm"
          :rules="rules"
          label-position="top"
          hide-required-asterisk
          @submit.prevent="handleRegister"
        >
          <el-form-item prop="username">
            <div class="input-wrapper">
              <el-icon class="input-icon"><User /></el-icon>
              <input
                v-model="registerForm.username"
                type="text"
                placeholder="用户名"
                class="glass-input"
                autocomplete="username"
              />
            </div>
          </el-form-item>

          <el-form-item>
            <div class="input-wrapper">
              <el-icon class="input-icon"><Avatar /></el-icon>
              <input
                v-model="registerForm.nickname"
                type="text"
                placeholder="昵称（选填）"
                class="glass-input"
              />
            </div>
          </el-form-item>

          <el-form-item prop="password">
            <div class="input-wrapper">
              <el-icon class="input-icon"><Lock /></el-icon>
              <input
                v-model="registerForm.password"
                type="password"
                placeholder="密码（至少 6 位）"
                class="glass-input"
                autocomplete="new-password"
              />
            </div>
          </el-form-item>

          <el-form-item prop="confirmPassword">
            <div class="input-wrapper">
              <el-icon class="input-icon"><Lock /></el-icon>
              <input
                v-model="registerForm.confirmPassword"
                type="password"
                placeholder="确认密码"
                class="glass-input"
                autocomplete="new-password"
                @keyup.enter="handleRegister"
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
            <span v-if="!loading">创建账号</span>
            <span v-else class="btn-loading">
              <span class="dot-pulse"></span>
            </span>
          </button>
        </el-form>
      </div>

      <!-- 底部链接 -->
      <div class="auth-footer">
        <span>已有账号？</span>
        <router-link to="/login" class="link">返回登录</router-link>
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
  background: radial-gradient(circle, rgba(88, 86, 214, 0.12) 0%, transparent 70%);
  top: -80px;
  right: -100px;
  animation: float 9s ease-in-out infinite;
}
.glow-2 {
  width: 350px;
  height: 350px;
  background: radial-gradient(circle, rgba(52, 199, 89, 0.1) 0%, transparent 70%);
  bottom: -60px;
  left: -80px;
  animation: float 11s ease-in-out infinite reverse;
}
.glow-3 {
  width: 200px;
  height: 200px;
  background: radial-gradient(circle, rgba(255, 149, 0, 0.08) 0%, transparent 70%);
  top: 40%;
  left: 15%;
  animation: float 13s ease-in-out infinite 1s;
}

@keyframes float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-30px); }
}

/* ==================== 注册窗口 ==================== */
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
  padding: 28px 40px 24px;
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
  margin-bottom: 20px;
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
  margin-bottom: 24px;
}
.logo-icon {
  font-size: 44px;
  margin-bottom: 10px;
  animation: breathe 3s ease-in-out infinite;
}
@keyframes breathe {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.06); }
}
.app-name {
  font-size: 24px;
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
  margin-bottom: 16px;
}

/* 隐藏 el-form-item 默认样式 */
.auth-body :deep(.el-form-item) {
  margin-bottom: 14px;
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
  border-color: rgba(88, 86, 214, 0.4);
  box-shadow: 0 0 0 3px rgba(88, 86, 214, 0.08);
}
.input-icon {
  color: rgba(0, 0, 0, 0.3);
  font-size: 16px;
  flex-shrink: 0;
  transition: color 0.25s;
}
.input-wrapper:focus-within .input-icon {
  color: #5856D6;
}
.glass-input {
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  padding: 12px 12px;
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
  margin-bottom: 14px;
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

/* ==================== 注册按钮 ==================== */
.auth-btn {
  width: 100%;
  padding: 13px;
  border: none;
  border-radius: 14px;
  background: linear-gradient(135deg, #5856D6 0%, #AF52DE 100%);
  color: #fff;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.25, 0.1, 0.25, 1);
  position: relative;
  overflow: hidden;
  letter-spacing: 2px;
  font-family: inherit;
  margin-top: 2px;
}
.auth-btn::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, rgba(255,255,255,0.2) 0%, transparent 100%);
  opacity: 0;
  transition: opacity 0.3s;
}
.auth-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 6px 20px rgba(88, 86, 214, 0.3);
}
.auth-btn:hover::before {
  opacity: 1;
}
.auth-btn:active:not(:disabled) {
  transform: translateY(0);
  box-shadow: 0 2px 8px rgba(88, 86, 214, 0.2);
}
.auth-btn:disabled {
  opacity: 0.7;
  cursor: not-allowed;
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
  background: rgba(255, 255, 255, 0.8);
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
  color: #5856D6;
  text-decoration: none;
  font-weight: 500;
  margin-left: 4px;
  transition: color 0.2s;
}
.link:hover {
  color: #AF52DE;
}
</style>
