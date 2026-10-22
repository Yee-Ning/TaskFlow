/**
 * 统计数据访问层 (Statistics DAO)
 *
 * 提供任务数据的周期统计、分类统计、耗时分析等聚合查询
 */

import { getDatabase } from './index'

// ==================== 类型定义 ====================

/** 周期统计单元 */
export interface PeriodStatItem {
  period: string
  created_count: number
  completed_count: number
  completion_rate: number // 0-100
}

/** 分类统计项 */
export interface CategoryStatItem {
  category_id: number | null
  category_name: string
  icon: string
  color: string
  total_tasks: number
  completed_tasks: number
  completion_rate: number
}

/** 分类耗时统计项 */
export interface CategoryTimeItem {
  category_id: number | null
  category_name: string
  total_time: number   // 总耗时（分钟）
  avg_time: number     // 平均单任务耗时（分钟）
  task_count: number   // 有耗时记录的任务数
}

/** 分类周期完成数项 */
export interface CategoryCompletionByPeriodItem {
  period: string
  category_name: string
  completed_count: number
}

export type PeriodType = 'day' | 'week' | 'month'

// ==================== 辅助函数 ====================

/**
 * 根据周期类型返回 SQLite 日期格式化表达式
 */
function getPeriodExpression(period: PeriodType, column: string): string {
  switch (period) {
    case 'day':
      return `date(${column})`
    case 'week':
      return `strftime('%Y-W%W', ${column})`
    case 'month':
      return `strftime('%Y-%m', ${column})`
  }
}

/**
 * 根据周期类型返回递归 CTE 的日期递增表达式
 */
function getPeriodIncrement(period: PeriodType): string {
  switch (period) {
    case 'day':
      return '+1 day'
    case 'week':
      return '+7 day'
    case 'month':
      return '+1 month'
  }
}

/**
 * 根据周期类型格式化起始日期为周期标签
 */
function formatDateToPeriod(period: PeriodType, dateStr: string): string {
  switch (period) {
    case 'day':
      return dateStr // YYYY-MM-DD
    case 'week': {
      // 使用与 SQLite strftime('%W') 一致的周数计算
      const d = new Date(dateStr)
      const yearStart = new Date(d.getFullYear(), 0, 1)
      const dayOfYear = Math.floor((d.getTime() - yearStart.getTime()) / 86400000)
      const weekNum = Math.floor((dayOfYear + yearStart.getDay()) / 7)
      return `${d.getFullYear()}-W${String(weekNum).padStart(2, '0')}`
    }
    case 'month':
      return dateStr.substring(0, 7) // YYYY-MM
  }
}

// ==================== DAO 方法 ====================

/**
 * 按周期统计任务数据
 *
 * 使用 SQLite 递归 CTE 生成日期序列，LEFT JOIN 聚合创建数和完成数。
 * 创建数为 0 时完成率返回 0。
 *
 * @param userId    用户 ID
 * @param startDate 开始日期 YYYY-MM-DD
 * @param endDate   结束日期 YYYY-MM-DD
 * @param period    周期粒度 day/week/month
 */
export function getStatsByPeriod(
  userId: number,
  startDate: string,
  endDate: string,
  period: PeriodType
): PeriodStatItem[] {
  const db = getDatabase()
  const periodExpr = getPeriodExpression(period, 'created_at')
  const completedPeriodExpr = getPeriodExpression(period, 'completed_at')
  const increment = getPeriodIncrement(period)

  // 对起始日期做周期对齐
  const startPeriod = formatDateToPeriod(period, startDate)

  const sql = `
    WITH RECURSIVE date_series(period_label) AS (
      SELECT ${period === 'day' ? '@start_date' : `'${startPeriod}'`}
      UNION ALL
      SELECT ${
        period === 'day'
          ? `date(period_label, '${increment}')`
          : period === 'week'
            ? `strftime('%Y-W%W', date(substr(period_label, 1, 4) || '-01-01', '+' || (CAST(substr(period_label, 7) AS INTEGER) * 7) || ' days', '${increment}'))`
            : `strftime('%Y-%m', date(period_label || '-01', '${increment}'))`
      }
      FROM date_series
      WHERE period_label < ${period === 'day' ? '@end_date' : `'${formatDateToPeriod(period, endDate)}'`}
    ),
    created_stats AS (
      SELECT ${periodExpr} AS p, COUNT(*) AS cnt
      FROM tasks
      WHERE user_id = @user_id
        AND date(created_at) >= @start_date
        AND date(created_at) <= @end_date
      GROUP BY p
    ),
    completed_stats AS (
      SELECT ${completedPeriodExpr} AS p, COUNT(*) AS cnt
      FROM tasks
      WHERE user_id = @user_id
        AND status = 'done'
        AND completed_at IS NOT NULL
        AND date(completed_at) >= @start_date
        AND date(completed_at) <= @end_date
      GROUP BY p
    )
    SELECT
      ds.period_label AS period,
      COALESCE(cs.cnt, 0) AS created_count,
      COALESCE(cps.cnt, 0) AS completed_count,
      CASE
        WHEN COALESCE(cs.cnt, 0) = 0 THEN 0
        ELSE ROUND(CAST(COALESCE(cps.cnt, 0) AS REAL) / cs.cnt * 100, 1)
      END AS completion_rate
    FROM date_series ds
    LEFT JOIN created_stats cs ON ds.period_label = cs.p
    LEFT JOIN completed_stats cps ON ds.period_label = cps.p
    ORDER BY ds.period_label
  `

  const stmt = db.prepare(sql)
  return stmt.all({
    user_id: userId,
    start_date: startDate,
    end_date: endDate,
  }) as PeriodStatItem[]
}


