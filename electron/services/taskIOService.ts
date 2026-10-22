/**
 * 任务导入导出服务 (TaskIOService)
 *
 * 提供任务数据的 Excel 导出和导入功能。
 * - 导出：查询用户所有任务（含分类名称和标签），生成 xlsx 文件
 * - 导入：解析 xlsx 文件，逐行验证，合法行事务批量写入
 */

import ExcelJS from 'exceljs'
import { getDatabase } from '../database/index'

// ==================== 类型定义 ====================

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

// ==================== 常量映射 ====================

const PRIORITY_MAP: Record<string, string> = {
  'high': 'high', 'medium': 'medium', 'low': 'low',
  '高': 'high', '中': 'medium', '低': 'low',
}

const STATUS_MAP: Record<string, string> = {
  'todo': 'todo', 'in_progress': 'in_progress', 'done': 'done',
  '待办': 'todo', '进行中': 'in_progress', '已完成': 'done',
}

const EXPORT_COLUMNS: Partial<ExcelJS.Column>[] = [
  { header: '任务名称', key: 'name', width: 24 },
  { header: '描述', key: 'description', width: 32 },
  { header: '优先级', key: 'priority', width: 10 },
  { header: '状态', key: 'status', width: 12 },
  { header: '进度', key: 'progress', width: 8 },
  { header: '分类', key: 'category', width: 14 },
  { header: '标签', key: 'tags', width: 20 },
  { header: '截止日期', key: 'deadline', width: 20 },
  { header: '预计耗时(分钟)', key: 'estimated_time', width: 16 },
  { header: '实际耗时(分钟)', key: 'actual_time', width: 16 },
  { header: '创建时间', key: 'created_at', width: 20 },
  { header: '完成时间', key: 'completed_at', width: 20 },
]


// ==================== 日期格式验证 ====================

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/
const DATETIME_REGEX = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/

function isValidDateString(value: string): boolean {
  if (!DATE_REGEX.test(value) && !DATETIME_REGEX.test(value)) return false
  const dateStr = value.substring(0, 10)
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d
}

// ==================== 行验证 ====================

/**
 * 验证单行任务数据的合法性
 * 返回错误列表，空列表表示全部合法
 */
export function validateTaskRow(row: Record<string, any>): ImportRowError[] {
  const errors: ImportRowError[] = []

  // name 非空
  const name = row['任务名称'] ?? row['name']
  if (name === undefined || name === null || String(name).trim() === '') {
    errors.push({ row: 0, field: 'name', message: '任务名称不能为空' })
  }

  // priority 合法
  const priority = row['优先级'] ?? row['priority']
  if (priority !== undefined && priority !== null && String(priority).trim() !== '') {
    const p = String(priority).trim().toLowerCase()
    if (!PRIORITY_MAP[p]) {
      errors.push({ row: 0, field: 'priority', message: `优先级值不合法: ${priority}，应为 high/medium/low 或 高/中/低` })
    }
  }

  // status 合法
  const status = row['状态'] ?? row['status']
  if (status !== undefined && status !== null && String(status).trim() !== '') {
    const s = String(status).trim().toLowerCase()
    if (!STATUS_MAP[s]) {
      errors.push({ row: 0, field: 'status', message: `状态值不合法: ${status}，应为 todo/in_progress/done 或 待办/进行中/已完成` })
    }
  }

  // deadline 格式
  const deadline = row['截止日期'] ?? row['deadline']
  if (deadline !== undefined && deadline !== null && String(deadline).trim() !== '') {
    if (!isValidDateString(String(deadline).trim())) {
      errors.push({ row: 0, field: 'deadline', message: `截止日期格式不正确: ${deadline}，应为 YYYY-MM-DD 或 YYYY-MM-DD HH:mm:ss` })
    }
  }

  // progress 0-100 整数
  const progress = row['进度'] ?? row['progress']
  if (progress !== undefined && progress !== null && String(progress).trim() !== '') {
    const p = Number(progress)
    if (!Number.isInteger(p) || p < 0 || p > 100) {
      errors.push({ row: 0, field: 'progress', message: `进度值不合法: ${progress}，应为 0-100 的整数` })
    }
  }

  // estimated_time 非负整数
  const estimatedTime = row['预计耗时(分钟)'] ?? row['estimated_time']
  if (estimatedTime !== undefined && estimatedTime !== null && String(estimatedTime).trim() !== '') {
    const t = Number(estimatedTime)
    if (!Number.isInteger(t) || t < 0) {
      errors.push({ row: 0, field: 'estimated_time', message: `预计耗时不合法: ${estimatedTime}，应为非负整数` })
    }
  }

  // actual_time 非负整数
  const actualTime = row['实际耗时(分钟)'] ?? row['actual_time']
  if (actualTime !== undefined && actualTime !== null && String(actualTime).trim() !== '') {
    const t = Number(actualTime)
    if (!Number.isInteger(t) || t < 0) {
      errors.push({ row: 0, field: 'actual_time', message: `实际耗时不合法: ${actualTime}，应为非负整数` })
    }
  }

  return errors
}


