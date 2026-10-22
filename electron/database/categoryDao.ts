/**
 * 分类数据访问层 (Category DAO)
 *
 * 提供分类相关的 CRUD 操作和统计
 */

import { getDatabase } from './index'

// ==================== 类型定义 ====================

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

/** 分类统计信息（含任务计数） */
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

// ==================== DAO 方法 ====================

/**
 * 创建分类
 */
export function createCategory(params: CreateCategoryParams): Category {
    const db = getDatabase()
    const stmt = db.prepare(`
    INSERT INTO categories (user_id, name, icon, color, sort_order)
    VALUES (@user_id, @name, @icon, @color, @sort_order)
  `)
    const result = stmt.run({
        user_id: params.user_id,
        name: params.name,
        icon: params.icon || '📁',
        color: params.color || '#409EFF',
        sort_order: params.sort_order || 0,
    })
    return getCategoryById(result.lastInsertRowid as number)!
}

/**
 * 根据 ID 查询分类
 */
export function getCategoryById(id: number): Category | undefined {
    const db = getDatabase()
    const stmt = db.prepare('SELECT * FROM categories WHERE id = ?')
    return stmt.get(id) as Category | undefined
}

/**
 * 查询用户的所有分类
 */
export function getCategoriesByUserId(userId: number): Category[] {
    const db = getDatabase()
    const stmt = db.prepare('SELECT * FROM categories WHERE user_id = ? ORDER BY sort_order ASC, created_at ASC')
    return stmt.all(userId) as Category[]
}

/**
 * 查询用户的所有分类（带统计信息）
 */
export function getCategoriesWithStats(userId: number): CategoryWithStats[] {
    const db = getDatabase()
    const stmt = db.prepare(`
    SELECT
      c.*,
      COALESCE(stats.total_tasks, 0)   as total_tasks,
      COALESCE(stats.done_tasks, 0)    as done_tasks,
      COALESCE(stats.total_tasks - stats.done_tasks, 0) as pending_tasks
    FROM categories c
    LEFT JOIN (
      SELECT
        category_id,
        COUNT(*)                                           as total_tasks,
        SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END)  as done_tasks
      FROM tasks
      WHERE user_id = ?
      GROUP BY category_id
    ) stats ON c.id = stats.category_id
    WHERE c.user_id = ?
    ORDER BY c.sort_order ASC, c.created_at ASC
  `)
    return stmt.all(userId, userId) as CategoryWithStats[]
}

/**
 * 更新分类
 */
export function updateCategory(id: number, params: UpdateCategoryParams): boolean {
    const db = getDatabase()
    const fields: string[] = []
    const values: Record<string, unknown> = { id }

    if (params.name !== undefined) {
        fields.push('name = @name')
        values.name = params.name
    }
    if (params.icon !== undefined) {
        fields.push('icon = @icon')
        values.icon = params.icon
    }
    if (params.color !== undefined) {
        fields.push('color = @color')
        values.color = params.color
    }
    if (params.sort_order !== undefined) {
        fields.push('sort_order = @sort_order')
        values.sort_order = params.sort_order
    }

    if (fields.length === 0) return false

    fields.push("updated_at = datetime('now','localtime')")

    const sql = `UPDATE categories SET ${fields.join(', ')} WHERE id = @id`
    const stmt = db.prepare(sql)
    const result = stmt.run(values)
    return result.changes > 0
}

/**
 * 删除分类
 * 注意：删除分类后，该分类下的任务的 category_id 会被设为 NULL
 */
export function deleteCategory(id: number): boolean {
    const db = getDatabase()
    const stmt = db.prepare('DELETE FROM categories WHERE id = ?')
    const result = stmt.run(id)
    return result.changes > 0
}
