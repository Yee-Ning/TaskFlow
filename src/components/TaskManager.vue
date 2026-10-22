<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted, watch } from 'vue'
import { useStore } from 'vuex'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Plus, Delete, Calendar, Flag, Search, ArrowRight, Check,
  Edit, Close, Clock, TrendCharts, Filter, Paperclip, FolderOpened, Document, Picture, Setting, Bell, AlarmClock
} from '@element-plus/icons-vue'
import {
  taskApi, categoryApi, attachmentApi, tagApi, reminderApi,
  type Task, type CategoryWithStats, type UpdateTaskParams, type Attachment, type Tag,
  type Reminder, type ReminderWithTask, type CreateReminderParams
} from '../api/database'

// ==================== Store & Router ====================
const store = useStore()
const router = useRouter()
const userId = computed(() => store.getters['user/userId'] as number | null)
const nickname = computed(() => store.getters['user/nickname'] as string)
const currentUser = computed(() => store.getters['user/currentUser'])
const isAvatarError = ref(false)

// 监听头像变化重置错误状态
watch(() => currentUser.value?.avatar, () => {
  isAvatarError.value = false
})

const formattedAvatar = computed(() => {
  if (isAvatarError.value) return ''
  const path = currentUser.value?.avatar
  if (!path) return ''
  if (path.startsWith('http') || path.startsWith('file://')) return path
  return `file:///${path.replace(/\\/g, '/')}`
})

function handleAvatarError() {
  isAvatarError.value = true
}

// ==================== 视图任务类型 ====================
interface TaskView extends Task {
  completed: boolean
}

function toView(t: Task): TaskView {
  return { ...t, completed: t.status === 'done' }
}

// ==================== 响应式数据 ====================
const taskList = ref<TaskView[]>([])
const categories = ref<CategoryWithStats[]>([])
const tags = ref<Tag[]>([])
const loading = ref(false)

// 当前选中的分类筛选（null = 全部）
const activeCategory = ref<number | null>(null)

// 搜索
const searchVisible = ref(false)
const searchKeyword = ref('')

// 筛选栏
const filterVisible = ref(false)
const filterPriority = ref<string>('')
const filterStatus = ref<string>('')
const filterDeadlineRange = ref<[string, string] | null>(null)

// 新增/编辑任务弹窗
const dialogVisible = ref(false)
const isEditMode = ref(false)
const editingTaskId = ref<number | null>(null)

// 任务详情面板
const detailVisible = ref(false)
const selectedTask = ref<TaskView | null>(null)
const detailProgress = ref(0)

// 表单数据
const taskForm = reactive({
  name: '',
  priority: 'medium' as 'high' | 'medium' | 'low',
  deadline: '',
  category_id: null as number | null,
  description: '',
  estimated_time: 0,
  tag_ids: [] as number[],
})

const formRef = ref()

const rules = {
  name: [
    { required: true, message: '请输入任务名称', trigger: 'blur' },
    { min: 2, max: 50, message: '长度在 2 到 50 个字符之间', trigger: 'blur' },
  ],
}

// ==================== 统计信息 ====================
const totalTasks = computed(() => taskList.value.length)
const completedTasks = computed(() => taskList.value.filter(t => t.completed).length)

// ==================== 优先级映射 ====================
const priorityMap = {
  high: { label: '高', type: 'danger' as const },
  medium: { label: '中', type: 'warning' as const },
  low: { label: '低', type: 'success' as const },
}

const statusMap = {
  todo: { label: '待办', color: '#8E8E93' },
  in_progress: { label: '进行中', color: '#007AFF' },
  done: { label: '已完成', color: '#34C759' },
}

// ==================== 数据加载 ====================

/** 加载任务列表 */
async function loadTasks() {
  if (!userId.value) return
  loading.value = true
  try {
    const filter: any = { user_id: userId.value }
    if (activeCategory.value !== null) {
      filter.category_id = activeCategory.value
    }
    if (searchKeyword.value.trim()) {
      filter.keyword = searchKeyword.value.trim()
    }
    if (filterPriority.value) {
      filter.priority = filterPriority.value
    }
    if (filterStatus.value) {
      filter.status = filterStatus.value
    }
    if (filterDeadlineRange.value && filterDeadlineRange.value.length === 2) {
      filter.deadline_start = filterDeadlineRange.value[0]
      filter.deadline_end = filterDeadlineRange.value[1]
    }
    const tasks = await taskApi.getByFilter(filter)
    // 获取每个任务的标签
    const tasksWithTags = await Promise.all(tasks.map(async (t) => {
      try {
        const tags = await tagApi.getByTaskId(t.id)
        return { ...t, tags }
      } catch {
        return { ...t, tags: [] }
      }
    }))
    taskList.value = tasksWithTags.map(toView)
  } catch (e) {
    ElMessage.error('加载任务失败')
  } finally {
    loading.value = false
  }
}

/** 加载分类列表 */
async function loadCategories() {
  if (!userId.value) return
  try {
    categories.value = await categoryApi.getWithStats(userId.value)
  } catch {
    // 静默
  }
}

onMounted(() => {
  if (!userId.value) {
    router.push('/login')
    return
  }
  // 确保数据是最新的（尤其是头像）
  store.dispatch('user/fetchUserInfo')
  loadTasks()
  loadCategories()
  loadTags()
})

// ==================== 标签管理逻辑 ====================
async function loadTags() {
  if (!userId.value) return
  try {
    tags.value = await tagApi.getByUserId(userId.value)
  } catch {
    // 静默
  }
}

// 标签表单
const tagDialogVisible = ref(false)
const isTagEdit = ref(false)
const editingTagId = ref<number | null>(null)
const tagForm = reactive({ name: '', color: '#909399' })
const tagFormRef = ref()

const predefineColors = [
  '#ff4500', '#ff8c00', '#ffd700',
  '#90ee90', '#00ced1', '#1e90ff',
  '#c71585', '#909399',
]

function openCreateTagDialog() {
  isTagEdit.value = false
  editingTagId.value = null
  tagForm.name = ''
  tagForm.color = '#909399'
  tagDialogVisible.value = true
}

function openEditTagDialog(tag: Tag) {
  isTagEdit.value = true
  editingTagId.value = tag.id
  tagForm.name = tag.name
  tagForm.color = tag.color
  tagDialogVisible.value = true
}

async function handleTagSubmit() {
  if (!userId.value) return
  try {
    if (isTagEdit.value && editingTagId.value) {
      await tagApi.update(editingTagId.value, { name: tagForm.name, color: tagForm.color })
      ElMessage.success('标签已更新')
    } else {
      await tagApi.create({ user_id: userId.value, name: tagForm.name, color: tagForm.color })
      ElMessage.success('标签已创建')
    }
    tagDialogVisible.value = false
    loadTags()
  } catch {
    ElMessage.error(isTagEdit.value ? '更新失败' : '创建失败')
  }
}

async function handleDeleteTag(tag: Tag) {
  try {
    await ElMessageBox.confirm('确定删除该标签吗？', '确认删除', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      confirmButtonClass: 'el-button--danger',
      customClass: 'macos-msg-box'
    })
    await tagApi.delete(tag.id)
    ElMessage.success('标签已删除')
    loadTags()
    // 刷新任务列表以更新显示
    loadTasks()
  } catch {
    // cancel
  }
}

// ==================== 分类管理逻辑 ====================
// 分类表单
const categoryDialogVisible = ref(false)
const isCategoryEdit = ref(false)
const editingCategoryId = ref<number | null>(null)
const categoryForm = reactive({ name: '', icon: '📁', color: '#409EFF' })
const categoryFormRef = ref()

const emojiList = ['📁', '📅', '🏠', '💼', '🎓', '✈️', '🛒', '💪', '🎮', '💡', '🔥', '⭐']

function openCreateCategoryDialog() {
  isCategoryEdit.value = false
  editingCategoryId.value = null
  categoryForm.name = ''
  categoryForm.icon = '📁'
  categoryForm.color = '#409EFF'
  categoryDialogVisible.value = true
}

function openEditCategoryDialog(cat: CategoryWithStats) {
  isCategoryEdit.value = true
  editingCategoryId.value = cat.id
  categoryForm.name = cat.name
  categoryForm.icon = cat.icon
  categoryForm.color = cat.color
  categoryDialogVisible.value = true
}

async function handleCategorySubmit() {
  if (!userId.value) return
  try {
    if (isCategoryEdit.value && editingCategoryId.value) {
      await categoryApi.update(editingCategoryId.value, {
        name: categoryForm.name,
        icon: categoryForm.icon,
        color: categoryForm.color
      })
      ElMessage.success('分类已更新')
    } else {
      await categoryApi.create({
        user_id: userId.value,
        name: categoryForm.name,
        icon: categoryForm.icon,
        color: categoryForm.color
      })
      ElMessage.success('分类已创建')
    }
    categoryDialogVisible.value = false
    loadCategories()
  } catch {
    ElMessage.error(isCategoryEdit.value ? '更新失败' : '创建失败')
  }
}

async function handleDeleteCategory(cat: CategoryWithStats) {
  try {
    await ElMessageBox.confirm('确定删除该分类吗？分类下的任务将变为未分类。', '确认删除', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      confirmButtonClass: 'el-button--danger',
      customClass: 'macos-msg-box'
    })
    await categoryApi.delete(cat.id)
    ElMessage.success('分类已删除')
    loadCategories()
    if (activeCategory.value === cat.id) {
      activeCategory.value = null
      loadTasks()
    }
  } catch {
    // cancel
  }
}

// ==================== 弹窗方法 ====================

/** 打开新建弹窗 */
function openCreateDialog() {
  isEditMode.value = false
  editingTaskId.value = null
  taskForm.name = ''
  taskForm.priority = 'medium'
  taskForm.deadline = ''
  taskForm.category_id = activeCategory.value
  taskForm.description = ''
  taskForm.estimated_time = 0
  taskForm.tag_ids = []
  taskReminders.value = []
  showCustomReminder.value = false
  dialogVisible.value = true
}

/** 打开编辑弹窗 */
async function openEditDialog(task: TaskView) {
  isEditMode.value = true
  editingTaskId.value = task.id
  taskForm.name = task.name
  taskForm.priority = task.priority
  taskForm.deadline = task.deadline || ''
  taskForm.category_id = task.category_id
  taskForm.description = task.description || ''
  taskForm.estimated_time = task.estimated_time || 0

  // 加载已关联的标签
  try {
    const taskTags = await tagApi.getByTaskId(task.id)
    taskForm.tag_ids = taskTags.map(t => t.id)
  } catch {
    taskForm.tag_ids = []
  }

  // 加载已有提醒
  await loadTaskReminders(task.id)
  showCustomReminder.value = false

  dialogVisible.value = true
}

