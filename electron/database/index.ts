/**
 * 数据库初始化 & 连接管理
 *
 * 职责：
 * 1. 创建/打开 SQLite 数据库文件
 * 2. 执行建表语句
 * 3. 导出数据库实例供各 DAO 使用
 */

import Database from 'better-sqlite3'
import path from 'node:path'
import { app } from 'electron'
import { CREATE_TABLES_SQL } from './schema'

let db: Database.Database | null = null

/**
 * 获取数据库文件存储路径
 * 数据库文件放在 Electron 的 userData 目录下，确保跨平台兼容
 * Windows: C:\Users\<用户名>\AppData\Roaming\<应用名>\
 * macOS:   ~/Library/Application Support/<应用名>/
 * Linux:   ~/.config/<应用名>/
 */
export function getDbPath(): string {
    const userDataPath = app.getPath('userData')
    return path.join(userDataPath, 'task-manager.db')
}

/**
 * 初始化数据库
 * - 打开数据库连接（如果文件不存在会自动创建）
 * - 启用 WAL 模式提升并发性能
 * - 启用外键约束
 * - 执行建表语句
 */
export function initDatabase(): Database.Database {
    if (db) return db

    const dbPath = getDbPath()
    console.log('[Database] 数据库路径:', dbPath)

    db = new Database(dbPath)

    // 启用 WAL 模式（Write-Ahead Logging），提升读写性能
    db.pragma('journal_mode = WAL')
    // 启用外键约束
    db.pragma('foreign_keys = ON')

    // 执行建表语句
    db.exec(CREATE_TABLES_SQL)
    console.log('[Database] 数据库表初始化完成')

    // ==================== 简单的迁移逻辑 ====================
    // 检查 users 表是否缺少 security_question 字段（老版本迁移）
    try {
        const tableInfo = db.pragma('table_info(users)') as Array<{ name: string }>
        const hasSecurityQuestion = tableInfo.some(col => col.name === 'security_question')
        if (!hasSecurityQuestion) {
            console.log('[Database] 正在为 users 表添加安全问题字段...')
            db.exec(`
                ALTER TABLE users ADD COLUMN security_question TEXT;
                ALTER TABLE users ADD COLUMN security_answer_hash TEXT;
            `)
        }
    } catch (e) {
        console.error('[Database] 迁移 users 表失败:', e)
    }


    return db
}

/**
 * 获取数据库实例（必须在 initDatabase 之后调用）
 */
export function getDatabase(): Database.Database {
    if (!db) {
        throw new Error('[Database] 数据库尚未初始化，请先调用 initDatabase()')
    }
    return db
}

/**
 * 关闭数据库连接
 */
export function closeDatabase(): void {
    if (db) {
        db.close()
        db = null
        console.log('[Database] 数据库连接已关闭')
    }
}

/**
 * 重新打开数据库连接
 * 用于数据恢复后重新初始化数据库
 */
export function reopenDatabase(): Database.Database {
    if (db) {
        db.close()
        db = null
    }
    return initDatabase()
}
