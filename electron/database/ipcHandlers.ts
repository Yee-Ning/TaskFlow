/**
 * IPC 通信处理器
 *
 * 在 Electron 主进程中注册所有数据库操作的 IPC Handler
 * 渲染进程通过 ipcRenderer.invoke('channel', data) 调用这些 Handler
 */

import { ipcMain, app, shell, dialog } from 'electron'
import * as fs from 'fs'
import * as path from 'path'

// 导入所有 DAO
import * as userDao from './userDao'
import * as taskDao from './taskDao'
import * as categoryDao from './categoryDao'
import * as tagDao from './tagDao'
import * as reminderDao from './reminderDao'
import * as attachmentDao from './attachmentDao'
import * as statisticsDao from './statisticsDao'

// 导入密码加密工具
import { hashPassword, verifyPassword } from '../utils/crypto'

// 导入导出服务
import { exportStatisticsToExcel } from '../services/exportService'

// 导入辅助功能服务
import * as backupService from '../services/backupService'
import * as taskIOService from '../services/taskIOService'
import * as shortcutService from '../services/shortcutService'
import * as logDao from './logDao'

/**
 * 注册所有 IPC Handler
 * 在 app.whenReady() 之后、创建窗口之前调用
 */
export function registerIpcHandlers(): void {
    // ======================== 认证相关 ========================

    /**
     * 用户注册
     * 接收明文密码，在主进程中加密后存入数据库
     */
    ipcMain.handle('auth:register', (_event, params: { username: string; password: string; nickname?: string }) => {
        try {
            // 1. 检查用户名是否已存在
            if (userDao.isUsernameExists(params.username)) {
                return { success: false, message: '用户名已存在' }
            }
            // 2. 加密密码
            const password_hash = hashPassword(params.password)
            // 3. 创建用户
            const user = userDao.createUser({
                username: params.username,
                password_hash,
                nickname: params.nickname,
            })
            // 4. 返回用户信息（排除密码哈希）
            const { password_hash: _, ...safeUser } = user
            return { success: true, user: safeUser }
        } catch (error: any) {
            return { success: false, message: error.message || '注册失败' }
        }
    })

    /**
     * 用户登录
     * 验证用户名和密码，返回用户信息
     */
    ipcMain.handle('auth:login', (_event, params: { username: string; password: string }) => {
        try {
            // 1. 查询用户
            const user = userDao.getUserByUsername(params.username)
            if (!user) {
                return { success: false, message: '用户名或密码错误' }
            }

            // 2. 验证密码
            const isValid = verifyPassword(params.password, user.password_hash)
            if (!isValid) {
                return { success: false, message: '用户名或密码错误' }
            }

            // 3. 返回用户信息（排除密码哈希）
            const { password_hash: _, ...safeUser } = user
            return { success: true, user: safeUser }
        } catch (error: any) {
            console.error('[AUTH] Login error:', error)
            return { success: false, message: error.message || '登录失败' }
        }
    })

    /**
     * 修改密码
     * 验证旧密码 → 加密新密码 → 更新数据库
     */
    ipcMain.handle('auth:changePassword', (_event, params: { userId: number; oldPassword: string; newPassword: string }) => {
        try {
            const user = userDao.getUserById(params.userId)
            if (!user) return { success: false, message: '用户不存在' }
            const isValid = verifyPassword(params.oldPassword, user.password_hash)
            if (!isValid) return { success: false, message: '原密码错误' }
            const newHash = hashPassword(params.newPassword)
            userDao.updateUser(params.userId, { password_hash: newHash })
            return { success: true, message: '密码修改成功' }
        } catch (error: any) {
            return { success: false, message: error.message || '修改密码失败' }
        }
    })

    /**
     * 设置安全问题（用于密码找回）
     */
    ipcMain.handle('auth:setSecurityQuestion', (_event, params: { userId: number; question: string; answer: string }) => {
        try {
            const answerHash = hashPassword(params.answer.toLowerCase().trim())
            userDao.setSecurityQuestion(params.userId, params.question, answerHash)
            return { success: true }
        } catch (error: any) {
            return { success: false, message: error.message || '设置安全问题失败' }
        }
    })

    /**
     * 密码找回 — 通过安全问题验证身份
     */
    ipcMain.handle('auth:resetPassword', (_event, params: { username: string; answer: string; newPassword: string }) => {
        try {
            const user = userDao.getUserByUsername(params.username)
            if (!user) return { success: false, message: '用户名不存在' }
            const sq = userDao.getSecurityQuestion(user.id)
            if (!sq || !sq.security_question) {
                return { success: false, message: '该账号未设置安全问题，无法找回密码' }
            }
            const isValid = verifyPassword(params.answer.toLowerCase().trim(), sq.security_answer_hash)
            if (!isValid) return { success: false, message: '安全问题回答错误' }
            const newHash = hashPassword(params.newPassword)
            userDao.updateUser(user.id, { password_hash: newHash })
            return { success: true, message: '密码重置成功' }
        } catch (error: any) {
            return { success: false, message: error.message || '密码重置失败' }
        }
    })

    /**
     * 获取用户安全问题（仅返回问题，不返回答案）
     */
    ipcMain.handle('auth:getSecurityQuestion', (_event, username: string) => {
        try {
            const user = userDao.getUserByUsername(username)
            if (!user) return { success: false, message: '用户名不存在' }
            const sq = userDao.getSecurityQuestion(user.id)
            if (!sq || !sq.security_question) {
                return { success: false, message: '该账号未设置安全问题' }
            }
            return { success: true, question: sq.security_question }
        } catch (error: any) {
            return { success: false, message: error.message || '查询失败' }
        }
    })

    /**
     * 保存头像：选择图片 → 复制到应用目录 → 更新数据库
     */
    ipcMain.handle('user:saveAvatar', async (_event, userId: number) => {
        const result = await dialog.showOpenDialog({
            properties: ['openFile'],
            filters: [{ name: '图片', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'] }],
        })
        if (result.canceled || result.filePaths.length === 0) return null

        const filePath = result.filePaths[0]
        const ext = path.extname(filePath)
        const avatarDir = path.join(app.getPath('userData'), 'avatars')
        if (!fs.existsSync(avatarDir)) {
            fs.mkdirSync(avatarDir, { recursive: true })
        }

        const destPath = path.join(avatarDir, `user_${userId}_${Date.now()}${ext}`)
        fs.copyFileSync(filePath, destPath)

        userDao.updateUser(userId, { avatar: destPath })
        return destPath
    })

    // ======================== 用户相关 ========================
    // 注意：用户创建通过 auth:register 进行（含密码加密），不直接暴露 db:user:create
    // 注意：按用户名查询会返回密码哈希，不直接暴露 db:user:getByUsername
    // 注意：用户名存在性检查已在 auth:register 中处理，不直接暴露 db:user:isUsernameExists

    ipcMain.handle('db:user:getById', (_event, id: number) => {
        const user = userDao.getUserById(id)
        if (!user) return undefined
        // 返回脱敏数据，过滤掉密码哈希
        const { password_hash: _, ...safeUser } = user
        return safeUser
    })

    ipcMain.handle('db:user:update', (_event, id: number, params: userDao.UpdateUserParams) => {
        return userDao.updateUser(id, params)
    })

    // ======================== 任务相关 ========================

    ipcMain.handle('db:task:create', (_event, params: taskDao.CreateTaskParams) => {
        const task = taskDao.createTask(params)
        logDao.createLog({
            user_id: params.user_id,
            action: 'create',
            target_type: 'task',
            target_id: task.id,
            detail: task.name,
        })
        return task
    })

    ipcMain.handle('db:task:getById', (_event, id: number) => {
        return taskDao.getTaskById(id)
    })

    ipcMain.handle('db:task:getByFilter', (_event, filter: taskDao.TaskFilterParams) => {
        return taskDao.getTasksByFilter(filter)
    })

    ipcMain.handle('db:task:update', (_event, id: number, params: taskDao.UpdateTaskParams) => {
        const result = taskDao.updateTask(id, params)
        if (result && params.status === 'done') {
            const task = taskDao.getTaskById(id)
            if (task) {
                logDao.createLog({
                    user_id: task.user_id,
                    action: 'complete',
                    target_type: 'task',
                    target_id: id,
                    detail: task.name,
                })
            }
        }
        return result
    })

    ipcMain.handle('db:task:delete', (_event, id: number) => {
        const task = taskDao.getTaskById(id)
        const result = taskDao.deleteTask(id)
        if (result && task) {
            logDao.createLog({
                user_id: task.user_id,
                action: 'delete',
                target_type: 'task',
                target_id: id,
                detail: task.name,
            })
        }
        return result
    })

    ipcMain.handle('db:task:toggleStatus', (_event, id: number) => {
        const beforeTask = taskDao.getTaskById(id)
        const updatedTask = taskDao.toggleTaskStatus(id)
        if (updatedTask && beforeTask && beforeTask.status !== 'done' && updatedTask.status === 'done') {
            logDao.createLog({
                user_id: updatedTask.user_id,
                action: 'complete',
                target_type: 'task',
                target_id: id,
                detail: updatedTask.name,
            })
        }
        return updatedTask
    })

    ipcMain.handle('db:task:getStatistics', (_event, userId: number) => {
        return taskDao.getTaskStatistics(userId)
    })

    ipcMain.handle('db:task:getStatsByDateRange', (_event, userId: number, startDate: string, endDate: string) => {
        return taskDao.getTaskStatsByDateRange(userId, startDate, endDate)
    })

    // ======================== 分类相关 ========================

    ipcMain.handle('db:category:create', (_event, params: categoryDao.CreateCategoryParams) => {
        return categoryDao.createCategory(params)
    })

    ipcMain.handle('db:category:getById', (_event, id: number) => {
        return categoryDao.getCategoryById(id)
    })

    ipcMain.handle('db:category:getByUserId', (_event, userId: number) => {
        return categoryDao.getCategoriesByUserId(userId)
    })

    ipcMain.handle('db:category:getWithStats', (_event, userId: number) => {
        return categoryDao.getCategoriesWithStats(userId)
    })

    ipcMain.handle('db:category:update', (_event, id: number, params: categoryDao.UpdateCategoryParams) => {
        return categoryDao.updateCategory(id, params)
    })

    ipcMain.handle('db:category:delete', (_event, id: number) => {
        return categoryDao.deleteCategory(id)
    })

    // ======================== 标签相关 ========================

    ipcMain.handle('db:tag:create', (_event, params: tagDao.CreateTagParams) => {
        try {
            return tagDao.createTag(params)
        } catch (error: any) {
            console.error('[IPC] tag:create failed:', error)
            throw error
        }
    })

    ipcMain.handle('db:tag:getByUserId', (_event, userId: number) => {
        return tagDao.getTagsByUserId(userId)
    })

    ipcMain.handle('db:tag:getByTaskId', (_event, taskId: number) => {
        return tagDao.getTagsByTaskId(taskId)
    })

    ipcMain.handle('db:tag:update', (_event, id: number, params: tagDao.UpdateTagParams) => {
        return tagDao.updateTag(id, params)
    })

    ipcMain.handle('db:tag:delete', (_event, id: number) => {
        return tagDao.deleteTag(id)
    })

    ipcMain.handle('db:tag:addToTask', (_event, taskId: number, tagId: number) => {
        return tagDao.addTagToTask(taskId, tagId)
    })

    ipcMain.handle('db:tag:removeFromTask', (_event, taskId: number, tagId: number) => {
        return tagDao.removeTagFromTask(taskId, tagId)
    })

    /**
     * 设置任务的标签（替换全部）
     * 特别注意：tagIds 可能是 Vue Proxy 对象经过 IPC 序列化后的结果，
     * 必须确保转换为普通数字数组
     */
    ipcMain.handle('db:tag:setTaskTags', (_event, taskId: number, tagIds: any) => {
        console.log(`[IPC] setTaskTags 原始参数: taskId=${taskId}, tagIds=${JSON.stringify(tagIds)}, type=${typeof tagIds}, isArray=${Array.isArray(tagIds)}`)

        // 安全转换 tagIds 为普通数字数组
        let plainTagIds: number[] = []
        if (Array.isArray(tagIds)) {
            plainTagIds = tagIds.map((id: any) => Number(id)).filter((id: number) => !isNaN(id) && id > 0)
        } else if (tagIds && typeof tagIds === 'object') {
            // 可能是类数组对象（Vue Proxy 序列化后的结果）
            const keys = Object.keys(tagIds)
            for (const key of keys) {
                const n = Number(tagIds[key])
                if (!isNaN(n) && n > 0) {
                    plainTagIds.push(n)
                }
            }
        }

        console.log(`[IPC] setTaskTags 转换后: taskId=${taskId}, plainTagIds=[${plainTagIds.join(',')}]`)

        const success = tagDao.setTaskTags(taskId, plainTagIds)
        return { success }
    })

    // ======================== 提醒相关 ========================

    ipcMain.handle('db:reminder:create', (_event, params: reminderDao.CreateReminderParams) => {
        return reminderDao.createReminder(params)
    })

    ipcMain.handle('db:reminder:getByTaskId', (_event, taskId: number) => {
        return reminderDao.getRemindersByTaskId(taskId)
    })

    ipcMain.handle('db:reminder:getByUserId', (_event, userId: number) => {
        return reminderDao.getRemindersByUserId(userId)
    })

    ipcMain.handle('db:reminder:getPending', () => {
        return reminderDao.getPendingReminders()
    })

    ipcMain.handle('db:reminder:markTriggered', (_event, id: number) => {
        return reminderDao.markReminderTriggered(id)
    })

    ipcMain.handle('db:reminder:markDismissed', (_event, id: number) => {
        return reminderDao.markReminderDismissed(id)
    })

    ipcMain.handle('db:reminder:delete', (_event, id: number) => {
        return reminderDao.deleteReminder(id)
    })

    // ======================== 附件相关 ========================

    /** 获取附件存储根目录 */
    function getAttachmentsDir(): string {
        const dir = path.join(app.getPath('userData'), 'attachments')
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true })
        }
        return dir
    }

    /** 保存附件：将文件复制到应用数据目录，并记录到数据库 */
    ipcMain.handle('db:attachment:save', async (_event, taskId: number, filePaths: string[]) => {
        const results: attachmentDao.Attachment[] = []
        const attachDir = getAttachmentsDir()
        const taskDir = path.join(attachDir, String(taskId))
        if (!fs.existsSync(taskDir)) {
            fs.mkdirSync(taskDir, { recursive: true })
        }

        for (const filePath of filePaths) {
            const fileName = path.basename(filePath)
            const ext = path.extname(fileName)
            // 生成唯一文件名防止冲突
            const uniqueName = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}${ext}`
            const destPath = path.join(taskDir, uniqueName)

            // 复制文件
            fs.copyFileSync(filePath, destPath)

            const stat = fs.statSync(destPath)
            const mimeType = getMimeType(ext)

            const record = attachmentDao.createAttachment({
                task_id: taskId,
                file_name: fileName,
                file_path: destPath,
                file_size: stat.size,
                mime_type: mimeType,
            })
            results.push(record)
        }
        return results
    })

    /** 选择文件对话框 */
    ipcMain.handle('dialog:openFile', async () => {
        const result = await dialog.showOpenDialog({
            properties: ['openFile', 'multiSelections'],
            filters: [
                { name: '所有文件', extensions: ['*'] },
                { name: '图片', extensions: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg'] },
                { name: '文档', extensions: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'md'] },
            ],
        })
        if (result.canceled) return []
        return result.filePaths
    })

    /** 查询任务的所有附件 */
    ipcMain.handle('db:attachment:getByTaskId', (_event, taskId: number) => {
        return attachmentDao.getAttachmentsByTaskId(taskId)
    })

    /** 删除附件：同时删除物理文件 */
    ipcMain.handle('db:attachment:delete', (_event, id: number) => {
        const attachment = attachmentDao.getAttachmentById(id)
        if (attachment) {
            // 删除物理文件
            try {
                if (fs.existsSync(attachment.file_path)) {
                    fs.unlinkSync(attachment.file_path)
                }
            } catch (e) {
                console.warn('[Attachment] 删除物理文件失败:', e)
            }
        }
        return attachmentDao.deleteAttachment(id)
    })

    /** 用系统默认程序打开附件 */
    ipcMain.handle('attachment:open', async (_event, filePath: string) => {
        try {
            await shell.openPath(filePath)
            return true
        } catch {
            return false
        }
    })

    // ======================== 统计相关 ========================

    ipcMain.handle('db:statistics:byPeriod', (_event, userId: number, startDate: string, endDate: string, period: statisticsDao.PeriodType) => {
        return statisticsDao.getStatsByPeriod(userId, startDate, endDate, period)
    })

    ipcMain.handle('db:statistics:byCategory', (_event, userId: number) => {
        return statisticsDao.getStatsByCategory(userId)
    })

    ipcMain.handle('db:statistics:timeDistribution', (_event, userId: number) => {
        return statisticsDao.getTimeDistribution(userId)
    })

    ipcMain.handle('db:statistics:categoryByPeriod', (_event, userId: number, startDate: string, endDate: string, period: statisticsDao.PeriodType) => {
        return statisticsDao.getCategoryCompletionByPeriod(userId, startDate, endDate, period)
    })

    // ======================== 导出相关 ========================

    ipcMain.handle('statistics:export', async (_event, userId: number, startDate: string, endDate: string, period: statisticsDao.PeriodType) => {
        try {
            const result = await dialog.showSaveDialog({
                title: '导出统计报表',
                defaultPath: `统计报表_${startDate}_${endDate}.xlsx`,
                filters: [{ name: 'Excel 文件', extensions: ['xlsx'] }],
            })

            if (result.canceled || !result.filePath) {
                return { success: false, error: 'cancelled' }
            }

            return await exportStatisticsToExcel({
                userId,
                startDate,
                endDate,
                period,
                savePath: result.filePath,
            })
        } catch (error: any) {
            return { success: false, error: error.message || '导出失败' }
        }
    })

    // ======================== 备份恢复相关 ========================

    /**
     * 创建备份：弹出保存对话框 → 备份数据库 → 记录日志
     */
    ipcMain.handle('backup:create', async (_event, userId?: number) => {
        try {
            const result = await dialog.showSaveDialog({
                title: '备份数据',
                defaultPath: `任务备份_${new Date().toISOString().slice(0, 10)}_${new Date().toTimeString().slice(0, 8).replace(/:/g, '')}.taskbak`,
                filters: [{ name: '备份文件', extensions: ['taskbak'] }],
            })
            if (result.canceled || !result.filePath) {
                return { success: false, error: 'cancelled' }
            }
            const backupResult = backupService.backupDatabase(result.filePath)
            if (backupResult.success && userId) {
                logDao.createLog({
                    user_id: userId,
                    action: 'backup',
                    target_type: 'database',
                    target_id: null,
                    detail: `备份数据库到 ${backupResult.filePath}`,
                })
            }
            return backupResult
        } catch (error: any) {
            return { success: false, error: error.message || '备份失败' }
        }
    })

    /**
     * 恢复备份：弹出文件选择对话框 → 恢复数据库 → 记录日志
     */
    ipcMain.handle('backup:restore', async (_event, userId?: number) => {
        try {
            const result = await dialog.showOpenDialog({
                title: '恢复数据',
                properties: ['openFile'],
                filters: [{ name: '备份文件', extensions: ['taskbak'] }],
            })
            if (result.canceled || result.filePaths.length === 0) {
                return { success: false, error: 'cancelled' }
            }
            const restoreResult = backupService.restoreDatabase(result.filePaths[0])
            if (restoreResult.success && userId) {
                logDao.createLog({
                    user_id: userId,
                    action: 'restore',
                    target_type: 'database',
                    target_id: null,
                    detail: `从 ${result.filePaths[0]} 恢复数据库`,
                })
            }
            return restoreResult
        } catch (error: any) {
            return { success: false, error: error.message || '恢复失败' }
        }
    })

    // ======================== 任务导入导出相关 ========================

    /**
     * 导出任务：弹出保存对话框 → 导出 Excel → 记录日志
     */
    ipcMain.handle('task:export', async (_event, userId: number) => {
        try {
            const result = await dialog.showSaveDialog({
                title: '导出任务',
                defaultPath: `任务导出_${new Date().toISOString().slice(0, 10)}.xlsx`,
                filters: [{ name: 'Excel 文件', extensions: ['xlsx'] }],
            })
            if (result.canceled || !result.filePath) {
                return { success: false, error: 'cancelled' }
            }
            const exportResult = await taskIOService.exportTasksToExcel(userId, result.filePath)
            if (exportResult.success) {
                logDao.createLog({
                    user_id: userId,
                    action: 'export',
                    target_type: 'file',
                    target_id: null,
                    detail: `导出 ${exportResult.taskCount} 个任务到 ${exportResult.filePath}`,
                })
            }
            return exportResult
        } catch (error: any) {
            return { success: false, error: error.message || '导出失败' }
        }
    })

    /**
     * 导入任务：弹出文件选择对话框 → 导入 Excel → 记录日志
     */
    ipcMain.handle('task:import', async (_event, userId: number) => {
        try {
            const result = await dialog.showOpenDialog({
                title: '导入任务',
                properties: ['openFile'],
                filters: [{ name: 'Excel 文件', extensions: ['xlsx'] }],
            })
            if (result.canceled || result.filePaths.length === 0) {
                return { success: false, totalRows: 0, successCount: 0, failCount: 0, errors: [], error: 'cancelled' }
            }
            const importResult = await taskIOService.importTasksFromExcel(userId, result.filePaths[0])
            logDao.createLog({
                user_id: userId,
                action: 'import',
                target_type: 'file',
                target_id: null,
                detail: `从 ${path.basename(result.filePaths[0])} 导入任务，成功 ${importResult.successCount} 条，失败 ${importResult.failCount} 条`,
            })
            return importResult
        } catch (error: any) {
            return { success: false, totalRows: 0, successCount: 0, failCount: 0, errors: [], error: error.message || '导入失败' }
        }
    })

    // ======================== 快捷键相关 ========================

    ipcMain.handle('shortcut:getConfig', () => {
        return shortcutService.loadShortcuts()
    })

    ipcMain.handle('shortcut:saveConfig', (_event, shortcuts: shortcutService.ShortcutConfig[]) => {
        try {
            shortcutService.saveShortcuts(shortcuts)
            return true
        } catch {
            return false
        }
    })

    ipcMain.handle('shortcut:checkConflict', (_event, accelerator: string, excludeActionId: string) => {
        const shortcuts = shortcutService.loadShortcuts()
        return shortcutService.checkConflict(accelerator, excludeActionId, shortcuts)
    })

    // ======================== 操作日志相关 ========================

    ipcMain.handle('db:log:query', (_event, filter: logDao.LogFilter) => {
        return logDao.getLogsByFilter(filter)
    })

    ipcMain.handle('db:log:clean', (_event, userId: number, daysToKeep: number) => {
        return logDao.cleanLogs(userId, daysToKeep)
    })

    console.log('[IPC] 所有数据库 IPC Handler 注册完成')
}

/** 根据扩展名推断 MIME 类型 */
function getMimeType(ext: string): string {
    const map: Record<string, string> = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.gif': 'image/gif',
        '.bmp': 'image/bmp',
        '.webp': 'image/webp',
        '.svg': 'image/svg+xml',
        '.pdf': 'application/pdf',
        '.doc': 'application/msword',
        '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        '.xls': 'application/vnd.ms-excel',
        '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        '.ppt': 'application/vnd.ms-powerpoint',
        '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        '.txt': 'text/plain',
        '.md': 'text/markdown',
        '.zip': 'application/zip',
        '.rar': 'application/x-rar-compressed',
    }
    return map[ext.toLowerCase()] || 'application/octet-stream'
}
