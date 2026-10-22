<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useStore } from 'vuex'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowLeft, Download, Upload, Key, Document, Delete, Search, FolderOpened } from '@element-plus/icons-vue'
import {
  backupApi, taskIOApi, shortcutApi, logApi,
  type ShortcutConfig, type LogFilter, type LogPage, type OperationLog
} from '../api/database'

const router = useRouter()
const store = useStore()
const userId = computed(() => store.getters['user/userId'] as number | null)

// ==================== Tabs ====================
const activeTab = ref('data')

// ==================== 数据管理 ====================
const dataLoading = ref(false)

async function handleBackup() {
  dataLoading.value = true
  try {
    const result = await backupApi.create(userId.value ?? undefined)
    if (result.success) {
      const sizeMB = result.fileSize ? (result.fileSize / 1024 / 1024).toFixed(2) : '未知'
      ElMessage.success(`备份成功，文件大小: ${sizeMB} MB`)
    } else if (result.error !== 'cancelled') {
      ElMessage.error(result.error || '备份失败')
    }
  } catch {
    ElMessage.error('备份操作失败')
  } finally {
    dataLoading.value = false
  }
}

async function handleRestore() {
  try {
    await ElMessageBox.confirm(
      '恢复数据将替换当前所有数据，建议先备份。确定继续？',
      '确认恢复',
      { confirmButtonText: '确定恢复', cancelButtonText: '取消', type: 'warning', customClass: 'macos-msg-box' }
    )
  } catch { return }

  dataLoading.value = true
  try {
    const result = await backupApi.restore(userId.value ?? undefined)
    if (result.success) {
      ElMessage.success('数据恢复成功，建议重启应用')
    } else if (result.error !== 'cancelled') {
      ElMessage.error(result.error || '恢复失败')
    }
  } catch {
    ElMessage.error('恢复操作失败')
  } finally {
    dataLoading.value = false
  }
}

async function handleExport() {
  if (!userId.value) return
  dataLoading.value = true
  try {
    const result = await taskIOApi.export(userId.value)
    if (result.success) {
      ElMessage.success(`导出成功，共 ${result.taskCount ?? 0} 条任务`)
    } else if (result.error !== 'cancelled') {
      ElMessage.error(result.error || '导出失败')
    }
  } catch {
    ElMessage.error('导出操作失败')
  } finally {
    dataLoading.value = false
  }
}

async function handleImport() {
  if (!userId.value) return
  dataLoading.value = true
  try {
    const result = await taskIOApi.import(userId.value)
    if (result.success) {
      const msg = `导入完成：成功 ${result.successCount} 条，失败 ${result.failCount} 条`
      if (result.failCount > 0) {
        ElMessage.warning(msg)
      } else {
        ElMessage.success(msg)
      }
    } else if (result.error !== 'cancelled') {
      ElMessage.error(result.error || '导入失败')
    }
  } catch {
    ElMessage.error('导入操作失败')
  } finally {
    dataLoading.value = false
  }
}

// ==================== 快捷键设置 ====================
const shortcuts = ref<ShortcutConfig[]>([])
const shortcutLoading = ref(false)
const recordingIndex = ref<number | null>(null)

async function loadShortcuts() {
  shortcutLoading.value = true
  try {
    shortcuts.value = await shortcutApi.getConfig()
  } catch {
    ElMessage.error('加载快捷键配置失败')
  } finally {
    shortcutLoading.value = false
  }
}

function startRecording(index: number) {
  recordingIndex.value = index
  window.addEventListener('keydown', handleKeyRecord)
}

function handleKeyRecord(e: KeyboardEvent) {
  e.preventDefault()
  e.stopPropagation()

  // 忽略单独的修饰键
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return

  const parts: string[] = []
  if (e.ctrlKey || e.metaKey) parts.push('CmdOrCtrl')
  if (e.shiftKey) parts.push('Shift')
  if (e.altKey) parts.push('Alt')

  let key = e.key.length === 1 ? e.key.toUpperCase() : e.key
  // 常见键名映射
  const keyMap: Record<string, string> = {
    'ArrowUp': 'Up', 'ArrowDown': 'Down', 'ArrowLeft': 'Left', 'ArrowRight': 'Right',
    'Escape': 'Escape', 'Enter': 'Enter', 'Backspace': 'Backspace', 'Delete': 'Delete',
    'Tab': 'Tab', ' ': 'Space',
  }
  if (keyMap[e.key]) key = keyMap[e.key]
  parts.push(key)

  const accelerator = parts.join('+')
  applyNewShortcut(accelerator)
}

