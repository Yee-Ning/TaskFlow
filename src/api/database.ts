/**
 * 前端数据库 API 封装
 *
 * 通过 ipcRenderer.invoke() 调用主进程的数据库操作
 * 为 Vue 组件提供统一、简洁的数据访问接口
 *
 * 使用方式：
 *   import { taskApi, userApi, categoryApi, tagApi, reminderApi } from '@/api/database'
 *   const tasks = await taskApi.getByFilter({ user_id: 1 })
 */

// 获取 preload 中暴露的 ipcRenderer
const { ipcRenderer } = window as any

// ==================== 类型定义（与主进程 DAO 保持一致） ====================

// ----- 用户相关 -----
export interface User {
    id: number
    username: string
    password_hash: string
    nickname: string
    avatar: string
    theme: string
    created_at: string
    updated_at: string
}

export interface CreateUserParams {
    username: string
    password_hash: string
    nickname?: string
}

export interface UpdateUserParams {
    nickname?: string
    avatar?: string
    theme?: string
    password_hash?: string
}

// ----- 任务相关 -----
export interface Task {
    id: number
    user_id: number
    category_id: number | null
    name: string
    description: string
    priority: 'high' | 'medium' | 'low'
    status: 'todo' | 'in_progress' | 'done'
    progress: number
    deadline: string | null
    estimated_time: number
    actual_time: number
    completed_at: string | null
    created_at: string
    updated_at: string
    tags?: import('./database').Tag[]
}

export interface CreateTaskParams {
    user_id: number
    category_id?: number | null
    name: string
    description?: string
    priority?: 'high' | 'medium' | 'low'
    deadline?: string | null
    estimated_time?: number
}

export interface UpdateTaskParams {
    category_id?: number | null
    name?: string
    description?: string
    priority?: 'high' | 'medium' | 'low'
    status?: 'todo' | 'in_progress' | 'done'
    progress?: number
    deadline?: string | null
    estimated_time?: number
    actual_time?: number
}

export interface TaskFilterParams {
    user_id: number
    category_id?: number | null
    priority?: 'high' | 'medium' | 'low'
    status?: 'todo' | 'in_progress' | 'done'
    keyword?: string
    tag_id?: number
    deadline_start?: string
    deadline_end?: string
}

export interface TaskStatistics {
    total: number
    todo: number
    in_progress: number
    done: number
    completion_rate: number
}

// ----- 分类相关 -----
export interface Category {
    id: number
    user_id: number
    name: string
    icon: string
    color: string
    sort_order: number
    created_at: string
    updated_at: string
}

export interface CategoryWithStats extends Category {
    total_tasks: number
    done_tasks: number
    pending_tasks: number
}

export interface CreateCategoryParams {
    user_id: number
    name: string
    icon?: string
    color?: string
    sort_order?: number
}

export interface UpdateCategoryParams {
    name?: string
    icon?: string
    color?: string
    sort_order?: number
}

// ----- 标签相关 -----
export interface Tag {
    id: number
    user_id: number
    name: string
    color: string
    created_at: string
}

export interface CreateTagParams {
    user_id: number
    name: string
    color?: string
}

export interface UpdateTagParams {
    name?: string
    color?: string
}

// ----- 提醒相关 -----
export interface Reminder {
    id: number
    task_id: number
    remind_at: string
    type: 'once' | 'repeat'
    repeat_rule: string | null
    is_triggered: number
    is_dismissed: number
    created_at: string
}

export interface ReminderWithTask extends Reminder {
    task_name: string
    task_priority: string
}

export interface CreateReminderParams {
    task_id: number
    remind_at: string
    type?: 'once' | 'repeat'
    repeat_rule?: string | null
}

// ==================== 认证相关类型 ====================

/** 认证请求参数（注册） */
export interface RegisterParams {
    username: string
    password: string
    nickname?: string
}

/** 认证请求参数（登录） */
export interface LoginParams {
    username: string
    password: string
}