// ==================== 表头样式 ====================

function styleHeaderRow(sheet: ExcelJS.Worksheet): void {
  const headerRow = sheet.getRow(1)
  headerRow.font = { bold: true }
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE8EAED' },
  }
  headerRow.alignment = { horizontal: 'center' }
  headerRow.commit()
}

// ==================== 导出 ====================

/**
 * 导出当前用户的所有任务到 Excel
 */
export async function exportTasksToExcel(userId: number, savePath: string): Promise<TaskExportResult> {
  try {
    const db = getDatabase()

    // 查询任务（含分类名称）
    const tasks = db.prepare(`
      SELECT t.*, c.name as category_name
      FROM tasks t
      LEFT JOIN categories c ON t.category_id = c.id
      WHERE t.user_id = ?
      ORDER BY t.created_at DESC
    `).all(userId) as any[]

    // 查询每个任务的标签
    const tagStmt = db.prepare(`
      SELECT tg.name FROM tags tg
      INNER JOIN task_tags tt ON tg.id = tt.tag_id
      WHERE tt.task_id = ?
      ORDER BY tg.name ASC
    `)

    const workbook = new ExcelJS.Workbook()
    workbook.creator = 'Task Manager'
    workbook.created = new Date()

    const sheet = workbook.addWorksheet('任务列表')
    sheet.columns = EXPORT_COLUMNS

    styleHeaderRow(sheet)

    for (const task of tasks) {
      const tags = (tagStmt.all(task.id) as { name: string }[]).map(t => t.name).join(', ')
      sheet.addRow({
        name: task.name,
        description: task.description || '',
        priority: task.priority,
        status: task.status,
        progress: task.progress,
        category: task.category_name || '',
        tags,
        deadline: task.deadline || '',
        estimated_time: task.estimated_time || 0,
        actual_time: task.actual_time || 0,
        created_at: task.created_at || '',
        completed_at: task.completed_at || '',
      })
    }

    await workbook.xlsx.writeFile(savePath)

    return { success: true, filePath: savePath, taskCount: tasks.length }
  } catch (error: any) {
    return { success: false, error: error.message || '导出失败' }
  }
}


// ==================== 导入 ====================

/**
 * 从 Excel 文件导入任务
 */
