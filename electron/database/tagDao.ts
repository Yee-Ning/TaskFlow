/**
 * 标签数据访问层 (Tag DAO)
 *
 * 提供标签相关的 CRUD 操作和任务关联管理
 */

import { getDatabase } from './index'

// ==================== 类型定义 ====================

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

// ==================== DAO 方法 ====================

/**
 * 创建标签
 */
export function createTag(params: CreateTagParams): Tag {
    const db = getDatabase()
    const stmt = db.prepare(`
    INSERT INTO tags (user_id, name, color)
    VALUES (@user_id, @name, @color)
  `)
    const result = stmt.run({
        user_id: params.user_id,
        name: params.name,
        color: params.color || '#909399',
    })
    return getTagById(result.lastInsertRowid as number)!
}

/**
 * 根据 ID 查询标签
 */
export function getTagById(id: number): Tag | undefined {
    const db = getDatabase()
    const stmt = db.prepare('SELECT * FROM tags WHERE id = ?')
    return stmt.get(id) as Tag | undefined
}

/**
 * 查询用户的所有标签
 */
export function getTagsByUserId(userId: number): Tag[] {
    const db = getDatabase()
    const stmt = db.prepare('SELECT * FROM tags WHERE user_id = ? ORDER BY created_at ASC')
    return stmt.all(userId) as Tag[]
}

/**
 * 查询某个任务的所有标签
 */
export function getTagsByTaskId(taskId: number): Tag[] {
    const db = getDatabase()
    const stmt = db.prepare(`
    SELECT t.* FROM tags t
    INNER JOIN task_tags tt ON t.id = tt.tag_id
    WHERE tt.task_id = ?
    ORDER BY t.name ASC
  `)
    return stmt.all(taskId) as Tag[]
}

/**
 * 更新标签
 */
export function updateTag(id: number, params: UpdateTagParams): boolean {
    const db = getDatabase()
    const fields: string[] = []
    const values: Record<string, unknown> = { id }

    if (params.name !== undefined) {
        fields.push('name = @name')
        values.name = params.name
    }
    if (params.color !== undefined) {
        fields.push('color = @color')
        values.color = params.color
    }

    if (fields.length === 0) return false

    const sql = `UPDATE tags SET ${fields.join(', ')} WHERE id = @id`
    const stmt = db.prepare(sql)
    const result = stmt.run(values)
    return result.changes > 0
}

/**
 * 删除标签（级联删除关联关系）
 */
export function deleteTag(id: number): boolean {
    const db = getDatabase()
    const stmt = db.prepare('DELETE FROM tags WHERE id = ?')
    const result = stmt.run(id)
    return result.changes > 0
}

// ==================== 任务-标签 关联操作 ====================

/**
 * 为任务添加标签
 */
export function addTagToTask(taskId: number, tagId: number): boolean {
    const db = getDatabase()
    try {
        const stmt = db.prepare('INSERT OR IGNORE INTO task_tags (task_id, tag_id) VALUES (?, ?)')
        stmt.run(taskId, tagId)
        return true
    } catch {
        return false
    }
}

/**
 * 从任务移除标签
 */
export function removeTagFromTask(taskId: number, tagId: number): boolean {
    const db = getDatabase()
    const stmt = db.prepare('DELETE FROM task_tags WHERE task_id = ? AND tag_id = ?')
    const result = stmt.run(taskId, tagId)
    return result.changes > 0
}

/**
 * 设置任务的标签（替换全部）
 * @param taskId 任务 ID
 * @param tagIds 标签 ID 数组（必须是普通数组，不能是 Proxy）
 * @returns 是否成功
 */
export function setTaskTags(taskId: number, tagIds: number[]): boolean {
    const db = getDatabase()

    const tid = Number(taskId)
    if (isNaN(tid) || tid <= 0) {
        console.error('[TagDAO] setTaskTags: 无效的 taskId:', taskId)
        return false
    }

    // 确保 tagIds 是安全的纯数字数组
    const safeIds: number[] = []
    if (tagIds && typeof tagIds === 'object') {
        for (let i = 0; i < tagIds.length; i++) {
            const n = Number(tagIds[i])
            if (!isNaN(n) && n > 0) {
                safeIds.push(n)
            }
        }
    }

    console.log(`[TagDAO] setTaskTags: taskId=${tid}, tagIds=[${safeIds.join(',')}]`)

    try {
        // 预编译语句
        const deleteStmt = db.prepare('DELETE FROM task_tags WHERE task_id = ?')
        const insertStmt = db.prepare('INSERT OR IGNORE INTO task_tags (task_id, tag_id) VALUES (?, ?)')

        // 事务执行
        const execTransaction = db.transaction(() => {
            deleteStmt.run(tid)
            for (const tagId of safeIds) {
                insertStmt.run(tid, tagId)
            }
        })

        execTransaction()
        console.log(`[TagDAO] setTaskTags 成功: taskId=${tid}, 共 ${safeIds.length} 个标签`)
        return true
    } catch (e: any) {
        console.error('[TagDAO] setTaskTags 失败:', e?.message || e)
        return false
    }
}