/** 提交表单（新建/编辑） */
async function handleSubmit() {
  if (!formRef.value || !userId.value) return
  try {
    await formRef.value.validate()
  } catch {
    return
  }
  try {
    // 提前将 Vue Proxy 数组转为普通数组
    const plainTagIds = [...taskForm.tag_ids]
    let tagSaveFailed = false

    if (isEditMode.value && editingTaskId.value) {
      // ========== 编辑模式 ==========
      await taskApi.update(editingTaskId.value, {
        name: taskForm.name,
        priority: taskForm.priority,
        deadline: taskForm.deadline || null,
        category_id: taskForm.category_id,
        description: taskForm.description,
        estimated_time: taskForm.estimated_time,
      })

      // 独立处理标签更新
      try {
        const result = await tagApi.setTaskTags(editingTaskId.value, plainTagIds)
        if (!result || !result.success) {
          tagSaveFailed = true
        }
      } catch (e) {
        console.error('标签更新失败:', e)
        tagSaveFailed = true
      }

      if (tagSaveFailed) {
        ElMessage.warning('任务更新成功，但标签保存失败')
      } else {
        ElMessage.success('任务已更新')
      }

      // 保存提醒
      if (taskReminders.value.length > 0) {
        await saveTaskReminders(editingTaskId.value)
      }

      // 如果详情面板打开的是这个任务，刷新详情
      if (selectedTask.value?.id === editingTaskId.value) {
        await refreshDetail(editingTaskId.value)
      }
    } else {
      // ========== 新建模式 ==========
      const created = await taskApi.create({
        user_id: userId.value!,
        name: taskForm.name,
        priority: taskForm.priority,
        deadline: taskForm.deadline || null,
        category_id: taskForm.category_id,
        description: taskForm.description,
        estimated_time: taskForm.estimated_time,
      })

      // 独立处理标签设置
      if (created && created.id && plainTagIds.length > 0) {
        try {
          const result = await tagApi.setTaskTags(created.id, plainTagIds)
          if (!result || !result.success) {
            tagSaveFailed = true
          }
        } catch (e) {
          console.error('标签设置失败:', e)
          tagSaveFailed = true
        }
      }

      if (tagSaveFailed) {
        ElMessage.warning('任务创建成功，但标签设置失败')
      } else {
        ElMessage.success('任务已创建')
      }

      // 保存提醒
      if (created && created.id && taskReminders.value.length > 0) {
        await saveTaskReminders(created.id)
      }
    }
    dialogVisible.value = false
    loadTasks()
    loadCategories()
    loadReminders()
  } catch (err) {
    console.error('提交失败:', err)
    ElMessage.error(isEditMode.value ? '更新任务失败' : '创建任务失败')
  }
}

// ==================== 任务操作 ====================

/** 切换完成状态 */
async function toggleStatus(row: TaskView) {
  try {
    const updated = await taskApi.toggleStatus(row.id)
    if (updated) {
      row.status = updated.status
      row.completed = updated.status === 'done'
      row.progress = updated.progress
      row.completed_at = updated.completed_at
      loadCategories()
      // 同步更新详情面板
      if (selectedTask.value?.id === row.id) {
        selectedTask.value = { ...row }
        detailProgress.value = row.progress
      }
    }
  } catch {
    ElMessage.error('更新状态失败')
  }
}

/** 修改任务状态为三态之一 */
async function changeStatus(task: TaskView, newStatus: 'todo' | 'in_progress' | 'done') {
  try {
    const params: UpdateTaskParams = { status: newStatus }
    if (newStatus === 'done') {
      params.progress = 100
    } else if (newStatus === 'todo') {
      params.progress = 0
    }
    const success = await taskApi.update(task.id, params)
    if (success) {
      ElMessage.success(`状态已更新为「${statusMap[newStatus].label}」`)
      loadTasks()
      loadCategories()
      if (selectedTask.value?.id === task.id) {
        await refreshDetail(task.id)
      }
    }
  } catch {
    ElMessage.error('更新状态失败')
  }
}

/** 删除任务 */
function handleDelete(row: TaskView) {
  ElMessageBox.confirm(
    '确定要删除这个任务吗？',
    '确认删除',
    {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      confirmButtonClass: 'el-button--danger',
      type: 'warning',
      customClass: 'macos-msg-box'
    }
  ).then(async () => {
    try {
      await taskApi.delete(row.id)
      ElMessage.success('任务已删除')
      // 如果详情面板打开的是这个任务，关闭面板
      if (selectedTask.value?.id === row.id) {
        closeDetail()
      }
      loadTasks()
      loadCategories()
    } catch {
      ElMessage.error('删除任务失败')
    }
  }).catch(() => {})
}

// ==================== 详情面板 ====================

const attachments = ref<Attachment[]>([])
const attachmentLoading = ref(false)

/** 打开任务详情 */
async function openDetail(task: TaskView) {
  selectedTask.value = { ...task }
  detailProgress.value = task.progress
  detailVisible.value = true
  await loadAttachments(task.id)
}

/** 关闭任务详情 */
function closeDetail() {
  detailVisible.value = false
  selectedTask.value = null
  attachments.value = []
}

/** 刷新详情面板数据 */
async function refreshDetail(taskId: number) {
  const task = await taskApi.getById(taskId)
  if (task) {
    const tv = toView(task)
    selectedTask.value = tv
    detailProgress.value = tv.progress
  }
}

// ==================== 附件管理 ====================

/** 加载附件列表 */
async function loadAttachments(taskId: number) {
  try {
    attachments.value = await attachmentApi.getByTaskId(taskId)
  } catch {
    attachments.value = []
  }
}

/** 上传附件 */
async function handleUploadAttachment() {
  if (!selectedTask.value) return
  try {
    const filePaths = await attachmentApi.selectFiles()
    if (!filePaths || filePaths.length === 0) return
    attachmentLoading.value = true
    await attachmentApi.save(selectedTask.value.id, filePaths)
    ElMessage.success(`已添加 ${filePaths.length} 个附件`)
    await loadAttachments(selectedTask.value.id)
  } catch {
    ElMessage.error('上传附件失败')
  } finally {
    attachmentLoading.value = false
  }
}

/** 删除附件 */
async function handleDeleteAttachment(att: Attachment) {
  try {
    await ElMessageBox.confirm(
      `确定删除附件「${att.file_name}」吗？`,
      '确认删除',
      { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' }
    )
    await attachmentApi.delete(att.id)
    ElMessage.success('附件已删除')
    if (selectedTask.value) {
      await loadAttachments(selectedTask.value.id)
    }
  } catch {
    // 用户取消
  }
}

/** 打开附件 */
async function handleOpenAttachment(att: Attachment) {
  try {
    await attachmentApi.open(att.file_path)
  } catch {
    ElMessage.error('打开文件失败')
  }
}

/** 格式化文件大小 */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** 判断是否为图片 */
function isImageFile(mimeType: string): boolean {
  return mimeType.startsWith('image/')
}

/** 获取文件图标 */
function getFileIconName(mimeType: string): string {
  if (mimeType.startsWith('image/')) return 'picture'
  return 'document'
}

/** 更新进度 */
async function handleProgressChange(val: number) {
  if (!selectedTask.value) return
  try {
    const params: UpdateTaskParams = { progress: val }
    // 进度为 100 时自动标记完成
    if (val === 100 && selectedTask.value.status !== 'done') {
      params.status = 'done'
    }
    // 进度从 100 改回时自动切回进行中
    if (val < 100 && selectedTask.value.status === 'done') {
      params.status = 'in_progress'
    }
    await taskApi.update(selectedTask.value.id, params)
    await refreshDetail(selectedTask.value.id)
    loadTasks()
    loadCategories()
  } catch {
    ElMessage.error('更新进度失败')
  }
}

/** 更新实际耗时 */
async function handleActualTimeChange(val: number) {
  if (!selectedTask.value) return
  try {
    await taskApi.update(selectedTask.value.id, { actual_time: val })
    await refreshDetail(selectedTask.value.id)
  } catch {
    ElMessage.error('更新耗时失败')
  }
}

// ==================== 筛选 & 搜索 ====================

function selectCategory(catId: number | null) {
  activeCategory.value = catId
  loadTasks()
}

function handleSearch() {
  loadTasks()
}

function toggleSearch() {
  searchVisible.value = !searchVisible.value
  if (!searchVisible.value) {
    searchKeyword.value = ''
    loadTasks()
  }
}

function toggleFilter() {
  filterVisible.value = !filterVisible.value
  if (!filterVisible.value) {
    clearFilter()
  }
}

function clearFilter() {
  filterPriority.value = ''
  filterStatus.value = ''
  filterDeadlineRange.value = null
  loadTasks()
}

function applyFilter() {
  loadTasks()
}

/** 退出登录 */
function handleLogout() {
  store.dispatch('user/logout')
  router.push('/login')
}

function disabledDate(time: Date): boolean {
  return time.getTime() < Date.now() - 86400000
}

/** 格式化分钟为可读时间 */
function formatMinutes(min: number): string {
  if (min <= 0) return '未设置'
  if (min < 60) return `${min} 分钟`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m > 0 ? `${h} 小时 ${m} 分钟` : `${h} 小时`
}

/** 格式化日期时间 */
function formatDate(dateStr: string | null): string {
  if (!dateStr) return '未设置'
  return dateStr.replace('T', ' ').substring(0, 16)
}

// ==================== 提醒管理模块 ====================

// ----- 提醒管理面板 -----
const reminderPanelVisible = ref(false)
const reminderTab = ref<'pending' | 'dismissed' | 'all'>('pending')
const reminderList = ref<ReminderWithTask[]>([])
const reminderLoading = ref(false)
const pendingReminderCount = ref(0)

/** 打开提醒管理面板 */
function openReminderPanel() {
  reminderPanelVisible.value = true
  detailVisible.value = false
  loadReminders()
}

/** 关闭提醒管理面板 */
function closeReminderPanel() {
  reminderPanelVisible.value = false
}

/** 加载提醒列表 */
async function loadReminders() {
  if (!userId.value) return
  reminderLoading.value = true
  try {
    const all = await reminderApi.getByUserId(userId.value)
    reminderList.value = all
    pendingReminderCount.value = all.filter(r => r.is_triggered === 0 && r.is_dismissed === 0).length
  } catch {
    reminderList.value = []
  } finally {
    reminderLoading.value = false
  }
}

/** 过滤后的提醒列表 */
const filteredReminders = computed(() => {
  const list = reminderList.value
  switch (reminderTab.value) {
    case 'pending':
      return list.filter(r => r.is_dismissed === 0)
    case 'dismissed':
      return list.filter(r => r.is_dismissed === 1)
    default:
      return list
  }
})

/** 标记提醒已处理 */
async function handleDismissReminder(reminder: ReminderWithTask) {
  try {
    await reminderApi.markDismissed(reminder.id)
    ElMessage.success('已标记为已处理')
    loadReminders()
  } catch {
    ElMessage.error('操作失败')
  }
}

/** 删除提醒 */
async function handleDeleteReminder(reminder: ReminderWithTask) {
  try {
    await ElMessageBox.confirm('确定删除该提醒吗？', '确认删除', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      confirmButtonClass: 'el-button--danger',
      customClass: 'macos-msg-box'
    })
    await reminderApi.delete(reminder.id)
    ElMessage.success('提醒已删除')
    loadReminders()
  } catch {
    // cancel
  }
}