async function applyNewShortcut(accelerator: string) {
  window.removeEventListener('keydown', handleKeyRecord)
  if (recordingIndex.value === null) return

  const idx = recordingIndex.value
  const item = shortcuts.value[idx]
  recordingIndex.value = null

  try {
    const conflict = await shortcutApi.checkConflict(accelerator, item.actionId)
    if (conflict) {
      ElMessage.warning(`快捷键冲突：已被「${conflict}」使用`)
      return
    }
    shortcuts.value[idx] = { ...item, accelerator }
    await shortcutApi.saveConfig(shortcuts.value)
    ElMessage.success('快捷键已更新')
  } catch {
    ElMessage.error('保存快捷键失败')
  }
}

function cancelRecording() {
  window.removeEventListener('keydown', handleKeyRecord)
  recordingIndex.value = null
}

// ==================== 操作日志 ====================
const logData = ref<OperationLog[]>([])
const logTotal = ref(0)
const logLoading = ref(false)
const logFilter = reactive({
  action: '',
  start_date: '',
  end_date: '',
  page: 1,
  page_size: 50,
})
const logDateRange = ref<[string, string] | null>(null)

const actionOptions = [
  { value: '', label: '全部' },
  { value: 'create', label: '创建' },
  { value: 'update', label: '更新' },
  { value: 'delete', label: '删除' },
  { value: 'complete', label: '完成' },
  { value: 'remind', label: '提醒' },
  { value: 'backup', label: '备份' },
  { value: 'restore', label: '恢复' },
  { value: 'import', label: '导入' },
  { value: 'export', label: '导出' },
]

async function loadLogs() {
  if (!userId.value) return
  logLoading.value = true
  try {
    const filter: LogFilter = {
      user_id: userId.value,
      page: logFilter.page,
      page_size: logFilter.page_size,
    }
    if (logFilter.action) filter.action = logFilter.action
    if (logDateRange.value && logDateRange.value.length === 2) {
      filter.start_date = logDateRange.value[0]
      filter.end_date = logDateRange.value[1]
    }
    const result: LogPage = await logApi.query(filter)
    logData.value = result.logs
    logTotal.value = result.total
  } catch {
    ElMessage.error('加载日志失败')
  } finally {
    logLoading.value = false
  }
}

function handleLogPageChange(page: number) {
  logFilter.page = page
  loadLogs()
}

function handleLogFilter() {
  logFilter.page = 1
  loadLogs()
}

async function handleCleanLogs() {
  if (!userId.value) return
  try {
    await ElMessageBox.confirm(
      '确定清理 30 天前的日志记录？此操作不可撤销。',
      '确认清理',
      { confirmButtonText: '清理', cancelButtonText: '取消', type: 'warning', customClass: 'macos-msg-box' }
    )
  } catch { return }

  try {
    const count = await logApi.clean(userId.value, 30)
    ElMessage.success(`已清理 ${count} 条日志`)
    loadLogs()
  } catch {
    ElMessage.error('清理日志失败')
  }
}

function formatAction(action: string): string {
  const map: Record<string, string> = {
    create: '创建', update: '更新', delete: '删除', complete: '完成',
    remind: '提醒', backup: '备份', restore: '恢复', import: '导入', export: '导出',
  }
  return map[action] || action
}

function formatTargetType(type: string): string {
  const map: Record<string, string> = {
    task: '任务', category: '分类', tag: '标签', reminder: '提醒', database: '数据库', file: '文件',
  }
  return map[type] || type
}

// ==================== Lifecycle ====================
onMounted(() => {
  if (!userId.value) {
    router.push('/login')
    return
  }
  loadShortcuts()
  loadLogs()
})

function goBack() {
  router.push('/')
}
</script>

