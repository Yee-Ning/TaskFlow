/**
 * 密码加密工具
 *
 * 使用 Node.js 内置 crypto 模块实现安全的密码哈希
 * 采用 PBKDF2 算法 + 随机盐值，确保密码存储安全
 */

import crypto from 'node:crypto'

/** 盐值长度（字节） */
const SALT_LENGTH = 16
/** PBKDF2 迭代次数 */
const ITERATIONS = 100000
/** 密钥长度（字节） */
const KEY_LENGTH = 64
/** 使用的哈希算法 */
const DIGEST = 'sha512'

/**
 * 对明文密码进行哈希加密
 *
 * 返回格式：salt:hash（十六进制），方便存储到数据库
 * @param password 明文密码
 * @returns 加密后的密码字符串（salt:hash）
 */
export function hashPassword(password: string): string {
    const salt = crypto.randomBytes(SALT_LENGTH).toString('hex')
    const hash = crypto.pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, DIGEST).toString('hex')
    return `${salt}:${hash}`
}

/**
 * 验证密码是否正确
 *
 * @param password 用户输入的明文密码
 * @param storedHash 数据库中存储的哈希值（salt:hash 格式）
 * @returns 密码是否匹配
 */
export function verifyPassword(password: string, storedHash: string): boolean {
    const [salt, hash] = storedHash.split(':')
    if (!salt || !hash) return false
    const verifyHash = crypto.pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, DIGEST).toString('hex')
    // 使用 timingSafeEqual 防止时序攻击
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(verifyHash, 'hex'))
}