/** 获取提醒状态文本 */
function getReminderStatus(r: ReminderWithTask): string {
  if (r.is_dismissed === 1) return '已处理'
  if (r.is_triggered === 1) return '已触发'
  return '等待中'
}

/** 获取提醒状态颜色 */
function getReminderStatusColor(r: ReminderWithTask): string {
  if (r.is_dismissed === 1) return '#34C759'
  if (r.is_triggered === 1) return '#FF9500'
  return '#007AFF'
}

/** 获取重复规则文本 */
function getRepeatLabel(rule: string | null): string {
  if (!rule) return '单次'
  const map: Record<string, string> = { daily: '每天', weekly: '每周', monthly: '每月' }
  return map[rule] || rule
}

// ----- 任务弹窗中的提醒设置 -----
interface ReminderItem {
  remind_at: string
  type: 'once' | 'repeat'
  repeat_rule: string | null
  label: string
}

const taskReminders = ref<ReminderItem[]>([])
const showCustomReminder = ref(false)
const customReminderTime = ref('')
const customReminderType = ref<'once' | 'repeat'>('once')
const customRepeatRule = ref<string | null>(null)

/** 添加快捷提醒 */
function addQuickReminder(offsetLabel: string, offsetMs: number) {
  if (!taskForm.deadline) {
    ElMessage.warning('请先设置截止日期')
    return
  }
  const deadlineDate = new Date(taskForm.deadline + ' 23:59:59')
  const remindDate = new Date(deadlineDate.getTime() - offsetMs)
  const now = new Date()
  if (remindDate <= now) {
    ElMessage.warning('提醒时间已过，请选择其他选项')
    return
  }
  const remindAt = formatDateTimeLocal(remindDate)
  if (taskReminders.value.some(r => r.remind_at === remindAt)) {
    ElMessage.info('该提醒已存在')
    return
  }
  taskReminders.value.push({
    remind_at: remindAt,
    type: 'once',
    repeat_rule: null,
    label: offsetLabel,
  })
}

/** 添加自定义提醒 */
function addCustomReminder() {
  if (!customReminderTime.value) {
    ElMessage.warning('请选择提醒时间')
    return
  }
  const remindAt = customReminderTime.value.replace('T', ' ')
  if (taskReminders.value.some(r => r.remind_at === remindAt)) {
    ElMessage.info('该提醒已存在')
    return
  }
  taskReminders.value.push({
    remind_at: remindAt,
    type: customReminderType.value,
    repeat_rule: customReminderType.value === 'repeat' ? customRepeatRule.value : null,
    label: customReminderType.value === 'repeat'
      ? `自定义(${getRepeatLabel(customRepeatRule.value)})`
      : '自定义',
  })
  customReminderTime.value = ''
  showCustomReminder.value = false
}

/** 移除一条提醒 */
function removeTaskReminder(index: number) {
  taskReminders.value.splice(index, 1)
}

/** 格式化 Date 对象为 YYYY-MM-DD HH:MM:SS */
function formatDateTimeLocal(d: Date): string {
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0') + ' ' +
    String(d.getHours()).padStart(2, '0') + ':' +
    String(d.getMinutes()).padStart(2, '0') + ':' +
    String(d.getSeconds()).padStart(2, '0')
}

/** 提交任务时保存提醒 */
async function saveTaskReminders(taskId: number) {
  for (const r of taskReminders.value) {
    try {
      await reminderApi.create({
        task_id: taskId,
        remind_at: r.remind_at,
        type: r.type,
        repeat_rule: r.repeat_rule,
      })
    } catch (e) {
      console.error('创建提醒失败:', e)
    }
  }
}

/** 编辑时加载任务已有提醒 */
async function loadTaskReminders(taskId: number) {
  try {
    const existing = await reminderApi.getByTaskId(taskId)
    taskReminders.value = existing.map(r => ({
      remind_at: r.remind_at,
      type: r.type,
      repeat_rule: r.repeat_rule,
      label: r.type === 'repeat' ? getRepeatLabel(r.repeat_rule) : '自定义',
    }))
  } catch {
    taskReminders.value = []
  }
}

// ----- 应用内通知弹窗 -----
interface AppNotification {
  id: number
  task_name: string
  task_priority: string
  remind_at: string
  visible: boolean
}
const appNotifications = ref<AppNotification[]>([])

function handleReminderTriggered(_event: any, data: any) {
  const notification: AppNotification = {
    id: data.id,
    task_name: data.task_name,
    task_priority: data.task_priority,
    remind_at: data.remind_at,
    visible: true,
  }
  appNotifications.value.push(notification)
  setTimeout(() => {
    dismissAppNotification(notification.id)
  }, 10000)
  loadReminders()
}

function dismissAppNotification(id: number) {
  const idx = appNotifications.value.findIndex(n => n.id === id)
  if (idx !== -1) {
    appNotifications.value[idx].visible = false
    setTimeout(() => {
      appNotifications.value = appNotifications.value.filter(n => n.id !== id)
    }, 300)
  }
}

async function handleAppNotificationAction(notification: AppNotification) {
  try {
    await reminderApi.markDismissed(notification.id)
    dismissAppNotification(notification.id)
    ElMessage.success('提醒已处理')
    loadReminders()
  } catch {
    ElMessage.error('操作失败')
  }
}

function getPriorityEmoji(priority: string): string {
  const map: Record<string, string> = { high: '🔴', medium: '🟡', low: '🟢' }
  return map[priority] || ''
}

// 注册 IPC 监听
const { ipcRenderer: ipc } = window as any

// ==================== 快捷键事件处理 ====================
function onShortcutCreateTask() {
  openCreateDialog()
}

function onShortcutCompleteTask() {
  // 如果详情面板打开了某个任务，标记该任务完成
  if (selectedTask.value && selectedTask.value.status !== 'done') {
    changeStatus(selectedTask.value, 'done')
  }
}

function onShortcutFilterTasks() {
  toggleFilter()
}

onMounted(() => {
  if (ipc && ipc.on) {
    ipc.on('reminder:triggered', handleReminderTriggered)
  }
  loadReminders()
  window.addEventListener('shortcut:create-task', onShortcutCreateTask)
  window.addEventListener('shortcut:complete-task', onShortcutCompleteTask)
  window.addEventListener('shortcut:filter-tasks', onShortcutFilterTasks)
})

onUnmounted(() => {
  if (ipc && ipc.off) {
    ipc.off('reminder:triggered', handleReminderTriggered)
  }
  window.removeEventListener('shortcut:create-task', onShortcutCreateTask)
  window.removeEventListener('shortcut:complete-task', onShortcutCompleteTask)
  window.removeEventListener('shortcut:filter-tasks', onShortcutFilterTasks)
})
</script>

