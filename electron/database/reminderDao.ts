/**
 * 提醒数据访问层 (Reminder DAO)
 *
 * 提供提醒相关的 CRUD 操作和到期提醒查询
 */

import { getDatabase } from './index'

// ==================== 类型定义 ====================

export interface Reminder {
    id: number
    task_id: number
    remind_at: string
    type: 'once' | 'repeat'
    repeat_rule: string | null
    is_triggered: number   // 0 或 1
    is_dismissed: number   // 0 或 1
    created_at: string
}

/** 提醒（附带任务名称，方便展示） */
export interface ReminderWithTask extends Reminder {
    task_name: string
    task_priority: string
    user_id: number
}

export interface CreateReminderParams {
    task_id: number
    remind_at: string
    type?: 'once' | 'repeat'
    repeat_rule?: string | null
}

// ==================== DAO 方法 ====================

/**
 * 创建提醒
 */
export function createReminder(params: CreateReminderParams): Reminder {
    const db = getDatabase()
    const stmt = db.prepare(`
    INSERT INTO reminders (task_id, remind_at, type, repeat_rule)
    VALUES (@task_id, @remind_at, @type, @repeat_rule)
  `)
    const result = stmt.run({
        task_id: params.task_id,
        remind_at: params.remind_at,
        type: params.type || 'once',
        repeat_rule: params.repeat_rule ?? null,
    })
    return getReminderById(result.lastInsertRowid as number)!
}

/**
 * 根据 ID 查询提醒
 */
export function getReminderById(id: number): Reminder | undefined {
    const db = getDatabase()
    const stmt = db.prepare('SELECT * FROM reminders WHERE id = ?')
    return stmt.get(id) as Reminder | undefined
}

/**
 * 查询某任务的所有提醒
 */
export function getRemindersByTaskId(taskId: number): Reminder[] {
    const db = getDatabase()
    const stmt = db.prepare('SELECT * FROM reminders WHERE task_id = ? ORDER BY remind_at ASC')
    return stmt.all(taskId) as Reminder[]
}

/**
 * 查询用户的所有提醒记录（带任务信息）
 */
export function getRemindersByUserId(userId: number): ReminderWithTask[] {
    const db = getDatabase()
    const stmt = db.prepare(`
    SELECT r.*, t.name as task_name, t.priority as task_priority, t.user_id as user_id
    FROM reminders r
    INNER JOIN tasks t ON r.task_id = t.id
    WHERE t.user_id = ?
    ORDER BY r.remind_at DESC
  `)
    return stmt.all(userId) as ReminderWithTask[]
}

/**
 * 查询即将到期的提醒（未触发 & 未处理）
 * 用于定时检查并发送桌面通知
 */
export function getPendingReminders(): ReminderWithTask[] {
    const db = getDatabase()
    const stmt = db.prepare(`
    SELECT r.*, t.name as task_name, t.priority as task_priority, t.user_id as user_id
    FROM reminders r
    INNER JOIN tasks t ON r.task_id = t.id
    WHERE r.is_triggered = 0
      AND r.is_dismissed = 0
      AND r.remind_at <= datetime('now','localtime')
    ORDER BY r.remind_at ASC
  `)
    return stmt.all() as ReminderWithTask[]
}

/**
 * 标记提醒已触发
 */
export function markReminderTriggered(id: number): boolean {
    const db = getDatabase()
    const stmt = db.prepare('UPDATE reminders SET is_triggered = 1 WHERE id = ?')
    const result = stmt.run(id)
    return result.changes > 0
}

/**
 * 标记提醒已处理（用户手动处理）
 */
export function markReminderDismissed(id: number): boolean {
    const db = getDatabase()
    const stmt = db.prepare('UPDATE reminders SET is_dismissed = 1 WHERE id = ?')
    const result = stmt.run(id)
    return result.changes > 0
}

/**
 * 删除提醒
 */
export function deleteReminder(id: number): boolean {
    const db = getDatabase()
    const stmt = db.prepare('DELETE FROM reminders WHERE id = ?')
    const result = stmt.run(id)
    return result.changes > 0
}

/**
 * 删除任务下的所有提醒
 */
export function deleteRemindersByTaskId(taskId: number): number {
    const db = getDatabase()
    const stmt = db.prepare('DELETE FROM reminders WHERE task_id = ?')
    const result = stmt.run(taskId)
    return result.changes
}
