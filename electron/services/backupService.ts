/**
 * 备份恢复服务 (Backup Service)
 *
 * 职责：
 * 1. 将 SQLite 数据库文件备份到用户指定路径
 * 2. 验证备份文件是否为有效的 SQLite 数据库
 * 3. 从备份文件恢复数据库（含临时备份回滚机制）
 */

import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import { getDbPath, closeDatabase, reopenDatabase } from '../database/index'

export interface BackupResult {
  success: boolean
  filePath?: string
  fileSize?: number
  error?: string
}

export interface RestoreResult {
  success: boolean
  error?: string
}

/** SQLite 文件头魔数：'SQLite format 3\0' */
const SQLITE_HEADER = Buffer.from('SQLite format 3\0', 'ascii')

/**
 * 备份数据库到指定路径
 */
export function backupDatabase(savePath: string): BackupResult {
  try {
    const dbPath = getDbPath()
    fs.copyFileSync(dbPath, savePath)
    const stat = fs.statSync(savePath)
    return { success: true, filePath: savePath, fileSize: stat.size }
  } catch (error: any) {
    return { success: false, error: error.message || '备份失败' }
  }
}

/**
 * 验证备份文件是否为有效的 SQLite 数据库
 * 检查文件前 16 字节是否以 'SQLite format 3\0' 开头
 */
export function validateBackupFile(filePath: string): boolean {
  try {
    const fd = fs.openSync(filePath, 'r')
    const buf = Buffer.alloc(16)
    fs.readSync(fd, buf, 0, 16, 0)
    fs.closeSync(fd)
    return buf.equals(SQLITE_HEADER)
  } catch {
    return false
  }
}


/**
 * 从备份文件恢复数据库
 *
 * 流程：验证文件 → 创建临时备份 → 关闭数据库 → 替换文件 → 重新打开
 * 失败时使用临时备份回滚
 */
export function restoreDatabase(backupFilePath: string): RestoreResult {
  // 1. 验证备份文件
  if (!validateBackupFile(backupFilePath)) {
    return { success: false, error: '无效的备份文件，不是有效的 SQLite 数据库' }
  }

  const dbPath = getDbPath()
  const tempDir = path.join(app.getPath('userData'), 'temp_backup')
  const tempBackupPath = path.join(tempDir, `temp_${Date.now()}.db`)

  try {
    // 2. 创建临时备份目录
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true })
    }

    // 3. 关闭数据库连接
    closeDatabase()

    // 4. 创建当前数据库的临时备份
    if (fs.existsSync(dbPath)) {
      fs.copyFileSync(dbPath, tempBackupPath)
    }

    // 5. 用备份文件替换当前数据库
    fs.copyFileSync(backupFilePath, dbPath)

    // 6. 重新打开数据库
    reopenDatabase()

    // 7. 清理临时备份
    cleanupTempBackup(tempBackupPath, tempDir)

    return { success: true }
  } catch (error: any) {
    // 回滚：用临时备份恢复原数据库
    try {
      if (fs.existsSync(tempBackupPath)) {
        fs.copyFileSync(tempBackupPath, dbPath)
      }
      reopenDatabase()
    } catch (rollbackError: any) {
      console.error('[BackupService] 回滚失败:', rollbackError.message)
    }
    cleanupTempBackup(tempBackupPath, tempDir)
    return { success: false, error: error.message || '恢复失败' }
  }
}

/**
 * 清理临时备份文件和目录
 */
function cleanupTempBackup(tempBackupPath: string, tempDir: string): void {
  try {
    if (fs.existsSync(tempBackupPath)) {
      fs.unlinkSync(tempBackupPath)
    }
    // 如果临时目录为空则删除
    if (fs.existsSync(tempDir) && fs.readdirSync(tempDir).length === 0) {
      fs.rmdirSync(tempDir)
    }
  } catch {
    // 清理失败不影响主流程
  }
}