<template>
  <div class="macos-desktop">
    <!-- 模拟 macOS 应用窗口 -->
    <div class="macos-window" :class="{ 'detail-open': detailVisible }">

      <!-- 侧边栏 -->
      <aside class="sidebar">
        <!-- 窗口控制 -->
        <div class="window-controls">
          <div class="control-dot close"></div>
          <div class="control-dot minimize"></div>
          <div class="control-dot maximize"></div>
        </div>

        <div class="sidebar-scroll">
          <div class="user-profile-header">
             <div class="user-avatar-mask">
                <img v-if="formattedAvatar" :src="formattedAvatar" class="user-avatar-img" />
                <div v-else class="user-avatar-text">{{ nickname?.[0]?.toUpperCase() || 'U' }}</div>
             </div>
             <div class="user-name-box">
                <span class="user-nickname">{{ nickname || 'Guest' }}</span>
                <span class="user-desc">今日专注</span>
             </div>
          </div>

          <!-- 全部任务 -->
          <div class="menu-item" :class="{ active: activeCategory === null }" @click="selectCategory(null)">
             <el-icon><Check /></el-icon>
             <span>全部任务</span>
             <span class="menu-badge" v-if="totalTasks">{{ totalTasks }}</span>
          </div>

          <div class="menu-spacer"></div>

          <!-- 动态分类列表 -->
          <div class="menu-label-row">
            <span class="menu-label">分类</span>
            <button class="icon-btn-small" @click.stop="openCreateCategoryDialog" title="新建分类">
              <el-icon><Plus /></el-icon>
            </button>
          </div>
          <div
            v-for="cat in categories" :key="cat.id"
            class="menu-item"
            :class="{ active: activeCategory === cat.id }"
            @click="selectCategory(cat.id)"
          >
            <span class="cat-icon">{{ cat.icon }}</span>
            <span class="cat-name">{{ cat.name }}</span>

            <div class="menu-actions">
              <button class="icon-btn-mini" @click.stop="openEditCategoryDialog(cat)">
                <el-icon><Edit /></el-icon>
              </button>
              <button class="icon-btn-mini danger" @click.stop="handleDeleteCategory(cat)">
                <el-icon><Delete /></el-icon>
              </button>
            </div>

            <span class="menu-badge" v-if="cat.pending_tasks">{{ cat.pending_tasks }}</span>
          </div>

          <div class="menu-spacer"></div>

          <!-- 标签列表 -->
          <div class="menu-label-row">
            <span class="menu-label">标签</span>
            <button class="icon-btn-small" @click.stop="openCreateTagDialog" title="新建标签">
              <el-icon><Plus /></el-icon>
            </button>
          </div>
          <div
            v-for="tag in tags" :key="tag.id"
            class="menu-item tag-item"
            @click="handleSearch"
          >
            <span class="tag-dot" :style="{ backgroundColor: tag.color }"></span>
            <span class="tag-name">{{ tag.name }}</span>
            <div class="menu-actions">
               <button class="icon-btn-mini" @click.stop="openEditTagDialog(tag)">
                 <el-icon><Edit /></el-icon>
               </button>
               <button class="icon-btn-mini danger" @click.stop="handleDeleteTag(tag)">
                 <el-icon><Delete /></el-icon>
               </button>
            </div>
          </div>
        </div>

        <!-- 提醒入口 -->
        <div class="menu-item" :class="{ active: reminderPanelVisible }" @click="openReminderPanel">
          <el-icon><Bell /></el-icon>
          <span>提醒</span>
          <span class="menu-badge reminder-badge" v-if="pendingReminderCount">{{ pendingReminderCount }}</span>
        </div>

        <div class="sidebar-footer">
          <div class="menu-item" @click="router.push('/statistics')">
            <el-icon><TrendCharts /></el-icon>
            <span>数据统计</span>
          </div>
          <div class="menu-item" @click="router.push('/auxiliary')">
            <el-icon><FolderOpened /></el-icon>
            <span>辅助功能</span>
          </div>
          <div class="menu-item" @click="router.push('/settings')">
            <el-icon><Setting /></el-icon>
            <span>设置</span>
          </div>
          <div class="menu-item" @click="handleLogout">
            <el-icon><ArrowRight /></el-icon>
            <span>退出登录</span>
          </div>
        </div>
      </aside>

      <!-- 主内容区 -->
      <main class="main-content">
        <!-- 头部 -->
        <header class="content-header">
          <div class="header-titles">
            <h2 class="app-title">待办事项</h2>
            <span class="app-subtitle">今日专注 · {{ completedTasks }}/{{ totalTasks }} 已完成</span>
          </div>
          <div class="header-actions">
             <button class="mac-pill-btn" @click="openCreateDialog">
               <el-icon><Plus /></el-icon> 新建任务
             </button>
             <button class="mac-pill-btn icon-only" @click="toggleFilter" :class="{ active: filterVisible }">
               <el-icon><Filter /></el-icon>
             </button>
             <button class="mac-pill-btn icon-only" @click="toggleSearch" :class="{ active: searchVisible }">
               <el-icon><Search /></el-icon>
             </button>
          </div>
        </header>

        <!-- 搜索栏 -->
        <Transition name="slide-fade">
          <div class="search-bar" v-if="searchVisible">
            <el-input
              v-model="searchKeyword"
              placeholder="搜索任务名称或描述..."
              @input="handleSearch"
              clearable
              @clear="handleSearch"
              size="small"
            />
          </div>
        </Transition>

        <!-- 筛选栏 -->
        <Transition name="slide-fade">
          <div class="filter-bar" v-if="filterVisible">
            <div class="filter-group">
              <span class="filter-label">优先级</span>
              <div class="filter-chips">
                <button
                  v-for="p in [{ key: '', label: '全部' }, { key: 'high', label: '高' }, { key: 'medium', label: '中' }, { key: 'low', label: '低' }]"
                  :key="p.key"
                  class="filter-chip"
                  :class="{ active: filterPriority === p.key, [p.key]: true }"
                  @click="filterPriority = p.key; applyFilter()"
                >
                  {{ p.label }}
                </button>
              </div>
            </div>
            <div class="filter-group">
              <span class="filter-label">状态</span>
              <div class="filter-chips">
                <button
                  v-for="s in [{ key: '', label: '全部' }, { key: 'todo', label: '待办' }, { key: 'in_progress', label: '进行中' }, { key: 'done', label: '已完成' }]"
                  :key="s.key"
                  class="filter-chip"
                  :class="{ active: filterStatus === s.key }"
                  @click="filterStatus = s.key; applyFilter()"
                >
                  {{ s.label }}
                </button>
              </div>
            </div>
            <div class="filter-group">
              <span class="filter-label">截止日期</span>
              <el-date-picker
                v-model="filterDeadlineRange"
                type="daterange"
                start-placeholder="开始"
                end-placeholder="结束"
                format="MM/DD"
                value-format="YYYY-MM-DD"
                size="small"
                style="width: 220px"
                @change="applyFilter"
                clearable
                @clear="applyFilter"
              />
            </div>
          </div>
        </Transition>

        <!-- 悬浮的磨砂玻璃面板 -->
        <div class="glass-dock-panel">
          <div class="task-scroll-area">
             <ul class="task-list-clean" v-if="taskList.length > 0">
               <li
                 v-for="task in taskList" :key="task.id"
                 class="task-row"
                 :class="{ completed: task.completed, selected: selectedTask?.id === task.id }"
                 @click="openDetail(task)"
               >
                 <!-- 复选框 -->
                 <div class="task-check" @click.stop="toggleStatus(task)">
                   <div class="check-circle">
                     <el-icon v-if="task.completed"><Check /></el-icon>
                   </div>
                 </div>

                 <!-- 任务主体 -->
                 <div class="task-body">
                   <div class="task-name">{{ task.name }}</div>
                   <div class="task-meta">
                     <span class="meta-tag" :class="task.priority">{{ priorityMap[task.priority].label }}</span>
                     <span class="meta-status" :style="{ color: statusMap[task.status].color }">{{ statusMap[task.status].label }}</span>

                     <!-- 标签展示 -->
                     <div class="task-tags-inline" v-if="task.tags && task.tags.length">
                       <span
                         v-for="tag in task.tags"
                         :key="tag.id"
                         class="mini-tag"
                         :style="{ backgroundColor: tag.color + '20', color: tag.color }"
                       >
                         #{{ tag.name }}
                       </span>
                     </div>

                     <span class="meta-date" v-if="task.deadline">
                       <el-icon :size="10"><Calendar /></el-icon>
                       {{ task.deadline }}
                     </span>
                     <span class="meta-progress" v-if="task.progress > 0 && task.progress < 100">
                       {{ task.progress }}%
                     </span>
                   </div>
                 </div>

                 <!-- 操作按钮 -->
                 <div class="task-actions">
                   <button class="icon-action edit" @click.stop="openEditDialog(task)" title="编辑">
                     <el-icon><Edit /></el-icon>
                   </button>
                   <button class="icon-action delete" @click.stop="handleDelete(task)" title="删除">
                     <el-icon><Delete /></el-icon>
                   </button>
                 </div>
               </li>
             </ul>

             <!-- 空状态 -->
             <div class="empty-state" v-else>
                <el-icon class="empty-icon"><Flag /></el-icon>
                <p>暂无待办任务，享受你的闲暇时光吧 ☕️</p>
             </div>
          </div>
        </div>

      </main>

      <!-- 任务详情面板 -->
      <Transition name="detail-slide">
        <aside class="detail-panel" v-if="detailVisible && selectedTask">
          <div class="detail-header">
            <h3 class="detail-title">任务详情</h3>
            <button class="icon-action" @click="closeDetail">
              <el-icon><Close /></el-icon>
            </button>
          </div>

          <div class="detail-scroll">
            <!-- 任务名称 -->
            <div class="detail-name">{{ selectedTask.name }}</div>

            <!-- 状态切换 -->
            <div class="detail-section">
              <div class="detail-label">状态</div>
              <div class="status-switcher">
                <button
                  v-for="s in (['todo', 'in_progress', 'done'] as const)"
                  :key="s"
                  class="status-chip"
                  :class="{ active: selectedTask.status === s }"
                  :style="selectedTask.status === s ? { background: statusMap[s].color, color: '#fff' } : {}"
                  @click="changeStatus(selectedTask!, s)"
                >
                  {{ statusMap[s].label }}
                </button>
              </div>
            </div>

            <!-- 进度条 -->
            <div class="detail-section">
              <div class="detail-label">进度 <span class="detail-value">{{ detailProgress }}%</span></div>
              <div class="progress-slider-wrap">
                <el-slider
                  v-model="detailProgress"
                  :min="0"
                  :max="100"
                  :step="5"
                  :show-tooltip="false"
                  @change="handleProgressChange"
                />
              </div>
            </div>

            <!-- 优先级 -->
            <div class="detail-section">
              <div class="detail-label">优先级</div>
              <span class="meta-tag large" :class="selectedTask.priority">
                {{ priorityMap[selectedTask.priority].label }}优先级
              </span>
            </div>

            <!-- 标签 -->
            <div class="detail-section" v-if="selectedTask.tags && selectedTask.tags.length">
              <div class="detail-label">标签</div>
              <div class="detail-tags">
                <span
                  v-for="tag in selectedTask.tags"
                  :key="tag.id"
                  class="detail-tag-chip"
                  :style="{ backgroundColor: tag.color + '20', color: tag.color, borderColor: tag.color + '40' }"
                >
                  <span class="tag-dot" :style="{ backgroundColor: tag.color }"></span>
                  {{ tag.name }}
                </span>
              </div>
            </div>

            <!-- 描述 -->
            <div class="detail-section" v-if="selectedTask.description">
              <div class="detail-label">描述</div>
              <div class="detail-description">{{ selectedTask.description }}</div>
            </div>

            <!-- 截止日期 -->
            <div class="detail-section">
              <div class="detail-label">
                <el-icon :size="14"><Calendar /></el-icon> 截止日期
              </div>
              <div class="detail-value-text">{{ selectedTask.deadline || '未设置' }}</div>
            </div>

            <!-- 预计耗时 -->
            <div class="detail-section">
              <div class="detail-label">
                <el-icon :size="14"><Clock /></el-icon> 预计耗时
              </div>
              <div class="detail-value-text">{{ formatMinutes(selectedTask.estimated_time) }}</div>
            </div>

            <!-- 实际耗时 -->
            <div class="detail-section">
              <div class="detail-label">
                <el-icon :size="14"><TrendCharts /></el-icon> 实际耗时
              </div>
              <div class="actual-time-input">
                <el-input-number
                  :model-value="selectedTask.actual_time"
                  :min="0"
                  :step="15"
                  size="small"
                  controls-position="right"
                  @change="handleActualTimeChange"
                />
                <span class="unit-label">分钟</span>
              </div>
            </div>

            <!-- 附件区域 -->
            <div class="detail-section">
              <div class="detail-label">
                <el-icon :size="14"><Paperclip /></el-icon> 附件
                <span class="detail-value" v-if="attachments.length">{{ attachments.length }}</span>
              </div>
              <div class="attachment-area">
                <div class="attachment-list" v-if="attachments.length > 0">
                  <div
                    v-for="att in attachments" :key="att.id"
                    class="attachment-item"
                  >
                    <div class="att-icon">
                      <el-icon v-if="isImageFile(att.mime_type)" :size="16" color="#007AFF"><Picture /></el-icon>
                      <el-icon v-else :size="16" color="#FF9500"><Document /></el-icon>
                    </div>
                    <div class="att-info" @click="handleOpenAttachment(att)">
                      <span class="att-name" :title="att.file_name">{{ att.file_name }}</span>
                      <span class="att-size">{{ formatFileSize(att.file_size) }}</span>
                    </div>
                    <button class="icon-action delete att-delete" @click="handleDeleteAttachment(att)">
                      <el-icon :size="12"><Close /></el-icon>
                    </button>
                  </div>
                </div>
                <button class="att-upload-btn" @click="handleUploadAttachment" :disabled="attachmentLoading">
                  <el-icon><Plus /></el-icon>
                  {{ attachmentLoading ? '上传中...' : '添加附件' }}
                </button>
              </div>
            </div>

            <!-- 时间信息 -->
            <div class="detail-section time-info">
              <div class="time-row">
                <span class="time-label">创建时间</span>
                <span class="time-value">{{ formatDate(selectedTask.created_at) }}</span>
              </div>
              <div class="time-row" v-if="selectedTask.completed_at">
                <span class="time-label">完成时间</span>
                <span class="time-value">{{ formatDate(selectedTask.completed_at) }}</span>
              </div>
            </div>

            <!-- 操作按钮 -->
            <div class="detail-actions">
              <button class="mac-btn ghost" @click="openEditDialog(selectedTask!)">
                <el-icon><Edit /></el-icon> 编辑任务
              </button>
              <button class="mac-btn danger" @click="handleDelete(selectedTask!)">
                <el-icon><Delete /></el-icon> 删除任务
              </button>
            </div>
          </div>
        </aside>
      </Transition>

      <!-- 提醒管理面板 -->
      <Transition name="detail-slide">
        <aside class="detail-panel reminder-mgmt-panel" v-if="reminderPanelVisible">
          <div class="detail-header">
            <h3 class="detail-title">🔔 提醒管理</h3>
            <button class="icon-action" @click="closeReminderPanel">
              <el-icon><Close /></el-icon>
            </button>
          </div>

          <!-- Tab 切换 -->
          <div class="reminder-tabs">
            <button
              class="reminder-tab"
              :class="{ active: reminderTab === 'pending' }"
              @click="reminderTab = 'pending'"
            >待处理</button>
            <button
              class="reminder-tab"
              :class="{ active: reminderTab === 'dismissed' }"
              @click="reminderTab = 'dismissed'"
            >已处理</button>
            <button
              class="reminder-tab"
              :class="{ active: reminderTab === 'all' }"
              @click="reminderTab = 'all'"
            >全部</button>
          </div>

          <!-- 提醒列表 -->
          <div class="detail-scroll">
            <div v-if="filteredReminders.length === 0" class="reminder-empty">
              <el-icon class="empty-icon" :size="28"><Bell /></el-icon>
              <p>暂无提醒记录</p>
            </div>
            <div
              v-for="reminder in filteredReminders"
              :key="reminder.id"
              class="reminder-item"
              :class="{ dismissed: reminder.is_dismissed === 1 }"
            >
              <div class="reminder-item-main">
                <div class="reminder-task-name">{{ reminder.task_name }}</div>
                <div class="reminder-meta">
                  <span class="reminder-time">
                    <el-icon :size="12"><AlarmClock /></el-icon>
                    {{ formatDate(reminder.remind_at) }}
                  </span>
                  <span class="reminder-type-tag">{{ getRepeatLabel(reminder.repeat_rule) }}</span>
                  <span
                    class="reminder-status-dot"
                    :style="{ color: getReminderStatusColor(reminder) }"
                  >● {{ getReminderStatus(reminder) }}</span>
                </div>
              </div>
              <div class="reminder-item-actions">
                <button
                  v-if="reminder.is_dismissed === 0"
                  class="icon-action check"
                  @click="handleDismissReminder(reminder)"
                  title="标记已处理"
                >
                  <el-icon><Check /></el-icon>
                </button>
                <button
                  class="icon-action delete"
                  @click="handleDeleteReminder(reminder)"
                  title="删除"
                >
                  <el-icon><Delete /></el-icon>
                </button>
              </div>
            </div>
          </div>
        </aside>
      </Transition>
    </div>

    <!-- 新建/编辑弹窗 -->
    <el-dialog
      v-model="dialogVisible"
      :show-close="false"
      width="420px"
      class="macos-modal"
      align-center
      destroy-on-close
      append-to-body
    >
      <template #header>
        <div class="modal-header">{{ isEditMode ? '编辑任务' : '新建任务' }}</div>
      </template>
      <el-form :model="taskForm" :rules="rules" ref="formRef" label-position="top" hide-required-asterisk>
        <el-form-item label="任务名称" prop="name">
          <el-input v-model="taskForm.name" placeholder="输入任务名称..." maxlength="50" show-word-limit />
        </el-form-item>

        <el-form-item label="优先级" prop="priority">
          <div class="segmented-control">
             <div
              v-for="p in ['high', 'medium', 'low']" :key="p"
              class="segment"
              :class="{ active: taskForm.priority === p, [p]: true }"
              @click="taskForm.priority = p as any"
             >
               {{ priorityMap[p as keyof typeof priorityMap].label }}
             </div>
          </div>
        </el-form-item>

        <el-form-item label="截止日期">
          <el-date-picker
            v-model="taskForm.deadline"
            type="date"
            placeholder="选择截止日期"
            format="YYYY-MM-DD"
            value-format="YYYY-MM-DD"
            :disabled-date="disabledDate"
            style="width: 100%"
          />
        </el-form-item>

        <el-form-item label="所属分类" v-if="categories.length">
          <el-select v-model="taskForm.category_id" placeholder="选择分类（可选）" clearable style="width: 100%">
            <el-option
              v-for="cat in categories"
              :key="cat.id"
              :label="cat.name"
              :value="cat.id"
            >
              <span style="float: left">{{ cat.icon }} {{ cat.name }}</span>
            </el-option>
          </el-select>
        </el-form-item>

        <el-form-item label="标签" v-if="tags.length">
          <el-select
            v-model="taskForm.tag_ids"
            multiple
            placeholder="选择标签（可选）"
            collapse-tags
            collapse-tags-tooltip
            style="width: 100%"
          >
            <el-option
              v-for="tag in tags"
              :key="tag.id"
              :label="tag.name"
              :value="tag.id"
            >
               <span class="tag-dot-option" :style="{ backgroundColor: tag.color }"></span>
               {{ tag.name }}
            </el-option>
          </el-select>
        </el-form-item>

        <el-form-item label="预计耗时（分钟）">
          <el-input-number
            v-model="taskForm.estimated_time"
            :min="0"
            :step="15"
            controls-position="right"
            style="width: 100%"
            placeholder="0"
          />
        </el-form-item>

        <el-form-item label="任务描述">
          <el-input
            v-model="taskForm.description"
            type="textarea"
            :rows="3"
            placeholder="添加详细描述（可选）..."
            maxlength="500"
            show-word-limit
          />
        </el-form-item>

        <!-- 提醒设置 -->
        <el-form-item label="提醒设置">
          <div class="reminder-setting">
            <!-- 快捷按钮 -->
            <div class="reminder-quick-btns">
              <button type="button" class="reminder-quick-btn" @click="addQuickReminder('截止前1小时', 60*60*1000)">截止前1小时</button>
              <button type="button" class="reminder-quick-btn" @click="addQuickReminder('截止前1天', 24*60*60*1000)">截止前1天</button>
              <button type="button" class="reminder-quick-btn" @click="addQuickReminder('截止前3天', 3*24*60*60*1000)">截止前3天</button>
              <button type="button" class="reminder-quick-btn custom" @click="showCustomReminder = !showCustomReminder">
                <el-icon :size="12"><AlarmClock /></el-icon> 自定义
              </button>
            </div>

            <!-- 自定义提醒 -->
            <Transition name="slide-fade">
              <div v-if="showCustomReminder" class="custom-reminder-area">
                <el-date-picker
                  v-model="customReminderTime"
                  type="datetime"
                  placeholder="选择提醒时间"
                  format="YYYY-MM-DD HH:mm"
                  value-format="YYYY-MM-DD HH:mm:ss"
                  style="width: 100%"
                  size="small"
                />
                <div class="custom-reminder-options">
                  <el-radio-group v-model="customReminderType" size="small">
                    <el-radio-button label="once">单次</el-radio-button>
                    <el-radio-button label="repeat">重复</el-radio-button>
                  </el-radio-group>
                  <el-select
                    v-if="customReminderType === 'repeat'"
                    v-model="customRepeatRule"
                    placeholder="重复规则"
                    size="small"
                    style="width: 100px; margin-left: 8px"
                  >
                    <el-option label="每天" value="daily" />
                    <el-option label="每周" value="weekly" />
                    <el-option label="每月" value="monthly" />
                  </el-select>
                  <button type="button" class="mac-btn primary small" @click="addCustomReminder" style="margin-left: 8px">添加</button>
                </div>
              </div>
            </Transition>

            <!-- 已添加的提醒列表 -->
            <div class="reminder-tags" v-if="taskReminders.length > 0">
              <div v-for="(r, index) in taskReminders" :key="index" class="reminder-tag-item">
                <el-icon :size="12"><AlarmClock /></el-icon>
                <span class="reminder-tag-text">{{ r.label }} · {{ formatDate(r.remind_at) }}</span>
                <button type="button" class="reminder-tag-close" @click="removeTaskReminder(index)">
                  <el-icon :size="10"><Close /></el-icon>
                </button>
              </div>
            </div>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <div class="modal-footer">
          <button class="mac-btn ghost" @click="dialogVisible = false">取消</button>
          <button class="mac-btn primary" @click="handleSubmit">
            {{ isEditMode ? '保存修改' : '创建任务' }}
          </button>
        </div>
      </template>
    </el-dialog>

    <!-- 分类弹窗 -->
    <el-dialog
      v-model="categoryDialogVisible"
      :show-close="false"
      width="360px"
      class="macos-modal"
      align-center
      destroy-on-close
      append-to-body
    >
      <template #header>
        <div class="modal-header">{{ isCategoryEdit ? '编辑分类' : '新建分类' }}</div>
      </template>
      <el-form :model="categoryForm" ref="categoryFormRef" label-position="top">
        <el-form-item label="分类名称">
          <el-input v-model="categoryForm.name" placeholder="输入分类名称..." maxlength="20" />
        </el-form-item>
        <el-form-item label="图标">
          <div class="emoji-grid">
            <div
              v-for="emoji in emojiList" :key="emoji"
              class="emoji-item"
              :class="{ active: categoryForm.icon === emoji }"
              @click="categoryForm.icon = emoji"
            >
              {{ emoji }}
            </div>
          </div>
        </el-form-item>
        <el-form-item label="颜色">
           <div class="color-grid">
             <div
               v-for="color in predefineColors" :key="color"
               class="color-item"
               :class="{ active: categoryForm.color === color }"
               :style="{ backgroundColor: color }"
               @click="categoryForm.color = color"
             >
               <el-icon v-if="categoryForm.color === color"><Check /></el-icon>
             </div>
           </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <div class="modal-footer">
          <button class="mac-btn ghost" @click="categoryDialogVisible = false">取消</button>
          <button class="mac-btn primary" @click="handleCategorySubmit">保存</button>
        </div>
      </template>
    </el-dialog>

    <!-- 标签弹窗 -->
    <el-dialog
      v-model="tagDialogVisible"
      :show-close="false"
      width="360px"
      class="macos-modal"
      align-center
      destroy-on-close
      append-to-body
    >
      <template #header>
        <div class="modal-header">{{ isTagEdit ? '编辑标签' : '新建标签' }}</div>
      </template>
      <el-form :model="tagForm" ref="tagFormRef" label-position="top">
        <el-form-item label="标签名称">
          <el-input v-model="tagForm.name" placeholder="输入标签名称..." maxlength="20" />
        </el-form-item>
        <el-form-item label="颜色">
           <div class="color-grid">
             <div
               v-for="color in predefineColors" :key="color"
               class="color-item"
               :class="{ active: tagForm.color === color }"
               :style="{ backgroundColor: color }"
               @click="tagForm.color = color"
             >
               <el-icon v-if="tagForm.color === color"><Check /></el-icon>
             </div>
           </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <div class="modal-footer">
          <button class="mac-btn ghost" @click="tagDialogVisible = false">取消</button>
          <button class="mac-btn primary" @click="handleTagSubmit">保存</button>
        </div>
      </template>
    </el-dialog>

    <!-- 应用内通知弹窗 -->
    <TransitionGroup name="notification-slide" tag="div" class="app-notification-container">
      <div
        v-for="n in appNotifications"
        :key="n.id"
        class="app-notification"
        :class="{ 'fade-out': !n.visible }"
      >
        <div class="app-notification-icon">⏰</div>
        <div class="app-notification-body">
          <div class="app-notification-title">任务提醒</div>
          <div class="app-notification-text">
            {{ getPriorityEmoji(n.task_priority) }} {{ n.task_name }}
          </div>
          <div class="app-notification-time">{{ formatDate(n.remind_at) }}</div>
        </div>
        <div class="app-notification-actions">
          <button class="notif-btn primary" @click="handleAppNotificationAction(n)">处理</button>
          <button class="notif-btn ghost" @click="dismissAppNotification(n.id)">关闭</button>
        </div>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
