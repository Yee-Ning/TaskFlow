/**
 * 任务数据访问层 (Task DAO)
 *
 * 提供任务相关的 CRUD 操作、筛选、搜索、统计
 */

import { getDatabase } from './index'

// ==================== 类型定义 ====================

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
}

/** 创建任务的传入参数 */
export interface CreateTaskParams {
    user_id: number
    category_id?: number | null
    name: string
    description?: string
    priority?: 'high' | 'medium' | 'low'
    deadline?: string | null
    estimated_time?: number
}

/** 更新任务的传入参数 */
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

/** 任务查询筛选条件 */
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

/** 任务统计数据 */
export interface TaskStatistics {
    total: number
    todo: number
    in_progress: number
    done: number
    completion_rate: number
}

// ==================== DAO 方法 ====================

/**
 * 创建任务
 */
export function createTask(params: CreateTaskParams): Task {
    const db = getDatabase()
    const stmt = db.prepare(`
    INSERT INTO tasks (user_id, category_id, name, description, priority, deadline, estimated_time)
    VALUES (@user_id, @category_id, @name, @description, @priority, @deadline, @estimated_time)
  `)
    const result = stmt.run({
        user_id: params.user_id,
        category_id: params.category_id ?? null,
        name: params.name,
        description: params.description || '',
        priority: params.priority || 'medium',
        deadline: params.deadline ?? null,
        estimated_time: params.estimated_time || 0,
    })
    const task = getTaskById(result.lastInsertRowid as number)
    if (!task) {
        throw new Error('创建任务后查询失败，请重试')
    }
    return task
}

/**
 * 根据 ID 查询任务
 */
export function getTaskById(id: number): Task | undefined {
    const db = getDatabase()
    const stmt = db.prepare('SELECT * FROM tasks WHERE id = ?')
    return stmt.get(id) as Task | undefined
}

/**
 * 查询用户的所有任务（支持筛选）
 */
export function getTasksByFilter(filter: TaskFilterParams): Task[] {
    const db = getDatabase()
    const conditions: string[] = ['t.user_id = @user_id']
    const values: Record<string, unknown> = { user_id: filter.user_id }

    if (filter.category_id !== undefined) {
        if (filter.category_id === null) {
            conditions.push('t.category_id IS NULL')
        } else {
            conditions.push('t.category_id = @category_id')
            values.category_id = filter.category_id
        }
    }

    if (filter.priority) {
        conditions.push('t.priority = @priority')
        values.priority = filter.priority
    }

    if (filter.status) {
        conditions.push('t.status = @status')
        values.status = filter.status
    }

    if (filter.keyword) {
        conditions.push('(t.name LIKE @keyword OR t.description LIKE @keyword)')
        values.keyword = `%${filter.keyword}%`
    }

    if (filter.deadline_start) {
        conditions.push('t.deadline >= @deadline_start')
        values.deadline_start = filter.deadline_start
    }

    if (filter.deadline_end) {
        conditions.push('t.deadline <= @deadline_end')
        values.deadline_end = filter.deadline_end
    }

    let sql = `SELECT DISTINCT t.* FROM tasks t`

    // 如果按标签筛选，需要 JOIN task_tags 表
    if (filter.tag_id) {
        sql += ` INNER JOIN task_tags tt ON t.id = tt.task_id`
        conditions.push('tt.tag_id = @tag_id')
        values.tag_id = filter.tag_id
    }

    sql += ` WHERE ${conditions.join(' AND ')}`
    sql += ` ORDER BY
    CASE t.status
      WHEN 'todo' THEN 1
      WHEN 'in_progress' THEN 2
      WHEN 'done' THEN 3
    END,
    CASE t.priority
      WHEN 'high' THEN 1
      WHEN 'medium' THEN 2
      WHEN 'low' THEN 3
    END,
    t.deadline ASC NULLS LAST,
    t.created_at DESC`

    const stmt = db.prepare(sql)
    return stmt.all(values) as Task[]
}

/**
 * 更新任务
 */