/** 安全用户信息（不含密码哈希） */
export interface SafeUser {
    id: number
    username: string
    nickname: string
    avatar: string
    theme: string
    created_at: string
    updated_at: string
}

/** 认证响应结果 */
export interface AuthResponse {
    success: boolean
    message?: string
    user?: SafeUser
}

// ==================== API 封装 ====================

/** 认证 API（注册 / 登录 / 密码管理） */
export const authApi = {
    register: (params: RegisterParams): Promise<AuthResponse> =>
        ipcRenderer.invoke('auth:register', params),

    login: (params: LoginParams): Promise<AuthResponse> =>
        ipcRenderer.invoke('auth:login', params),

    changePassword: (params: { userId: number; oldPassword: string; newPassword: string }): Promise<{ success: boolean; message: string }> =>
        ipcRenderer.invoke('auth:changePassword', params),

    setSecurityQuestion: (params: { userId: number; question: string; answer: string }): Promise<{ success: boolean; message?: string }> =>
        ipcRenderer.invoke('auth:setSecurityQuestion', params),

    resetPassword: (params: { username: string; answer: string; newPassword: string }): Promise<{ success: boolean; message: string }> =>
        ipcRenderer.invoke('auth:resetPassword', params),

    getSecurityQuestion: (username: string): Promise<{ success: boolean; message?: string; question?: string }> =>
        ipcRenderer.invoke('auth:getSecurityQuestion', username),
}

/** 用户 API */
export const userApi = {
    getById: (id: number): Promise<SafeUser | undefined> =>
        ipcRenderer.invoke('db:user:getById', id),

    update: (id: number, params: UpdateUserParams): Promise<boolean> =>
        ipcRenderer.invoke('db:user:update', id, params),

    saveAvatar: (userId: number): Promise<string | null> =>
        ipcRenderer.invoke('user:saveAvatar', userId),
}

/** 任务 API */
export const taskApi = {
    create: (params: CreateTaskParams): Promise<Task> =>
        ipcRenderer.invoke('db:task:create', params),

    getById: (id: number): Promise<Task | undefined> =>
        ipcRenderer.invoke('db:task:getById', id),

    getByFilter: (filter: TaskFilterParams): Promise<Task[]> =>
        ipcRenderer.invoke('db:task:getByFilter', filter),

    update: (id: number, params: UpdateTaskParams): Promise<boolean> =>
        ipcRenderer.invoke('db:task:update', id, params),

    delete: (id: number): Promise<boolean> =>
        ipcRenderer.invoke('db:task:delete', id),

    toggleStatus: (id: number): Promise<Task | undefined> =>
        ipcRenderer.invoke('db:task:toggleStatus', id),

    getStatistics: (userId: number): Promise<TaskStatistics> =>
        ipcRenderer.invoke('db:task:getStatistics', userId),

    getStatsByDateRange: (userId: number, startDate: string, endDate: string): Promise<{ date: string; created: number; completed: number }[]> =>
        ipcRenderer.invoke('db:task:getStatsByDateRange', userId, startDate, endDate),
}

/** 分类 API */
export const categoryApi = {
    create: (params: CreateCategoryParams): Promise<Category> =>
        ipcRenderer.invoke('db:category:create', params),

    getById: (id: number): Promise<Category | undefined> =>
        ipcRenderer.invoke('db:category:getById', id),

    getByUserId: (userId: number): Promise<Category[]> =>
        ipcRenderer.invoke('db:category:getByUserId', userId),

    getWithStats: (userId: number): Promise<CategoryWithStats[]> =>
        ipcRenderer.invoke('db:category:getWithStats', userId),

    update: (id: number, params: UpdateCategoryParams): Promise<boolean> =>
        ipcRenderer.invoke('db:category:update', id, params),

    delete: (id: number): Promise<boolean> =>
        ipcRenderer.invoke('db:category:delete', id),
}

