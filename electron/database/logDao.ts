/**
 * 操作日志数据访问层 (Log DAO)
 *
 * 提供操作日志的创建、分页查询、清理功能
 */

import { getDatabase } from './index'

// ==================== 类型定义 ====================

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

// ==================== DAO 方法 ====================

/**
 * 创建操作日志
 * 注意：日志写入失败不应阻塞主操作流程，因此捕获异常并打印错误日志
 */
export function createLog(params: Omit<OperationLog, 'id' | 'created_at'>): OperationLog | null {
  try {
    const db = getDatabase()
    const stmt = db.prepare(`
      INSERT INTO operation_logs (user_id, action, target_type, target_id, detail)
      VALUES (@user_id, @action, @target_type, @target_id, @detail)
    `)
    const result = stmt.run({
      user_id: params.user_id,
      action: params.action,
      target_type: params.target_type,
      target_id: params.target_id ?? null,
      detail: params.detail || '',
    })

    const log = db.prepare('SELECT * FROM operation_logs WHERE id = ?').get(result.lastInsertRowid as number) as OperationLog | undefined
    if (!log) {
      console.error('[LogDao] 创建日志后查询失败')
      return null
    }
    return log
  } catch (error) {
    console.error('[LogDao] 创建操作日志失败:', error)
    return null
  }
}

/**
 * 分页查询日志（支持筛选）
 */
export function getLogsByFilter(filter: LogFilter): LogPage {
  const db = getDatabase()
  const page = Math.max(1, filter.page || 1)
  const pageSize = Math.max(1, filter.page_size || 50)

  const conditions: string[] = ['user_id = @user_id']
  const values: Record<string, unknown> = { user_id: filter.user_id }

  if (filter.action) {
    conditions.push('action = @action')
    values.action = filter.action
  }

  if (filter.target_type) {
    conditions.push('target_type = @target_type')
    values.target_type = filter.target_type
  }

  if (filter.start_date) {
    conditions.push('created_at >= @start_date')
    values.start_date = filter.start_date
  }

  if (filter.end_date) {
    conditions.push('created_at <= @end_date')
    values.end_date = filter.end_date
  }

  const whereClause = conditions.join(' AND ')

  // 查询总数
  const countStmt = db.prepare(`SELECT COUNT(*) as total FROM operation_logs WHERE ${whereClause}`)
  const { total } = countStmt.get(values) as { total: number }

  // 分页查询
  const offset = (page - 1) * pageSize
  const dataStmt = db.prepare(
    `SELECT * FROM operation_logs WHERE ${whereClause} ORDER BY created_at DESC LIMIT @limit OFFSET @offset`
  )
  const logs = dataStmt.all({ ...values, limit: pageSize, offset }) as OperationLog[]

  return { logs, total, page, page_size: pageSize }
}

/**
 * 清理指定天数之前的日志
 * @returns 删除的记录数
 */
export function cleanLogs(userId: number, daysToKeep: number): number {
  const db = getDatabase()
  const stmt = db.prepare(`
    DELETE FROM operation_logs
    WHERE user_id = @user_id AND created_at < datetime('now', 'localtime', @days_offset)
  `)
  const result = stmt.run({
    user_id: userId,
    days_offset: `-${daysToKeep} days`,
  })
  return result.changes
}