/* ==================== 极简浅色毛玻璃质感 ==================== */

/* 桌面背景 */
.macos-desktop {
  width: 100vw;
  height: 100vh;
  background: var(--app-bg-gradient);
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Rounded", "SF Pro Text", "Helvetica Neue", Helvetica, "PingFang SC", sans-serif;
  color: var(--text-primary);
  overflow: hidden;
}

/* 主窗口 */
.macos-window {
  width: 960px;
  height: 680px;
  background: var(--window-bg);
  backdrop-filter: blur(40px) saturate(180%);
  -webkit-backdrop-filter: blur(40px) saturate(180%);
  border-radius: 24px;
  box-shadow:
    0 20px 50px rgba(0, 0, 0, 0.1),
    0 0 0 1px rgba(255, 255, 255, 0.1) inset;
  border: 1px solid var(--window-border);
  display: flex;
  overflow: hidden;
  transition: width 0.35s cubic-bezier(0.25, 0.1, 0.25, 1);
}
.macos-window.detail-open {
  width: 1280px;
}

/* ==================== 侧边栏 ==================== */
.sidebar {
  width: 220px;
  background: rgba(245, 245, 250, 0.45);
  border-right: 1px solid rgba(0, 0, 0, 0.06);
  display: flex;
  flex-direction: column;
  padding: 24px 16px;
  flex-shrink: 0;
}