<template>
  <div class="aux-page">
    <div class="aux-container">
      <!-- 侧边栏 -->
      <aside class="aux-sidebar">
        <div class="header">
          <button class="icon-btn back-btn" @click="goBack">
            <el-icon><ArrowLeft /></el-icon>
            返回
          </button>
          <div class="page-title">辅助功能</div>
        </div>
        <nav class="nav-menu">
          <button class="nav-item" :class="{ active: activeTab === 'data' }" @click="activeTab = 'data'">
            <el-icon :size="18"><Download /></el-icon>
            数据管理
          </button>
          <button class="nav-item" :class="{ active: activeTab === 'shortcut' }" @click="activeTab = 'shortcut'">
            <el-icon :size="18"><Key /></el-icon>
            快捷键设置
          </button>
          <button class="nav-item" :class="{ active: activeTab === 'log' }" @click="activeTab = 'log'">
            <el-icon :size="18"><Document /></el-icon>
            操作日志
          </button>
        </nav>
      </aside>

      <!-- 主内容区 -->
      <main class="aux-content">

        <!-- 数据管理 Tab -->
        <section v-if="activeTab === 'data'" class="tab-section">
          <h2 class="section-title">数据管理</h2>
          <p class="section-desc">备份、恢复数据库，或批量导入导出任务。</p>

          <div class="card-grid">
            <div class="action-card">
              <div class="card-icon backup">
                <el-icon :size="28"><Upload /></el-icon>
              </div>
              <div class="card-info">
                <h3>备份数据</h3>
                <p>将当前数据库完整备份到本地文件</p>
              </div>
              <el-button type="primary" :loading="dataLoading" @click="handleBackup">备份</el-button>
            </div>

            <div class="action-card">
              <div class="card-icon restore">
                <el-icon :size="28"><Download /></el-icon>
              </div>
              <div class="card-info">
                <h3>恢复数据</h3>
                <p>从备份文件恢复数据库（会替换当前数据）</p>
              </div>
              <el-button type="warning" :loading="dataLoading" @click="handleRestore">恢复</el-button>
            </div>

            <div class="action-card">
              <div class="card-icon export">
                <el-icon :size="28"><Document /></el-icon>
              </div>
              <div class="card-info">
                <h3>导出任务</h3>
                <p>将所有任务导出为 Excel 文件</p>
              </div>
              <el-button type="success" :loading="dataLoading" @click="handleExport">导出</el-button>
            </div>

            <div class="action-card">
              <div class="card-icon import">
                <el-icon :size="28"><FolderOpened /></el-icon>
              </div>
              <div class="card-info">
                <h3>导入任务</h3>
                <p>从 Excel 文件批量导入任务</p>
              </div>
              <el-button type="info" :loading="dataLoading" @click="handleImport">导入</el-button>
            </div>
          </div>
        </section>

        <!-- 快捷键设置 Tab -->
        <section v-if="activeTab === 'shortcut'" class="tab-section">
          <h2 class="section-title">快捷键设置</h2>
          <p class="section-desc">点击快捷键区域录入新的快捷键组合。</p>

          <div class="shortcut-list" v-loading="shortcutLoading">
            <div
              v-for="(item, index) in shortcuts"
              :key="item.actionId"
              class="shortcut-row"
            >
              <span class="shortcut-name">{{ item.actionName }}</span>
              <button
                class="shortcut-key-btn"
                :class="{ recording: recordingIndex === index }"
                @click="recordingIndex === index ? cancelRecording() : startRecording(index)"
              >
                {{ recordingIndex === index ? '请按下快捷键...' : item.accelerator }}
              </button>
            </div>
            <div v-if="shortcuts.length === 0 && !shortcutLoading" class="empty-hint">
              暂无快捷键配置
            </div>
          </div>
        </section>

        <!-- 操作日志 Tab -->
        <section v-if="activeTab === 'log'" class="tab-section">
          <h2 class="section-title">操作日志</h2>

          <div class="log-toolbar">
            <el-select v-model="logFilter.action" placeholder="操作类型" @change="handleLogFilter" style="width: 130px" clearable>
              <el-option v-for="opt in actionOptions" :key="opt.value" :label="opt.label" :value="opt.value" />
            </el-select>
            <el-date-picker
              v-model="logDateRange"
              type="daterange"
              range-separator="至"
              start-placeholder="开始日期"
              end-placeholder="结束日期"
              value-format="YYYY-MM-DD"
              @change="handleLogFilter"
              style="width: 280px"
            />
            <el-button @click="handleLogFilter">
              <el-icon><Search /></el-icon> 查询
            </el-button>
            <el-button type="danger" plain @click="handleCleanLogs">
              <el-icon><Delete /></el-icon> 清理旧日志
            </el-button>
          </div>

          <el-table :data="logData" v-loading="logLoading" stripe style="width: 100%" class="log-table">
            <el-table-column prop="created_at" label="时间" width="180" />
            <el-table-column prop="action" label="操作" width="100">
              <template #default="{ row }">
                <el-tag size="small" :type="row.action === 'delete' ? 'danger' : row.action === 'create' ? 'success' : 'info'">
                  {{ formatAction(row.action) }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="target_type" label="对象类型" width="100">
              <template #default="{ row }">{{ formatTargetType(row.target_type) }}</template>
            </el-table-column>
            <el-table-column prop="detail" label="详情" min-width="200" show-overflow-tooltip />
          </el-table>

          <div class="log-pagination" v-if="logTotal > logFilter.page_size">
            <el-pagination
              layout="prev, pager, next"
              :total="logTotal"
              :page-size="logFilter.page_size"
              :current-page="logFilter.page"
              @current-change="handleLogPageChange"
            />
          </div>
        </section>

      </main>
    </div>
  </div>
</template>

<style scoped>
.aux-page {
  height: 100vh;
  width: 100vw;
  background: #fbfbfd; /* iOS 浅色背景 */
  display: flex;
  justify-content: center;
  align-items: center;
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Helvetica Neue", Helvetica, Arial, sans-serif;
  color: #1d1d1f;
}

.aux-container {
  width: 90%;
  max-width: 1100px;
  height: 85vh;
  min-height: 600px;
  background: rgba(255, 255, 255, 0.65);
  backdrop-filter: blur(50px);
  -webkit-backdrop-filter: blur(50px);
  border-radius: 20px;
  box-shadow:
    0 0 0 1px rgba(0, 0, 0, 0.03),
    0 20px 40px rgba(0, 0, 0, 0.08); /* 弥散阴影 */
  display: flex;
  overflow: hidden;
}

/* ===== 侧边栏 ===== */
.aux-sidebar {
  width: 260px;
  background: rgba(245, 245, 247, 0.5);
  backdrop-filter: blur(20px);
  border-right: 1px solid rgba(0, 0, 0, 0.05);
  display: flex;
  flex-direction: column;
  padding: 20px 12px;
  flex-shrink: 0;
}

.header {
  padding: 0 12px 24px 12px;
}

.icon-btn.back-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: transparent;
  border: none;
  font-size: 15px;
  color: #007AFF;
  cursor: pointer;
  padding: 8px 0;
  margin-bottom: 2px;
  font-weight: 500;
  transition: opacity 0.2s;
}
.icon-btn.back-btn:hover {
  opacity: 0.8;
}

