/**
 * 报表导出服务 (Export Service)
 *
 * 在主进程中运行，调用 statisticsDao 获取数据，
 * 使用 ExcelJS 生成包含三个工作表的 Excel 文件。
 */

import ExcelJS from 'exceljs'
import * as statisticsDao from '../database/statisticsDao'

export interface ExportParams {
  userId: number
  startDate: string
  endDate: string
  period: statisticsDao.PeriodType
  savePath: string
}

export interface ExportResult {
  success: boolean
  filePath?: string
  error?: string
}

/**
 * 导出统计报表为 Excel 文件
 *
 * 生成包含三个工作表的 Excel：
 * - 工作表1「任务趋势」：周期、创建数、完成数、完成率
 * - 工作表2「分类统计」：分类名、任务总数、已完成数、完成率
 * - 工作表3「耗时分析」：分类名、总耗时、平均耗时、任务数
 */
export async function exportStatisticsToExcel(params: ExportParams): Promise<ExportResult> {
  try {
    const { userId, startDate, endDate, period, savePath } = params

    // 获取统计数据
    const periodStats = statisticsDao.getStatsByPeriod(userId, startDate, endDate, period)
    const categoryStats = statisticsDao.getStatsByCategory(userId)
    const timeDistribution = statisticsDao.getTimeDistribution(userId)

    const workbook = new ExcelJS.Workbook()
    workbook.creator = 'Task Manager'
    workbook.created = new Date()

    // ========== 工作表1：任务趋势 ==========
    const trendSheet = workbook.addWorksheet('任务趋势')
    trendSheet.columns = [
      { header: '周期', key: 'period', width: 18 },
      { header: '创建数', key: 'created_count', width: 12 },
      { header: '完成数', key: 'completed_count', width: 12 },
      { header: '完成率(%)', key: 'completion_rate', width: 14 },
    ]

    // 设置表头样式
    styleHeaderRow(trendSheet)

    for (const item of periodStats) {
      trendSheet.addRow({
        period: item.period,
        created_count: item.created_count,
        completed_count: item.completed_count,
        completion_rate: item.completion_rate,
      })
    }

    // ========== 工作表2：分类统计 ==========
    const categorySheet = workbook.addWorksheet('分类统计')
    categorySheet.columns = [
      { header: '分类名称', key: 'category_name', width: 18 },
      { header: '任务总数', key: 'total_tasks', width: 12 },
      { header: '已完成数', key: 'completed_tasks', width: 12 },
      { header: '完成率(%)', key: 'completion_rate', width: 14 },
    ]

    styleHeaderRow(categorySheet)

    for (const item of categoryStats) {
      categorySheet.addRow({
        category_name: item.category_name,
        total_tasks: item.total_tasks,
        completed_tasks: item.completed_tasks,
        completion_rate: item.completion_rate,
      })
    }

    // ========== 工作表3：耗时分析 ==========
    const timeSheet = workbook.addWorksheet('耗时分析')
    timeSheet.columns = [
      { header: '分类名称', key: 'category_name', width: 18 },
      { header: '总耗时(分钟)', key: 'total_time', width: 14 },
      { header: '平均耗时(分钟)', key: 'avg_time', width: 16 },
      { header: '任务数', key: 'task_count', width: 12 },
    ]

    styleHeaderRow(timeSheet)

    for (const item of timeDistribution) {
      timeSheet.addRow({
        category_name: item.category_name,
        total_time: item.total_time,
        avg_time: item.avg_time,
        task_count: item.task_count,
      })
    }

    // 写入文件
    await workbook.xlsx.writeFile(savePath)

    return { success: true, filePath: savePath }
  } catch (error: any) {
    return { success: false, error: error.message || '导出失败' }
  }
}

/**
 * 设置工作表表头行样式
 */
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