.window-controls {
  display: flex;
  gap: 8px;
  margin-bottom: 24px;
  padding-left: 4px;
}
.control-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  box-shadow: 0 1px 2px rgba(0,0,0,0.15);
}
.close { background: #FF5F57; border: 1px solid rgba(0,0,0,0.06); }
.minimize { background: #FEBC2E; border: 1px solid rgba(0,0,0,0.06); }
.maximize { background: #28C840; border: 1px solid rgba(0,0,0,0.06); }

.sidebar-scroll {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow-y: auto;
}

.user-profile-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 12px 16px;
  margin-top: 10px;
}
.user-avatar-mask {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  overflow: hidden;
  background: var(--glass-bg-hover);
  border: 1px solid var(--glass-border);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  box-shadow: 0 2px 8px rgba(0,0,0,0.05);
}
.user-avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.user-avatar-text {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}
.user-name-box {
  display: flex;
  flex-direction: column;
  justify-content: center;
  overflow: hidden;
  gap: 2px;
}
.user-nickname {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
  text-overflow: ellipsis;
  overflow: hidden;
}
.user-desc {
  font-size: 11px;
  color: var(--text-secondary);
  line-height: 1;
}

.menu-label {
  font-size: 11px;
  font-weight: 600;
  color: rgba(0, 0, 0, 0.4);
  margin: 12px 12px 6px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.menu-spacer { height: 10px; }

.menu-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border-radius: 8px;
  color: rgba(0, 0, 0, 0.75);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  position: relative; /* Ensure absolute children are positioned relative to this item */
}
.menu-item:hover {
  background: rgba(0, 0, 0, 0.05);
  color: #000;
}
.menu-item.active {
  background: rgba(0, 0, 0, 0.08);
  color: #000;
  font-weight: 600;
}
.menu-badge {
  margin-left: auto;
  font-size: 11px;
  background: rgba(0, 0, 0, 0.06);
  color: rgba(0, 0, 0, 0.5);
  padding: 1px 8px;
  border-radius: 10px;
  font-weight: 500;
}

.sidebar-footer {
  border-top: 1px solid rgba(0, 0, 0, 0.05);
  padding-top: 16px;
  margin-top: 10px;
}

/* ==================== 主内容区 ==================== */
.main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 32px 40px;
  background: transparent;
  min-width: 0;
}

.content-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  margin-bottom: 20px;
  padding: 0 4px;
  flex-shrink: 0;
}
.app-title {
  font-size: 28px;
  font-weight: 700;
  color: #000;
  margin: 0 0 4px 0;
  letter-spacing: -0.5px;
}
.app-subtitle {
  font-size: 13px;
  color: rgba(0, 0, 0, 0.5);
}

.header-actions {
  display: flex;
  gap: 8px;
}

/* 胶囊按钮 */
.mac-pill-btn {
  background: rgba(255, 255, 255, 0.6);
  border: 1px solid rgba(0, 0, 0, 0.05);
  padding: 6px 16px;
  border-radius: 20px;
  color: #333;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  transition: all 0.2s;
  backdrop-filter: blur(10px);
}
.mac-pill-btn:hover, .mac-pill-btn.active {
  background: #fff;
  border-color: rgba(0, 0, 0, 0.1);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
}
.mac-pill-btn.active {
  color: #007AFF;
}
.icon-only {
  padding: 6px 10px;
}

/* ==================== 搜索栏 & 筛选栏 ==================== */
.search-bar {
  margin-bottom: 12px;
  flex-shrink: 0;
}