/**
 * 按分类统计任务数据
 *
 * 按 category_id 聚合任务总数、已完成数、完成率，
 * JOIN categories 表获取分类名称、图标、颜色。
 * 未分类任务（category_id IS NULL）归入"未分类"。
 *
 * @param userId 用户 ID
 */
export function getStatsByCategory(userId: number): CategoryStatItem[] {
  const db = getDatabase()
  const sql = `
    SELECT
      t.category_id,
      COALESCE(c.name, '未分类') AS category_name,
      COALESCE(c.icon, '📁') AS icon,
      COALESCE(c.color, '#909399') AS color,
      COUNT(*) AS total_tasks,
      SUM(CASE WHEN t.status = 'done' THEN 1 ELSE 0 END) AS completed_tasks,
      CASE
        WHEN COUNT(*) = 0 THEN 0
        ELSE ROUND(CAST(SUM(CASE WHEN t.status = 'done' THEN 1 ELSE 0 END) AS REAL) / COUNT(*) * 100, 1)
      END AS completion_rate
    FROM tasks t
    LEFT JOIN categories c ON t.category_id = c.id
    WHERE t.user_id = @user_id
    GROUP BY t.category_id
    ORDER BY total_tasks DESC
  `
  const stmt = db.prepare(sql)
  return stmt.all({ user_id: userId }) as CategoryStatItem[]
}


/**
 * 按分类统计耗时分布
 *
 * 按分类汇总 actual_time 总和，计算平均单任务耗时。
 * 仅统计 actual_time > 0 的任务用于计算 task_count 和 avg_time。
 *
 * @param userId 用户 ID
 */
export function getTimeDistribution(userId: number): CategoryTimeItem[] {
  const db = getDatabase()
  const sql = `
    SELECT
      t.category_id,
      COALESCE(c.name, '未分类') AS category_name,
      COALESCE(SUM(t.actual_time), 0) AS total_time,
      COUNT(CASE WHEN t.actual_time > 0 THEN 1 END) AS task_count,
      CASE
        WHEN COUNT(CASE WHEN t.actual_time > 0 THEN 1 END) = 0 THEN 0
        ELSE ROUND(CAST(SUM(t.actual_time) AS REAL) / COUNT(CASE WHEN t.actual_time > 0 THEN 1 END), 1)
      END AS avg_time
    FROM tasks t
    LEFT JOIN categories c ON t.category_id = c.id
    WHERE t.user_id = @user_id
    GROUP BY t.category_id
    ORDER BY total_time DESC
  `
  const stmt = db.prepare(sql)
  return stmt.all({ user_id: userId }) as CategoryTimeItem[]
}


/**
 * 按分类和周期交叉统计完成数（用于柱状图对比）
 *
 * @param userId    用户 ID
 * @param startDate 开始日期 YYYY-MM-DD
 * @param endDate   结束日期 YYYY-MM-DD
 * @param period    周期粒度 day/week/month
 */
export function getCategoryCompletionByPeriod(
  userId: number,
  startDate: string,
  endDate: string,
  period: PeriodType
): CategoryCompletionByPeriodItem[] {
  const db = getDatabase()
  const periodExpr = getPeriodExpression(period, 'completed_at')

  const sql = `
    SELECT
      ${periodExpr} AS period,
      COALESCE(c.name, '未分类') AS category_name,
      COUNT(*) AS completed_count
    FROM tasks t
    LEFT JOIN categories c ON t.category_id = c.id
    WHERE t.user_id = @user_id
      AND t.status = 'done'
      AND t.completed_at IS NOT NULL
      AND date(t.completed_at) >= @start_date
      AND date(t.completed_at) <= @end_date
    GROUP BY period, t.category_id
    ORDER BY period, category_name
  `
  const stmt = db.prepare(sql)
  return stmt.all({
    user_id: userId,
    start_date: startDate,
    end_date: endDate,
  }) as CategoryCompletionByPeriodItem[]
}