.page-title {
  font-size: 28px;
  font-weight: 700;
  color: #1d1d1f;
  margin-top: 8px;
  letter-spacing: -0.01em;
}

.nav-menu {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border: none;
  background: transparent;
  width: 100%;
  border-radius: 10px;
  text-align: left;
  font-size: 15px;
  font-weight: 500;
  color: #1d1d1f;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.25, 0.1, 0.25, 1);
}

.nav-item:hover {
  background: rgba(0, 0, 0, 0.04);
}

.nav-item.active {
  background: #007AFF;
  color: #fff;
  box-shadow: 0 4px 12px rgba(0, 122, 255, 0.3);
}

.nav-item .el-icon {
  transition: transform 0.2s;
}
.nav-item.active .el-icon {
  transform: scale(1.1);
}

/* ===== 主内容区 ===== */
.aux-content {
  flex: 1;
  padding: 40px 48px;
  overflow-y: auto;
  scroll-behavior: smooth;
}

.tab-section {
  max-width: 800px;
  margin: 0 auto;
  animation: fadeIn 0.4s ease-out;
}
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

.section-title {
  font-size: 24px;
  font-weight: 700;
  margin-bottom: 8px;
  color: #1d1d1f;
  letter-spacing: -0.01em;
}

.section-desc {
  font-size: 15px;
  color: #86868b;
  margin-bottom: 32px;
  line-height: 1.5;
}

/* ===== 数据管理卡片 ===== */
.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: 20px;
}

.action-card {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 20px;
  background: rgba(255, 255, 255, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.4);
  backdrop-filter: blur(20px);
  border-radius: 18px;
  transition: all 0.3s cubic-bezier(0.25, 0.1, 0.25, 1);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.03);
}

.action-card:hover {
  transform: translateY(-2px);
  background: rgba(255, 255, 255, 0.85);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
}