/** 标签 API */
export const tagApi = {
    create: (params: CreateTagParams): Promise<Tag> =>
        ipcRenderer.invoke('db:tag:create', params),

    getByUserId: (userId: number): Promise<Tag[]> =>
        ipcRenderer.invoke('db:tag:getByUserId', userId),

    getByTaskId: (taskId: number): Promise<Tag[]> =>
        ipcRenderer.invoke('db:tag:getByTaskId', taskId),

    update: (id: number, params: UpdateTagParams): Promise<boolean> =>
        ipcRenderer.invoke('db:tag:update', id, params),

    delete: (id: number): Promise<boolean> =>
        ipcRenderer.invoke('db:tag:delete', id),

    addToTask: (taskId: number, tagId: number): Promise<boolean> =>
        ipcRenderer.invoke('db:tag:addToTask', taskId, tagId),

    removeFromTask: (taskId: number, tagId: number): Promise<boolean> =>
        ipcRenderer.invoke('db:tag:removeFromTask', taskId, tagId),

    /**
     * 设置任务的标签（替换全部）
     * 重要：使用展开运算符 [...tagIds] 将 Vue Proxy 转为普通数组，
     * 避免 Electron IPC 结构化克隆序列化 Proxy 对象失败
     */
    setTaskTags: (taskId: number, tagIds: number[]): Promise<{ success: boolean }> =>
        ipcRenderer.invoke('db:tag:setTaskTags', taskId, [...tagIds]),
}

/** 提醒 API */
export const reminderApi = {
    create: (params: CreateReminderParams): Promise<Reminder> =>
        ipcRenderer.invoke('db:reminder:create', params),

    getByTaskId: (taskId: number): Promise<Reminder[]> =>
        ipcRenderer.invoke('db:reminder:getByTaskId', taskId),

    getByUserId: (userId: number): Promise<ReminderWithTask[]> =>
        ipcRenderer.invoke('db:reminder:getByUserId', userId),

    getPending: (): Promise<ReminderWithTask[]> =>
        ipcRenderer.invoke('db:reminder:getPending'),

    markTriggered: (id: number): Promise<boolean> =>
        ipcRenderer.invoke('db:reminder:markTriggered', id),

    markDismissed: (id: number): Promise<boolean> =>
        ipcRenderer.invoke('db:reminder:markDismissed', id),

    delete: (id: number): Promise<boolean> =>
        ipcRenderer.invoke('db:reminder:delete', id),
}

// ==================== 统计相关类型 ====================

export interface PeriodStatItem {
    period: string
    created_count: number
    completed_count: number
    completion_rate: number
}

export interface CategoryStatItem {
    category_id: number | null
    category_name: string
    icon: string
    color: string
    total_tasks: number
    completed_tasks: number
    completion_rate: number
}

export interface CategoryTimeItem {
    category_id: number | null
    category_name: string
    total_time: number
    avg_time: number
    task_count: number
}

export interface CategoryCompletionByPeriodItem {
    period: string
    category_name: string
    completed_count: number
}

export type PeriodType = 'day' | 'week' | 'month'

/** 统计 API */
export const statisticsApi = {
    getByPeriod: (userId: number, startDate: string, endDate: string, period: PeriodType): Promise<PeriodStatItem[]> =>
        ipcRenderer.invoke('db:statistics:byPeriod', userId, startDate, endDate, period),

    getByCategory: (userId: number): Promise<CategoryStatItem[]> =>
        ipcRenderer.invoke('db:statistics:byCategory', userId),

    getTimeDistribution: (userId: number): Promise<CategoryTimeItem[]> =>
        ipcRenderer.invoke('db:statistics:timeDistribution', userId),

    getCategoryByPeriod: (userId: number, startDate: string, endDate: string, period: PeriodType): Promise<CategoryCompletionByPeriodItem[]> =>
        ipcRenderer.invoke('db:statistics:categoryByPeriod', userId, startDate, endDate, period),

    exportExcel: (userId: number, startDate: string, endDate: string, period: PeriodType): Promise<{ success: boolean; filePath?: string; error?: string }> =>
        ipcRenderer.invoke('statistics:export', userId, startDate, endDate, period),
}

// ==================== 附件类型定义 ====================