export async function importTasksFromExcel(userId: number, filePath: string): Promise<TaskImportResult> {
  try {
    const db = getDatabase()
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.readFile(filePath)

    const sheet = workbook.worksheets[0]
    if (!sheet) {
      return { success: false, totalRows: 0, successCount: 0, failCount: 0, errors: [], error: '文件中没有工作表' }
    }

    // 读取表头（第一行）
    const headerRow = sheet.getRow(1)
    const headers: string[] = []
    headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      headers[colNumber] = String(cell.value ?? '').trim()
    })

    // 解析数据行
    const rows: { rowNum: number; data: Record<string, any> }[] = []
    sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber === 1) return // 跳过表头
      const data: Record<string, any> = {}
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        const header = headers[colNumber]
        if (header) {
          data[header] = cell.value
        }
      })
      rows.push({ rowNum: rowNumber, data })
    })

    const totalRows = rows.length
    const allErrors: ImportRowError[] = []
    const validRows: { rowNum: number; data: Record<string, any> }[] = []

    // 逐行验证
    for (const { rowNum, data } of rows) {
      const rowErrors = validateTaskRow(data)
      if (rowErrors.length > 0) {
        for (const err of rowErrors) {
          allErrors.push({ row: rowNum, field: err.field, message: err.message })
        }
      } else {
        validRows.push({ rowNum, data })
      }
    }

    // 预查询分类和标签映射
    const categories = db.prepare('SELECT id, name FROM categories WHERE user_id = ?').all(userId) as { id: number; name: string }[]
    const categoryMap = new Map(categories.map(c => [c.name, c.id]))

    const tags = db.prepare('SELECT id, name FROM tags WHERE user_id = ?').all(userId) as { id: number; name: string }[]
    const tagMap = new Map(tags.map(t => [t.name, t.id]))

    // 事务批量写入合法行
    let successCount = 0
    const insertTask = db.prepare(`
      INSERT INTO tasks (user_id, category_id, name, description, priority, status, progress, deadline, estimated_time, actual_time)
      VALUES (@user_id, @category_id, @name, @description, @priority, @status, @progress, @deadline, @estimated_time, @actual_time)
    `)
    const insertTaskTag = db.prepare('INSERT OR IGNORE INTO task_tags (task_id, tag_id) VALUES (?, ?)')

    const runTransaction = db.transaction(() => {
      for (const { data } of validRows) {
        const name = String(data['任务名称'] ?? data['name'] ?? '').trim()
        const description = String(data['描述'] ?? data['description'] ?? '').trim()

        const rawPriority = String(data['优先级'] ?? data['priority'] ?? 'medium').trim().toLowerCase()
        const priority = PRIORITY_MAP[rawPriority] || 'medium'

        const rawStatus = String(data['状态'] ?? data['status'] ?? 'todo').trim().toLowerCase()
        const status = STATUS_MAP[rawStatus] || 'todo'

        const progress = Number(data['进度'] ?? data['progress'] ?? 0) || 0
        const deadline = String(data['截止日期'] ?? data['deadline'] ?? '').trim() || null
        const estimatedTime = Number(data['预计耗时(分钟)'] ?? data['estimated_time'] ?? 0) || 0
        const actualTime = Number(data['实际耗时(分钟)'] ?? data['actual_time'] ?? 0) || 0

        // 分类匹配
        const categoryName = String(data['分类'] ?? data['category'] ?? '').trim()
        const categoryId = categoryName ? (categoryMap.get(categoryName) ?? null) : null

        const result = insertTask.run({
          user_id: userId,
          category_id: categoryId,
          name,
          description,
          priority,
          status,
          progress,
          deadline,
          estimated_time: estimatedTime,
          actual_time: actualTime,
        })

        const taskId = result.lastInsertRowid as number

        // 标签匹配
        const tagsStr = String(data['标签'] ?? data['tags'] ?? '').trim()
        if (tagsStr) {
          const tagNames = tagsStr.split(/[,，]/).map(s => s.trim()).filter(Boolean)
          for (const tagName of tagNames) {
            const tagId = tagMap.get(tagName)
            if (tagId) {
              insertTaskTag.run(taskId, tagId)
            }
          }
        }

        successCount++
      }
    })

    try {
      runTransaction()
    } catch (dbError: any) {
      return {
        success: false,
        totalRows,
        successCount: 0,
        failCount: totalRows,
        errors: allErrors,
        error: `数据库写入失败: ${dbError.message}`,
      }
    }

    const failCount = totalRows - successCount
    return {
      success: true,
      totalRows,
      successCount,
      failCount,
      errors: allErrors,
    }
  } catch (error: any) {
    return { success: false, totalRows: 0, successCount: 0, failCount: 0, errors: [], error: error.message || '导入失败' }
  }
}