export function updateTask(id: number, params: UpdateTaskParams): boolean {
    const db = getDatabase()
    const fields: string[] = []
    const values: Record<string, unknown> = { id }

    if (params.category_id !== undefined) {
        fields.push('category_id = @category_id')
        values.category_id = params.category_id
    }
    if (params.name !== undefined) {
        fields.push('name = @name')
        values.name = params.name
    }
    if (params.description !== undefined) {
        fields.push('description = @description')
        values.description = params.description
    }
    if (params.priority !== undefined) {
        fields.push('priority = @priority')
        values.priority = params.priority
    }
    if (params.status !== undefined) {
        fields.push('status = @status')
        values.status = params.status
        // 如果标记为完成，自动设置完成时间
        if (params.status === 'done') {
            fields.push("completed_at = datetime('now','localtime')")
        } else {
            fields.push('completed_at = NULL')
        }
    }
    if (params.progress !== undefined) {
        fields.push('progress = @progress')
        values.progress = params.progress
    }
    if (params.deadline !== undefined) {
        fields.push('deadline = @deadline')
        values.deadline = params.deadline
    }
    if (params.estimated_time !== undefined) {
        fields.push('estimated_time = @estimated_time')
        values.estimated_time = params.estimated_time
    }
    if (params.actual_time !== undefined) {
        fields.push('actual_time = @actual_time')
        values.actual_time = params.actual_time
    }

    if (fields.length === 0) return false

    fields.push("updated_at = datetime('now','localtime')")

    const sql = `UPDATE tasks SET ${fields.join(', ')} WHERE id = @id`
    const stmt = db.prepare(sql)
    const result = stmt.run(values)
    return result.changes > 0
}

/**
 * 删除任务
 */
export function deleteTask(id: number): boolean {
    const db = getDatabase()
    const stmt = db.prepare('DELETE FROM tasks WHERE id = ?')
    const result = stmt.run(id)
    return result.changes > 0
}

/**
 * 切换任务完成状态（快捷操作）
 */
export function toggleTaskStatus(id: number): Task | undefined {
    const task = getTaskById(id)
    if (!task) return undefined

    const newStatus = task.status === 'done' ? 'todo' : 'done'
    const newProgress = newStatus === 'done' ? 100 : (task.progress === 100 ? 0 : task.progress)

    updateTask(id, { status: newStatus, progress: newProgress })
    return getTaskById(id)
}

/**
 * 获取任务统计信息
 */
export function getTaskStatistics(userId: number): TaskStatistics {
    const db = getDatabase()
    const stmt = db.prepare(`
    SELECT
      COUNT(*)                                    as total,
      SUM(CASE WHEN status = 'todo' THEN 1 ELSE 0 END)        as todo,
      SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress,
      SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END)        as done
    FROM tasks
    WHERE user_id = ?
  `)
    const row = stmt.get(userId) as { total: number; todo: number; in_progress: number; done: number }
    return {
        ...row,
        completion_rate: row.total > 0 ? Math.round((row.done / row.total) * 100) : 0,
    }
}

/**
 * 按日期范围统计任务数据（用于图表）
 */
export function getTaskStatsByDateRange(
    userId: number,
    startDate: string,
    endDate: string
): { date: string; created: number; completed: number }[] {
    const db = getDatabase()
    const stmt = db.prepare(`
    WITH RECURSIVE dates(date) AS (
      SELECT @start_date
      UNION ALL
      SELECT date(date, '+1 day')
      FROM dates
      WHERE date < @end_date
    )
    SELECT
      d.date,
      COALESCE(c.created, 0)   as created,
      COALESCE(comp.completed, 0) as completed
    FROM dates d
    LEFT JOIN (
      SELECT date(created_at) as dt, COUNT(*) as created
      FROM tasks WHERE user_id = @user_id
      GROUP BY date(created_at)
    ) c ON d.date = c.dt
    LEFT JOIN (
      SELECT date(completed_at) as dt, COUNT(*) as completed
      FROM tasks WHERE user_id = @user_id AND status = 'done'
      GROUP BY date(completed_at)
    ) comp ON d.date = comp.dt
    ORDER BY d.date
  `)
    return stmt.all({
        user_id: userId,
        start_date: startDate,
        end_date: endDate,
    }) as { date: string; created: number; completed: number }[]
}