.filter-bar {
  display: flex;
  gap: 24px;
  margin-bottom: 12px;
  padding: 12px 16px;
  background: rgba(255, 255, 255, 0.4);
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.3);
  flex-shrink: 0;
}
.filter-group {
  display: flex;
  align-items: center;
  gap: 8px;
}
.filter-label {
  font-size: 12px;
  color: rgba(0, 0, 0, 0.45);
  font-weight: 500;
  white-space: nowrap;
}
.filter-chips {
  display: flex;
  gap: 4px;
}
.filter-chip {
  font-size: 11px;
  padding: 3px 10px;
  border-radius: 12px;
  border: 1px solid rgba(0, 0, 0, 0.06);
  background: rgba(255, 255, 255, 0.5);
  color: #666;
  cursor: pointer;
  transition: all 0.2s;
  font-weight: 500;
}
.filter-chip:hover {
  background: rgba(255, 255, 255, 0.8);
}
.filter-chip.active {
  background: #333;
  color: #fff;
  border-color: #333;
}
.filter-chip.active.high { background: #FF3B30; border-color: #FF3B30; }
.filter-chip.active.medium { background: #FF9500; border-color: #FF9500; }
.filter-chip.active.low { background: #34C759; border-color: #34C759; }

/* 过渡动画 */
.slide-fade-enter-active, .slide-fade-leave-active {
  transition: all 0.25s ease;
}
.slide-fade-enter-from, .slide-fade-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

/* ==================== 任务列表面板 ==================== */
.glass-dock-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: rgba(255, 255, 255, 0.25);
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  border-radius: 20px;
  border: 1px solid rgba(255, 255, 255, 0.3);
  box-shadow:
    0 8px 32px rgba(0, 0, 0, 0.04),
    inset 0 1px 0 rgba(255, 255, 255, 0.3);
  padding: 8px;
  margin-bottom: 8px;
  overflow: hidden;
}

.task-scroll-area {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
}
.task-scroll-area::-webkit-scrollbar {
  width: 0;
}

.task-list-clean {
  list-style: none;
  padding: 0;
  margin: 0;
}

/* 列表项 */
.task-row {
  display: flex;
  align-items: flex-start;
  padding: 14px 16px;
  background: rgba(255, 255, 255, 0.25);
  margin-bottom: 6px;
  border-radius: 12px;
  gap: 16px;
  transition: all 0.2s ease;
  border: 1px solid rgba(255, 255, 255, 0.15);
  cursor: pointer;
}
.task-row:hover {
  background: rgba(255, 255, 255, 0.6);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
  border-color: rgba(255, 255, 255, 0.5);
}
.task-row.selected {
  background: rgba(0, 122, 255, 0.06);
  border-color: rgba(0, 122, 255, 0.15);
}
.task-row.completed {
  background: rgba(255, 255, 255, 0.2);
  box-shadow: none;
}
.task-row.completed .task-name {
  text-decoration: line-through;
  opacity: 0.5;
  color: #888;
}

/* 复选框 */
.check-circle {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 1.5px solid rgba(0, 0, 0, 0.15);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.25, 0.1, 0.25, 1);
  color: #fff;
  font-size: 12px;
  margin-top: 1px;
  background: transparent;
  flex-shrink: 0;
}
.check-circle:hover {
  border-color: #666;
  background: rgba(0, 0, 0, 0.03);
}
.task-row.completed .check-circle {
  background: #34C759;
  border-color: #34C759;
  box-shadow: 0 2px 5px rgba(52, 199, 89, 0.25);
  transform: scale(1.05);
}

/* 任务内容 */
.task-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.task-name {
  font-size: 14px;
  color: #333;
  font-weight: 500;
  margin-bottom: 6px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.task-meta {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}
.meta-tag {
  font-size: 10px;
  padding: 2px 8px;
  border-radius: 6px;
  font-weight: 600;
  background: rgba(0, 0, 0, 0.05);
  color: #666;
  border: 1px solid transparent;
}
.meta-tag.high { color: #FF3B30; background: rgba(255, 59, 48, 0.08); }
.meta-tag.medium { color: #FF9500; background: rgba(255, 149, 0, 0.08); }
.meta-tag.low { color: #34C759; background: rgba(52, 199, 89, 0.08); }
.meta-tag.large { font-size: 12px; padding: 4px 12px; }

.meta-status {
  font-size: 10px;
  font-weight: 600;
}

.meta-date {
  font-size: 10px;
  color: rgba(0, 0, 0, 0.4);
  display: inline-flex;
  align-items: center;
  gap: 3px;
}

.meta-progress {
  font-size: 10px;
  color: #007AFF;
  font-weight: 600;
}

/* 操作按钮组 */
.task-actions {
  display: flex;
  gap: 2px;
  opacity: 0;
  transition: opacity 0.2s;
}
.task-row:hover .task-actions {
  opacity: 1;
}

.icon-action {
  border: none;
  background: transparent;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(0, 0, 0, 0.3);
  cursor: pointer;
  transition: all 0.2s;
}
.icon-action:hover {
  background: rgba(0, 0, 0, 0.05);
  color: #333;
}
.icon-action.delete:hover {
  background: rgba(255, 59, 48, 0.1);
  color: #FF3B30 !important;
}
.icon-action.edit:hover {
  background: rgba(0, 122, 255, 0.1);
  color: #007AFF !important;
}

/* 空状态 */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: rgba(0, 0, 0, 0.3);
  padding-top: 80px;
}
.empty-icon {
  font-size: 40px;
  margin-bottom: 16px;
  opacity: 0.5;
}

/* ==================== 详情面板 ==================== */
.detail-panel {
  width: 320px;
  background: rgba(250, 250, 252, 0.6);
  backdrop-filter: blur(30px);
  -webkit-backdrop-filter: blur(30px);
  border-left: 1px solid rgba(0, 0, 0, 0.06);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  overflow: hidden;
}

.detail-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 20px 16px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);
}
.detail-title {
  font-size: 15px;
  font-weight: 600;
  color: #333;
  margin: 0;
}

.detail-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}
.detail-scroll::-webkit-scrollbar {
  width: 0;
}

.detail-name {
  font-size: 18px;
  font-weight: 700;
  color: #1d1d1f;
  margin-bottom: 20px;
  line-height: 1.4;
  word-break: break-word;
}

.detail-section {
  margin-bottom: 20px;
}
.detail-label {
  font-size: 11px;
  font-weight: 600;
  color: rgba(0, 0, 0, 0.4);
  margin-bottom: 8px;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  display: flex;
  align-items: center;
  gap: 4px;
}
.detail-value {
  color: #007AFF;
  font-weight: 700;
  font-size: 13px;
  text-transform: none;
  margin-left: 4px;
}

.detail-value-text {
  font-size: 13px;
  color: #333;
  font-weight: 500;
}

.detail-description {
  font-size: 13px;
  color: #555;
  line-height: 1.6;
  background: rgba(0, 0, 0, 0.02);
  border-radius: 10px;
  padding: 12px;
  border: 1px solid rgba(0, 0, 0, 0.04);
  word-break: break-word;
  white-space: pre-wrap;
}

/* 状态切换 */
.status-switcher {
  display: flex;
  gap: 6px;
}
.status-chip {
  flex: 1;
  padding: 6px 0;
  border-radius: 8px;
  border: 1px solid rgba(0, 0, 0, 0.06);
  background: rgba(255, 255, 255, 0.5);
  font-size: 12px;
  font-weight: 500;
  color: #666;
  cursor: pointer;
  transition: all 0.25s;
  text-align: center;
}
.status-chip:hover {
  background: rgba(255, 255, 255, 0.8);
}
.status-chip.active {
  border-color: transparent;
  font-weight: 600;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

/* 进度条 */
.progress-slider-wrap {
  padding: 0 4px;
}
.progress-slider-wrap :deep(.el-slider__runway) {
  height: 4px;
  background: rgba(0, 0, 0, 0.06);
  border-radius: 2px;
}
.progress-slider-wrap :deep(.el-slider__bar) {
  height: 4px;
  border-radius: 2px;
  background: linear-gradient(90deg, #007AFF, #34C759);
}
.progress-slider-wrap :deep(.el-slider__button) {
  width: 16px;
  height: 16px;
  border: 2px solid #007AFF;
  box-shadow: 0 1px 4px rgba(0, 122, 255, 0.3);
}

/* 实际耗时输入 */
.actual-time-input {
  display: flex;
  align-items: center;
  gap: 8px;
}
.unit-label {
  font-size: 12px;
  color: rgba(0, 0, 0, 0.4);
}

/* 时间信息 */
.time-info {
  background: rgba(0, 0, 0, 0.02);
  border-radius: 10px;
  padding: 12px !important;
  margin-top: 8px;
}
.time-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 0;
}
.time-row + .time-row {
  border-top: 1px solid rgba(0, 0, 0, 0.04);
  margin-top: 4px;
  padding-top: 8px;
}
.time-label {
  font-size: 11px;
  color: rgba(0, 0, 0, 0.4);
}
.time-value {
  font-size: 11px;
  color: #555;
  font-weight: 500;
}

/* 详情面板底部操作 */
.detail-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid rgba(0, 0, 0, 0.05);
}

/* 详情面板过渡动画 */
.detail-slide-enter-active, .detail-slide-leave-active {
  transition: all 0.3s cubic-bezier(0.25, 0.1, 0.25, 1);
}
.detail-slide-enter-from {
  opacity: 0;
  transform: translateX(40px);
}
.detail-slide-leave-to {
  opacity: 0;
  transform: translateX(40px);
}

/* ==================== 弹窗样式 ==================== */
.macos-modal :deep(.el-dialog) {
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.88);
  backdrop-filter: blur(40px) saturate(180%);
  -webkit-backdrop-filter: blur(40px) saturate(180%);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15);
  border: 1px solid rgba(255, 255, 255, 0.6);
}
.macos-modal :deep(.el-dialog__header) {
  padding: 16px;
  margin: 0;
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);
  text-align: center;
}
.modal-header {
  font-weight: 600;
  font-size: 15px;
  color: #333;
}
.macos-modal :deep(.el-dialog__body) {
  padding: 24px;
}
.macos-modal :deep(.el-form-item__label) {
  color: #666 !important;
  font-size: 13px;
}
.macos-modal :deep(.el-input__wrapper),
.macos-modal :deep(.el-textarea__inner) {
  background: #f5f5f7;
  border: 1px solid rgba(0, 0, 0, 0.05);
  border-radius: 10px;
  box-shadow: none !important;
}
.macos-modal :deep(.el-textarea__inner) {
  padding: 10px 12px;
}
.macos-modal :deep(.el-input__inner) {
  color: #333;
}
.macos-modal :deep(.el-input__inner::placeholder),
.macos-modal :deep(.el-textarea__inner::placeholder) {
  color: #aaa;
}
.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

