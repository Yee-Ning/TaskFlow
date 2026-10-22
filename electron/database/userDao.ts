/**
 * 用户数据访问层 (User DAO)
 *
 * 提供用户相关的 CRUD 操作
 */

import { getDatabase } from './index'

// ==================== 类型定义 ====================

export interface User {
    id: number
    username: string
    password_hash: string
    nickname: string
    avatar: string
    theme: string
    created_at: string
    updated_at: string
}

/** 创建用户时的传入参数 */
export interface CreateUserParams {
    username: string
    password_hash: string
    nickname?: string
}

/** 更新用户信息的传入参数 */
export interface UpdateUserParams {
    nickname?: string
    avatar?: string
    theme?: string
    password_hash?: string
}

// ==================== DAO 方法 ====================

/**
 * 创建用户
 */
export function createUser(params: CreateUserParams): User {
    const db = getDatabase()
    const stmt = db.prepare(`
    INSERT INTO users (username, password_hash, nickname)
    VALUES (@username, @password_hash, @nickname)
  `)
    const result = stmt.run({
        username: params.username,
        password_hash: params.password_hash,
        nickname: params.nickname || params.username,
    })
    const user = getUserById(result.lastInsertRowid as number)
    if (!user) {
        throw new Error('创建用户后查询失败，请重试')
    }
    return user
}

/**
 * 根据 ID 查询用户
 */
export function getUserById(id: number): User | undefined {
    const db = getDatabase()
    const stmt = db.prepare('SELECT * FROM users WHERE id = ?')
    return stmt.get(id) as User | undefined
}

/**
 * 根据用户名查询用户（用于登录验证）
 */
export function getUserByUsername(username: string): User | undefined {
    const db = getDatabase()
    const stmt = db.prepare('SELECT * FROM users WHERE username = ?')
    return stmt.get(username) as User | undefined
}

/**
 * 更新用户信息
 */
export function updateUser(id: number, params: UpdateUserParams): boolean {
    const db = getDatabase()
    const fields: string[] = []
    const values: Record<string, unknown> = { id }

    if (params.nickname !== undefined) {
        fields.push('nickname = @nickname')
        values.nickname = params.nickname
    }
    if (params.avatar !== undefined) {
        fields.push('avatar = @avatar')
        values.avatar = params.avatar
    }
    if (params.theme !== undefined) {
        fields.push('theme = @theme')
        values.theme = params.theme
    }
    if (params.password_hash !== undefined) {
        fields.push('password_hash = @password_hash')
        values.password_hash = params.password_hash
    }

    if (fields.length === 0) return false

    fields.push("updated_at = datetime('now','localtime')")

    const sql = `UPDATE users SET ${fields.join(', ')} WHERE id = @id`
    const stmt = db.prepare(sql)
    const result = stmt.run(values)
    return result.changes > 0
}

/**
 * 检查用户名是否已存在
 */
export function isUsernameExists(username: string): boolean {
    const db = getDatabase()
    const stmt = db.prepare('SELECT COUNT(*) as count FROM users WHERE username = ?')
    const row = stmt.get(username) as { count: number }
    return row.count > 0
}

/**
 * 设置安全问题（用于密码找回）
 */
export function setSecurityQuestion(userId: number, question: string, answerHash: string): boolean {
    const db = getDatabase()
    const stmt = db.prepare(`
    UPDATE users SET security_question = @question, security_answer_hash = @answer_hash, updated_at = datetime('now','localtime')
    WHERE id = @id
  `)
    const result = stmt.run({ id: userId, question, answer_hash: answerHash })
    return result.changes > 0
}

/**
 * 获取安全问题（仅返回问题文本和答案哈希）
 */
export function getSecurityQuestion(userId: number): { security_question: string; security_answer_hash: string } | undefined {
    const db = getDatabase()
    const stmt = db.prepare('SELECT security_question, security_answer_hash FROM users WHERE id = ?')
    return stmt.get(userId) as { security_question: string; security_answer_hash: string } | undefined
}
