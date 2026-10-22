/**
 * 提醒服务 (Reminder Service)
 *
 * 在主进程中定时轮询到期提醒，触发桌面通知，
 * 并将提醒事件推送给渲染进程。
 */

import { Notification, BrowserWindow } from 'electron'
import * as reminderDao from '../database/reminderDao'
import { createLog } from '../database/logDao'

// 轮询间隔（毫秒）
const POLL_INTERVAL = 30_000 // 30 秒

let pollTimer: ReturnType<typeof setInterval> | null = null

/**
 * 启动提醒服务
 * 在 app.whenReady() 后调用
 */
export function startReminderService(): void {
    console.log('[ReminderService] 启动提醒轮询服务')

    // 立即执行一次检查
    checkPendingReminders()

    // 设置定时轮询
    pollTimer = setInterval(() => {
        checkPendingReminders()
    }, POLL_INTERVAL)
}

/**
 * 停止提醒服务
 * 在应用退出时调用
 */
export function stopReminderService(): void {
    if (pollTimer) {
        clearInterval(pollTimer)
        pollTimer = null
        console.log('[ReminderService] 提醒轮询服务已停止')
    }
}

/**
 * 检查并处理到期提醒
 */
function checkPendingReminders(): void {
    try {
        const pending = reminderDao.getPendingReminders()

        if (pending.length === 0) return

        console.log(`[ReminderService] 发现 ${pending.length} 条到期提醒`)

        for (const reminder of pending) {
            // 1. 发送桌面通知
            sendDesktopNotification(reminder)

            // 2. 通知渲染进程（应用内弹窗）
            sendToRenderer(reminder)

            // 3. 标记为已触发
            reminderDao.markReminderTriggered(reminder.id)

            // 4. 记录操作日志
            createLog({
                user_id: reminder.user_id,
                action: 'remind',
                target_type: 'reminder',
                target_id: reminder.id,
                detail: reminder.task_name,
            })

            // 4. 如果是重复提醒，创建下一次提醒
            if (reminder.type === 'repeat' && reminder.repeat_rule) {
                createNextRepeatReminder(reminder)
            }
        }
    } catch (error) {
        console.error('[ReminderService] 检查提醒时出错:', error)
    }
}

/**
 * 发送桌面通知
 */
function sendDesktopNotification(reminder: reminderDao.ReminderWithTask): void {
    if (!Notification.isSupported()) {
        console.warn('[ReminderService] 系统不支持桌面通知')
        return
    }

    const priorityLabel: Record<string, string> = {
        high: '🔴 高优先级',
        medium: '🟡 中优先级',
        low: '🟢 低优先级',
    }

    const notification = new Notification({
        title: '⏰ 任务提醒',
        body: `${reminder.task_name}\n${priorityLabel[reminder.task_priority] || ''}`,
        silent: false,
        urgency: reminder.task_priority === 'high' ? 'critical' : 'normal',
    })

    // 点击通知时聚焦窗口
    notification.on('click', () => {
        const wins = BrowserWindow.getAllWindows()
        if (wins.length > 0) {
            const win = wins[0]
            if (win.isMinimized()) win.restore()
            win.focus()
        }
    })

    notification.show()
}

/**
 * 向渲染进程推送提醒事件
 */
function sendToRenderer(reminder: reminderDao.ReminderWithTask): void {
    const wins = BrowserWindow.getAllWindows()
    if (wins.length > 0) {
        wins[0].webContents.send('reminder:triggered', {
            id: reminder.id,
            task_id: reminder.task_id,
            task_name: reminder.task_name,
            task_priority: reminder.task_priority,
            remind_at: reminder.remind_at,
            type: reminder.type,
        })
    }
}

/**
 * 为重复提醒创建下一次提醒记录
 */
function createNextRepeatReminder(reminder: reminderDao.ReminderWithTask): void {
    try {
        const currentTime = new Date(reminder.remind_at)
        let nextTime: Date | null = null

        switch (reminder.repeat_rule) {
            case 'daily':
                nextTime = new Date(currentTime.getTime() + 24 * 60 * 60 * 1000)
                break
            case 'weekly':
                nextTime = new Date(currentTime.getTime() + 7 * 24 * 60 * 60 * 1000)
                break
            case 'monthly':
                nextTime = new Date(currentTime)
                nextTime.setMonth(nextTime.getMonth() + 1)
                break
            default:
                // 不支持的重复规则，不创建
                return
        }

        if (nextTime) {
            // 格式化为 YYYY-MM-DD HH:MM:SS
            const formatted = nextTime.getFullYear() + '-' +
                String(nextTime.getMonth() + 1).padStart(2, '0') + '-' +
                String(nextTime.getDate()).padStart(2, '0') + ' ' +
                String(nextTime.getHours()).padStart(2, '0') + ':' +
                String(nextTime.getMinutes()).padStart(2, '0') + ':' +
                String(nextTime.getSeconds()).padStart(2, '0')

            reminderDao.createReminder({
                task_id: reminder.task_id,
                remind_at: formatted,
                type: 'repeat',
                repeat_rule: reminder.repeat_rule,
            })

            console.log(`[ReminderService] 已创建下一次重复提醒: ${formatted}`)
        }
    } catch (error) {
        console.error('[ReminderService] 创建重复提醒失败:', error)
    }
}
