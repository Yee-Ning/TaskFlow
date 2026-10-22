<script setup lang="ts">
import { ref, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { ArrowLeft, User, Lock, Key } from '@element-plus/icons-vue'
import { authApi } from '../api/database'

const router = useRouter()
const step = ref(1) // 1: 输入用户名, 2: 验证问题, 3: 重置密码
const loading = ref(false)

const form = reactive({
  username: '',
  question: '',
  answer: '',
  newPassword: '',
  confirmPassword: '',
})

async function checkUsername() {
  if (!form.username) return
  loading.value = true
  try {
    const res = await authApi.getSecurityQuestion(form.username)
    if (res.success && res.question) {
      form.question = res.question
      step.value = 2
    } else {
      ElMessage.error(res.message || '该账号未设置安全问题，无法找回密码')
    }
  } catch {
    ElMessage.error('查询失败，请重试')
  } finally {
    loading.value = false
  }
}

async function verifyAnswer() {
  if (!form.answer) {
    ElMessage.warning('请输入答案')
    return
  }
  // 这里不真正验证答案，而是直接进入重置步骤（因为 resetPassword 接口是一次性验证并重置的）
  // 或者我们可以设计更严谨的流程，但目前的后端接口 resetPassword 直接接收答案和新密码。
  // 所以在步骤 2 用户只输入答案，点击“下一步”时，其实还是留在前端，或者我们可以提前把新密码框显示出来。
  // 为了体验更好，我们将步骤 2 和 3 合并：显示问题 -> 输入答案 -> 输入新密码 -> 提交

  // 不过为了分步引导，我们可以在步骤 2 把 答案 和 新密码 一起填了。
  step.value = 3
}

async function handleReset() {
  if (!form.newPassword || !form.confirmPassword) {
    ElMessage.warning('请输入新密码')
    return
  }
  if (form.newPassword !== form.confirmPassword) {
    ElMessage.warning('两次密码不一致')
    return
  }

  loading.value = true
  try {
    const res = await authApi.resetPassword({
      username: form.username,
      answer: form.answer,
      newPassword: form.newPassword
    })
    if (res.success) {
      ElMessage.success('密码重置成功，请登录')
      router.push('/login')
    } else {
      ElMessage.error(res.message || '重置失败') // 如果是答案错误，后端会返回相应消息
      if (res.message?.includes('答案')) {
        step.value = 2 // 回退以便修改答案
      }
    }
  } catch {
    ElMessage.error('重置失败')
  } finally {
    loading.value = false
  }
}

function goBack() {
  if (step.value > 1) {
    step.value--
  } else {
    router.push('/login')
  }
}
</script>

<template>
  <div class="auth-page">
    <div class="auth-card">
      <div class="auth-header">
        <h2 class="auth-title">找回密码</h2>
        <p class="auth-subtitle">通过安全问题重置你的密码</p>
      </div>

      <div class="auth-body">

        <!-- 步骤 1：输入用户名 -->
        <div v-if="step === 1" class="step-content">
          <div class="form-item">
            <el-input
              v-model="form.username"
              placeholder="请输入你的用户名"
              :prefix-icon="User"
              size="large"
              @keyup.enter="checkUsername"
            />
          </div>
          <el-button
            type="primary"
            size="large"
            class="submit-btn"
            :loading="loading"
            @click="checkUsername"
          >
            下一步
          </el-button>
        </div>

        <!-- 步骤 2：验证安全问题 & 设置新密码 -->
        <div v-if="step === 2" class="step-content">
          <div class="security-question-box">
            <span class="label">安全问题：</span>
            <p class="question-text">{{ form.question }}</p>
          </div>

          <div class="form-item">
            <label class="input-label">验证答案</label>
            <el-input
              v-model="form.answer"
              placeholder="请输入答案"
              :prefix-icon="Key"
              size="large"
            />
          </div>

          <div class="form-item">
            <label class="input-label">设置新密码</label>
            <el-input
              v-model="form.newPassword"
              type="password"
              placeholder="新密码"
              :prefix-icon="Lock"
              size="large"
              show-password
            />
          </div>
          <div class="form-item">
            <el-input
              v-model="form.confirmPassword"
              type="password"
              placeholder="确认新密码"
              :prefix-icon="Lock"
              size="large"
              show-password
            />
          </div>

          <el-button
            type="primary"
            size="large"
            class="submit-btn"
            :loading="loading"
            @click="handleReset"
          >
            重置密码
          </el-button>
        </div>

        <div class="auth-footer">
          <el-button link @click="router.push('/login')">返回登录</el-button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.auth-page {
  height: 100vh;
  width: 100vw;
  background: #f5f5f7;
  display: flex;
  justify-content: center;
  align-items: center;
}

.auth-card {
  width: 400px;
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(20px);
  border-radius: 16px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.1);
  padding: 40px;
  text-align: center;
}

.auth-title {
  font-size: 24px;
  font-weight: 600;
  margin-bottom: 8px;
  color: #1d1d1f;
}

.auth-subtitle {
  font-size: 14px;
  color: #86868b;
  margin-bottom: 30px;
}

.form-item {
  margin-bottom: 20px;
  text-align: left;
}

.input-label {
  display: block;
  font-size: 13px;
  color: #333;
  margin-bottom: 6px;
  font-weight: 500;
}

.submit-btn {
  width: 100%;
  border-radius: 8px;
  font-weight: 500;
  font-size: 15px;
  background: #007AFF;
}

.auth-footer {
  margin-top: 20px;
}

.security-question-box {
  background: #f0f8ff;
  border: 1px solid #e0e0e0;
  padding: 12px;
  border-radius: 8px;
  margin-bottom: 24px;
  text-align: left;
}
.security-question-box .label {
  font-size: 12px;
  color: #666;
  display: block;
  margin-bottom: 4px;
}
.security-question-box .question-text {
  font-size: 15px;
  font-weight: 500;
  color: #333;
  margin: 0;
}
</style>