export interface Attachment {
    id: number
    task_id: number
    file_name: string
    file_path: string
    file_size: number
    mime_type: string
    created_at: string
}

/** 附件 API */
export const attachmentApi = {
    /** 保存附件：选择文件 -> 复制到应用目录 -> 写入数据库 */
    save: (taskId: number, filePaths: string[]): Promise<Attachment[]> =>
        ipcRenderer.invoke('db:attachment:save', taskId, filePaths),

    /** 查询任务的所有附件 */
    getByTaskId: (taskId: number): Promise<Attachment[]> =>
        ipcRenderer.invoke('db:attachment:getByTaskId', taskId),

    /** 删除附件（同时删除物理文件） */
    delete: (id: number): Promise<boolean> =>
        ipcRenderer.invoke('db:attachment:delete', id),

    /** 用系统默认程序打开附件 */
    open: (filePath: string): Promise<boolean> =>
        ipcRenderer.invoke('attachment:open', filePath),

    /** 打开文件选择对话框 */
    selectFiles: (): Promise<string[]> =>
        ipcRenderer.invoke('dialog:openFile'),
}


// ==================== 备份恢复类型定义 ====================

export interface BackupResult {
    success: boolean
    filePath?: string
    fileSize?: number
    error?: string
}

export interface RestoreResult {
    success: boolean
    error?: string
}

// ==================== 任务导入导出类型定义 ====================

export interface TaskExportResult {
    success: boolean
    filePath?: string
    taskCount?: number
    error?: string
}

export interface ImportRowError {
    row: number
    field: string
    message: string
}

export interface TaskImportResult {
    success: boolean
    totalRows: number
    successCount: number
    failCount: number
    errors: ImportRowError[]
    error?: string
}

// ==================== 快捷键类型定义 ====================

export interface ShortcutConfig {
    actionId: string
    actionName: string
    accelerator: string
    enabled: boolean
}

// ==================== 操作日志类型定义 ====================

export interface OperationLog {
    id: number
    user_id: number
    action: string
    target_type: string
    target_id: number | null
    detail: string
    created_at: string
}

export interface LogFilter {
    user_id: number
    action?: string
    target_type?: string
    start_date?: string
    end_date?: string
    page: number
    page_size: number
}

export interface LogPage {
    logs: OperationLog[]
    total: number
    page: number
    page_size: number
}

// ==================== 辅助功能 API ====================

/** 备份恢复 API */
export const backupApi = {
    create: (userId?: number): Promise<BackupResult> =>
        ipcRenderer.invoke('backup:create', userId),

    restore: (userId?: number): Promise<RestoreResult> =>
        ipcRenderer.invoke('backup:restore', userId),
}

/** 任务导入导出 API */
export const taskIOApi = {
    export: (userId: number): Promise<TaskExportResult> =>
        ipcRenderer.invoke('task:export', userId),

    import: (userId: number): Promise<TaskImportResult> =>
        ipcRenderer.invoke('task:import', userId),
}

/** 快捷键 API */
export const shortcutApi = {
    getConfig: (): Promise<ShortcutConfig[]> =>
        ipcRenderer.invoke('shortcut:getConfig'),

    saveConfig: (shortcuts: ShortcutConfig[]): Promise<boolean> =>
        ipcRenderer.invoke('shortcut:saveConfig', shortcuts),

    checkConflict: (accelerator: string, excludeActionId: string): Promise<string | null> =>
        ipcRenderer.invoke('shortcut:checkConflict', accelerator, excludeActionId),

    onTriggered: (callback: (actionId: string) => void) =>
        ipcRenderer.on('shortcut:triggered', (_e: any, actionId: string) => callback(actionId)),
}

/** 操作日志 API */
export const logApi = {
    query: (filter: LogFilter): Promise<LogPage> =>
        ipcRenderer.invoke('db:log:query', filter),

    clean: (userId: number, daysToKeep: number): Promise<number> =>
        ipcRenderer.invoke('db:log:clean', userId, daysToKeep),
}