.card-icon {
  width: 56px;
  height: 56px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: #fff;
  font-size: 26px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}
.card-icon.backup { background: linear-gradient(135deg, #007AFF, #00C7BE); }
.card-icon.restore { background: linear-gradient(135deg, #FF9500, #FFCC00); }
.card-icon.export { background: linear-gradient(135deg, #34C759, #30D158); }
.card-icon.import { background: linear-gradient(135deg, #5856D6, #AF52DE); }

.card-info {
  flex: 1;
  min-width: 0;
}
.card-info h3 {
  font-size: 16px;
  font-weight: 600;
  color: #1d1d1f;
  margin-bottom: 4px;
}
.card-info p {
  font-size: 13px;
  color: #86868b;
  margin: 0;
  line-height: 1.4;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ===== 快捷键设置 ===== */
.shortcut-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  background: rgba(255, 255, 255, 0.5);
  border-radius: 16px;
  padding: 6px;
  border: 1px solid rgba(0,0,0,0.03);
}

.shortcut-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 2px 6px rgba(0,0,0,0.02);
  transition: transform 0.2s;
}
.shortcut-row:hover {
  transform: scale(1.005);
}

.shortcut-name {
  font-size: 15px;
  font-weight: 500;
  color: #1d1d1f;
}

.shortcut-key-btn {
  padding: 6px 12px;
  border-radius: 8px;
  border: 1px solid #e5e5ea;
  background: #f5f5f7;
  color: #1d1d1f;
  font-size: 13px;
  font-family: "SF Mono", "Menlo", monospace;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  min-width: 120px;
  text-align: center;
  box-shadow: 0 1px 2px rgba(0,0,0,0.05);
}
.shortcut-key-btn:hover {
  background: #fff;
  border-color: #007AFF;
  color: #007AFF;
}
.shortcut-key-btn.recording {
  border-color: #FF9500;
  color: #FF9500;
  background: #fff;
  box-shadow: 0 0 0 3px rgba(255, 149, 0, 0.2);
  animation: pulse 1.5s infinite;
}

@keyframes pulse {
  0% { box-shadow: 0 0 0 0 rgba(255, 149, 0, 0.4); }
  70% { box-shadow: 0 0 0 6px rgba(255, 149, 0, 0); }
  100% { box-shadow: 0 0 0 0 rgba(255, 149, 0, 0); }
}

/* ===== 操作日志 ===== */
.log-toolbar {
  display: flex;
  gap: 16px;
  margin-bottom: 24px;
  flex-wrap: wrap;
  align-items: center;
  padding: 16px;
  background: rgba(255,255,255,0.5);
  border-radius: 16px;
  border: 1px solid rgba(0,0,0,0.03);
}

.log-table {
  border-radius: 16px;
  overflow: hidden;
  box-shadow: 0 4px 12px rgba(0,0,0,0.03);
  --el-table-border-color: transparent;
  --el-table-header-bg-color: #f5f5f7;
  --el-table-row-hover-bg-color: #fbfbfd;
}

:deep(.el-table th.el-table__cell) {
  background-color: #f5f5f7;
  color: #86868b;
  font-weight: 600;
  border-bottom: 1px solid rgba(0,0,0,0.05);
}
:deep(.el-table td.el-table__cell) {
  border-bottom: 1px solid rgba(0,0,0,0.03);
  color: #1d1d1f;
}

.log-pagination {
  display: flex;
  justify-content: center;
  margin-top: 24px;
}

/* ===== Element Plus 覆盖 ===== */
:deep(.el-button) {
  border-radius: 10px;
  font-weight: 500;
}
:deep(.el-button--primary) {
  --el-button-bg-color: #007AFF;
  --el-button-border-color: #007AFF;
  --el-button-hover-bg-color: #006ce6;
  --el-button-hover-border-color: #006ce6;
}
:deep(.el-button--success) {
  --el-button-bg-color: #34C759;
  --el-button-border-color: #34C759;
}
:deep(.el-button--warning) {
  --el-button-bg-color: #FF9500;
  --el-button-border-color: #FF9500;
}
:deep(.el-input__wrapper), :deep(.el-select__wrapper) {
  border-radius: 10px;
  box-shadow: 0 0 0 1px rgba(0,0,0,0.1) inset;
}
:deep(.el-tag) {
  border-radius: 6px;
  border: none;
  font-weight: 500;
}
</style>
