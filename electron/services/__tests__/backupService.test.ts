/**
 * BackupService 属性测试
 *
 * Feature: auxiliary-features
 * Property 2: 备份文件有效性验证
 */

import { describe, it, expect, afterEach } from 'vitest'
import fc from 'fast-check'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

// validateBackupFile 只依赖 fs，不依赖 Electron，可以直接导入其逻辑
// 但由于模块顶层导入了 electron，我们需要 mock
import { vi } from 'vitest'

vi.mock('electron', () => ({
  app: {
    getPath: (name: string) => {
      if (name === 'userData') return os.tmpdir()
      return os.tmpdir()
    },
  },
}))

let validateBackupFile: typeof import('../backupService').validateBackupFile

const tmpFiles: string[] = []

import { beforeAll, afterAll } from 'vitest'

beforeAll(async () => {
  const mod = await import('../backupService')
  validateBackupFile = mod.validateBackupFile
})

afterAll(() => {
  vi.restoreAllMocks()
})

afterEach(() => {
  // 清理临时文件
  for (const f of tmpFiles) {
    try { fs.unlinkSync(f) } catch { /* ignore */ }
  }
  tmpFiles.length = 0
})

function writeTempFile(content: Buffer): string {
  const filePath = path.join(os.tmpdir(), `test_backup_${Date.now()}_${Math.random().toString(36).slice(2)}.bin`)
  fs.writeFileSync(filePath, content)
  tmpFiles.push(filePath)
  return filePath
}

/** SQLite 文件头：'SQLite format 3\0' (16 bytes) */
const SQLITE_HEADER = Buffer.from('SQLite format 3\0', 'ascii')

describe('BackupService', () => {
  /**
   * Property 2: 备份文件有效性验证
   * **Validates: Requirements 2.2**
   *
   * 对任意字节序列，validateBackupFile 当且仅当以 SQLite 文件头开头时返回 true
   */
  describe('Property 2: validateBackupFile — 有效 SQLite 头返回 true', () => {
    it('以 SQLite 文件头开头的任意字节序列应返回 true', () => {
      fc.assert(
        fc.property(
          fc.uint8Array({ minLength: 0, maxLength: 200 }),
          (extraBytes) => {
            const content = Buffer.concat([SQLITE_HEADER, Buffer.from(extraBytes)])
            const filePath = writeTempFile(content)
            return validateBackupFile(filePath) === true
          }
        ),
        { numRuns: 100 }
      )
    })

    it('不以 SQLite 文件头开头的任意字节序列应返回 false', () => {
      fc.assert(
        fc.property(
          fc.uint8Array({ minLength: 0, maxLength: 200 }).filter(bytes => {
            // 排除恰好以 SQLite 头开头的随机字节
            if (bytes.length < 16) return true
            const header = Buffer.from(bytes.slice(0, 16))
            return !header.equals(SQLITE_HEADER)
          }),
          (bytes) => {
            const content = Buffer.from(bytes)
            const filePath = writeTempFile(content)
            return validateBackupFile(filePath) === false
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  describe('validateBackupFile — 边界情况', () => {
    it('文件不存在时应返回 false', () => {
      expect(validateBackupFile('/nonexistent/path/file.db')).toBe(false)
    })

    it('空文件应返回 false', () => {
      const filePath = writeTempFile(Buffer.alloc(0))
      expect(validateBackupFile(filePath)).toBe(false)
    })

    it('文件长度小于 16 字节应返回 false', () => {
      const filePath = writeTempFile(Buffer.from('SQLite format'))
      expect(validateBackupFile(filePath)).toBe(false)
    })

    it('恰好 16 字节的有效 SQLite 头应返回 true', () => {
      const filePath = writeTempFile(SQLITE_HEADER)
      expect(validateBackupFile(filePath)).toBe(true)
    })
  })
})