/* Segment Control */
.segmented-control {
  display: flex;
  background: #eff1f5;
  padding: 2px;
  border-radius: 8px;
  border: 1px solid rgba(0, 0, 0, 0.02);
  width: 100%;
}
.segment {
  flex: 1;
  text-align: center;
  font-size: 13px;
  padding: 5px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
  color: #666;
  font-weight: 500;
}
.segment.active {
  background: #fff;
  color: #000;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  font-weight: 600;
}
.segment.active.high { color: #FF3B30; }
.segment.active.medium { color: #FF9500; }
.segment.active.low { color: #34C759; }

/* 按钮 */
.mac-btn {
  padding: 8px 20px;
  border-radius: 12px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  border: none;
  transition: all 0.25s ease;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}
.mac-btn.primary {
  background: #007AFF;
  color: #fff;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
}
.mac-btn.primary:hover {
  background: #006ae6;
  box-shadow: 0 2px 8px rgba(0, 122, 255, 0.2);
  transform: translateY(-0.5px);
}
.mac-btn.ghost {
  background: #f5f5f7;
  color: #333;
  border: 1px solid rgba(0, 0, 0, 0.05);
}
.mac-btn.ghost:hover {
  background: #e5e5ea;
  color: #000;
}
.mac-btn.danger {
  background: rgba(255, 59, 48, 0.08);
  color: #FF3B30;
  border: 1px solid rgba(255, 59, 48, 0.1);
}
.mac-btn.danger:hover {
  background: rgba(255, 59, 48, 0.15);
}

/* ==================== 附件区域 ==================== */
.attachment-area {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.attachment-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.attachment-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  background: rgba(0, 0, 0, 0.02);
  border-radius: 8px;
  border: 1px solid rgba(0, 0, 0, 0.04);
  transition: all 0.2s;
}
.attachment-item:hover {
  background: rgba(0, 0, 0, 0.04);
  border-color: rgba(0, 0, 0, 0.08);
}

.att-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.6);
  flex-shrink: 0;
}

.att-info {
  flex: 1;
  min-width: 0;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.att-info:hover .att-name {
  color: #007AFF;
}

.att-name {
  font-size: 12px;
  font-weight: 500;
  color: #333;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: color 0.2s;
}

.att-size {
  font-size: 10px;
  color: rgba(0, 0, 0, 0.35);
}

.att-delete {
  width: 22px !important;
  height: 22px !important;
  opacity: 0;
  transition: opacity 0.2s;
}
.attachment-item:hover .att-delete {
  opacity: 1;
}

.att-upload-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 0;
  border: 1.5px dashed rgba(0, 0, 0, 0.12);
  border-radius: 8px;
  background: transparent;
  color: rgba(0, 0, 0, 0.4);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}
.att-upload-btn:hover {
  border-color: #007AFF;
  color: #007AFF;
  background: rgba(0, 122, 255, 0.03);
}
.att-upload-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
/* ==================== 标签样式 ==================== */
.tag-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-right: 8px;
}
.menu-label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-right: 8px;
  margin-bottom: 4px;
}
.menu-label {
  margin-bottom: 0 !important;
}
.icon-btn-small {
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 2px;
  border-radius: 4px;
  color: rgba(0,0,0,0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
}
.icon-btn-small:hover {
  background: rgba(0,0,0,0.05);
  color: #007AFF;
}

.menu-item.tag-item {
  position: relative;
}
.tag-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.menu-actions {
  display: none;
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  gap: 4px;
  background: rgba(245, 245, 250, 0.9); /* 遮挡文字 */
  border-radius: 4px;
  padding-left: 4px;
}
.menu-item:hover .menu-actions {
  display: flex;
}

.icon-btn-mini {
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 2px;
  border-radius: 3px;
  color: rgba(0,0,0,0.5);
  font-size: 12px;
  display: flex;
}
.icon-btn-mini:hover {
  background: rgba(0,0,0,0.05);
  color: #007AFF;
}
.icon-btn-mini.danger:hover {
  color: #FF3B30;
  background: rgba(255, 59, 48, 0.1);
}

.color-grid {
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  gap: 8px;
}
.color-item {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  cursor: pointer;
  border: 2px solid transparent;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-size: 12px;
}
.color-item.active {
  border-color: rgba(0,0,0,0.3);
  transform: scale(1.1);
}

.emoji-grid {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 8px;
}
.emoji-item {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  cursor: pointer;
  border-radius: 6px;
  transition: all 0.2s;
}
.emoji-item:hover {
  background: rgba(0,0,0,0.05);
}
.emoji-item.active {
  background: rgba(0,122,255,0.1);
  border: 1px solid rgba(0,122,255,0.2);
}

.tag-dot-option {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-right: 8px;
}

.task-tags-inline {
  display: flex;
  gap: 4px;
  margin: 0 8px;
  flex-wrap: wrap;
}
.mini-tag {
  font-size: 10px;
  padding: 0 4px;
  border-radius: 4px;
  line-height: 16px;
}

.detail-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
}
.detail-tag-chip {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 12px;
  border: 1px solid transparent;
  background: rgba(0,0,0,0.03);
}

/* ==================== 提醒模块样式 ==================== */

/* 侧边栏提醒徽章 */
.menu-badge.reminder-badge {
  background: linear-gradient(135deg, #FF3B30, #FF6B6B);
  color: #fff;
  font-size: 10px;
  min-width: 18px;
  height: 18px;
  line-height: 18px;
  border-radius: 9px;
  text-align: center;
  padding: 0 5px;
  margin-left: auto;
  font-weight: 600;
  box-shadow: 0 1px 4px rgba(255, 59, 48, 0.3);
  animation: badge-pulse 2s infinite;
}
@keyframes badge-pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.05); }
}

/* 提醒管理面板 */
.reminder-mgmt-panel {
  display: flex;
  flex-direction: column;
}

.reminder-tabs {
  display: flex;
  gap: 4px;
  padding: 0 20px 12px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
}
.reminder-tab {
  flex: 1;
  padding: 6px 0;
  font-size: 12px;
  font-weight: 500;
  border: none;
  background: transparent;
  color: var(--text-secondary, rgba(0, 0, 0, 0.5));
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}
.reminder-tab:hover {
  background: rgba(0, 0, 0, 0.04);
}
.reminder-tab.active {
  background: rgba(0, 122, 255, 0.1);
  color: #007AFF;
}

.reminder-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 0;
  color: var(--text-secondary, rgba(0, 0, 0, 0.35));
}
.reminder-empty .empty-icon {
  margin-bottom: 12px;
  opacity: 0.4;
}
.reminder-empty p {
  font-size: 13px;
}

.reminder-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 0;
  border-bottom: 1px solid rgba(0, 0, 0, 0.04);
  transition: all 0.2s;
}
.reminder-item:hover {
  background: rgba(0, 0, 0, 0.02);
  border-radius: 8px;
  padding-left: 8px;
  padding-right: 8px;
  margin: 0 -8px;
}
.reminder-item.dismissed {
  opacity: 0.5;
}

.reminder-item-main {
  flex: 1;
  min-width: 0;
}
.reminder-task-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary, rgba(0, 0, 0, 0.85));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-bottom: 4px;
}
.reminder-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  color: var(--text-secondary, rgba(0, 0, 0, 0.45));
}
.reminder-time {
  display: flex;
  align-items: center;
  gap: 3px;
}
.reminder-type-tag {
  background: rgba(0, 0, 0, 0.04);
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 10px;
}
.reminder-status-dot {
  font-size: 10px;
}

.reminder-item-actions {
  display: flex;
  gap: 4px;
  margin-left: 8px;
  flex-shrink: 0;
}
.reminder-item-actions .icon-action.check {
  color: #34C759;
}
.reminder-item-actions .icon-action.check:hover {
  background: rgba(52, 199, 89, 0.1);
}

/* 弹窗中的提醒设置 */
.reminder-setting {
  width: 100%;
}
.reminder-quick-btns {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.reminder-quick-btn {
  padding: 4px 10px;
  font-size: 11px;
  border: 1px solid rgba(0, 0, 0, 0.1);
  background: rgba(0, 0, 0, 0.02);
  border-radius: 6px;
  cursor: pointer;
  color: var(--text-primary, rgba(0, 0, 0, 0.7));
  transition: all 0.2s;
  display: flex;
  align-items: center;
  gap: 4px;
}
.reminder-quick-btn:hover {
  background: rgba(0, 122, 255, 0.08);
  border-color: rgba(0, 122, 255, 0.3);
  color: #007AFF;
}
.reminder-quick-btn.custom {
  border-style: dashed;
}

.custom-reminder-area {
  margin-top: 10px;
  padding: 10px;
  background: rgba(0, 0, 0, 0.02);
  border-radius: 8px;
  border: 1px solid rgba(0, 0, 0, 0.06);
}
.custom-reminder-options {
  display: flex;
  align-items: center;
  margin-top: 8px;
}

.reminder-tags {
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.reminder-tag-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  background: rgba(0, 122, 255, 0.06);
  border: 1px solid rgba(0, 122, 255, 0.15);
  border-radius: 8px;
  font-size: 12px;
  color: #007AFF;
  animation: tag-in 0.2s ease;
}
@keyframes tag-in {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
}
.reminder-tag-text {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.reminder-tag-close {
  background: none;
  border: none;
  cursor: pointer;
  color: rgba(0, 122, 255, 0.5);
  display: flex;
  align-items: center;
  padding: 2px;
  border-radius: 4px;
  transition: all 0.2s;
}
.reminder-tag-close:hover {
  color: #FF3B30;
  background: rgba(255, 59, 48, 0.1);
}

.mac-btn.small {
  padding: 4px 12px;
  font-size: 12px;
  height: 28px;
}

/* 应用内通知浮层 */
.app-notification-container {
  position: fixed;
  top: 20px;
  right: 20px;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-width: 360px;
}
.app-notification {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 14px 16px;
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(24px) saturate(180%);
  -webkit-backdrop-filter: blur(24px) saturate(180%);
  border-radius: 14px;
  box-shadow:
    0 8px 32px rgba(0, 0, 0, 0.12),
    0 0 0 1px rgba(0, 0, 0, 0.05) inset;
  border: 1px solid rgba(255, 255, 255, 0.6);
  transition: all 0.3s cubic-bezier(0.25, 0.1, 0.25, 1);
}
.app-notification.fade-out {
  opacity: 0;
  transform: translateX(20px);
}
.app-notification-icon {
  font-size: 28px;
  flex-shrink: 0;
}
.app-notification-body {
  flex: 1;
  min-width: 0;
}
.app-notification-title {
  font-size: 12px;
  font-weight: 600;
  color: rgba(0, 0, 0, 0.85);
  margin-bottom: 2px;
}
.app-notification-text {
  font-size: 13px;
  color: rgba(0, 0, 0, 0.7);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.app-notification-time {
  font-size: 11px;
  color: rgba(0, 0, 0, 0.35);
  margin-top: 3px;
}
.app-notification-actions {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex-shrink: 0;
}
.notif-btn {
  padding: 4px 12px;
  font-size: 11px;
  font-weight: 500;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}
.notif-btn.primary {
  background: #007AFF;
  color: #fff;
}
.notif-btn.primary:hover {
  background: #0066DD;
}
.notif-btn.ghost {
  background: rgba(0, 0, 0, 0.05);
  color: rgba(0, 0, 0, 0.55);
}
.notif-btn.ghost:hover {
  background: rgba(0, 0, 0, 0.1);
}

/* 通知动画 */
.notification-slide-enter-active {
  transition: all 0.4s cubic-bezier(0.25, 0.1, 0.25, 1);
}
.notification-slide-leave-active {
  transition: all 0.3s cubic-bezier(0.25, 0.1, 0.25, 1);
}
.notification-slide-enter-from {
  opacity: 0;
  transform: translateX(60px) scale(0.95);
}
.notification-slide-leave-to {
  opacity: 0;
  transform: translateX(60px) scale(0.95);
}

/* slide-fade 过渡 */
.slide-fade-enter-active {
  transition: all 0.3s ease;
}
.slide-fade-leave-active {
  transition: all 0.2s ease;
}
.slide-fade-enter-from {
  opacity: 0;
  transform: translateY(-6px);
}
.slide-fade-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}
</style>
