/**
 * 附件数据访问层 (Attachment DAO)
 *
 * 提供附件相关的 CRUD 操作
 */

import { getDatabase } from './index'

// ==================== 类型定义 ====================

export interface Attachment {
    id: number
    task_id: number
    file_name: string
    file_path: string
    file_size: number
    mime_type: string
    created_at: string
}

export interface CreateAttachmentParams {
    task_id: number
    file_name: string
    file_path: string
    file_size: number
    mime_type: string
}

// ==================== DAO 方法 ====================

/**
 * 创建附件记录
 */
export function createAttachment(params: CreateAttachmentParams): Attachment {
    const db = getDatabase()
    const stmt = db.prepare(`
    INSERT INTO attachments (task_id, file_name, file_path, file_size, mime_type)
    VALUES (@task_id, @file_name, @file_path, @file_size, @mime_type)
  `)
    const result = stmt.run({
        task_id: params.task_id,
        file_name: params.file_name,
        file_path: params.file_path,
        file_size: params.file_size,
        mime_type: params.mime_type,
    })
    const attachment = getAttachmentById(result.lastInsertRowid as number)
    if (!attachment) {
        throw new Error('创建附件记录后查询失败')
    }
    return attachment
}

/**
 * 根据 ID 查询附件
 */
export function getAttachmentById(id: number): Attachment | undefined {
    const db = getDatabase()
    const stmt = db.prepare('SELECT * FROM attachments WHERE id = ?')
    return stmt.get(id) as Attachment | undefined
}

/**
 * 查询任务的所有附件
 */
export function getAttachmentsByTaskId(taskId: number): Attachment[] {
    const db = getDatabase()
    const stmt = db.prepare('SELECT * FROM attachments WHERE task_id = ? ORDER BY created_at DESC')
    return stmt.all(taskId) as Attachment[]
}

/**
 * 删除附件记录
 */
export function deleteAttachment(id: number): boolean {
    const db = getDatabase()
    const stmt = db.prepare('DELETE FROM attachments WHERE id = ?')
    const result = stmt.run(id)
    return result.changes > 0
}

/**
 * 删除任务的所有附件记录
 */
export function deleteAttachmentsByTaskId(taskId: number): number {
    const db = getDatabase()
    const stmt = db.prepare('DELETE FROM attachments WHERE task_id = ?')
    const result = stmt.run(taskId)
    return result.changes
}
