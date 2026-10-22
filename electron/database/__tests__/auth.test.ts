import { beforeEach, describe, expect, it, vi } from 'vitest'
import { hashPassword } from '../../utils/crypto'

const { handlers, users } = vi.hoisted(() => ({
  handlers: new Map<string, (...args: any[]) => any>(),
  users: {
    getUserByUsername: vi.fn(),
    createUser: vi.fn(),
    updateUser: vi.fn(),
  },
}))

vi.mock('electron', () => ({
  ipcMain: { handle: (channel: string, handler: (...args: any[]) => any) => handlers.set(channel, handler) },
  app: { getPath: () => '.' },
  shell: {},
  dialog: {},
  globalShortcut: {},
}))
vi.mock('../userDao', () => users)

import { registerIpcHandlers } from '../ipcHandlers'

describe('Local account login', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    handlers.clear()
    registerIpcHandlers()
  })

  it('rejects an unknown account without creating the old debug user', () => {
    users.getUserByUsername.mockReturnValue(undefined)
    const result = handlers.get('auth:login')!({}, { username: 'tt', password: '123456' })
    expect(result).toEqual({ success: false, message: '用户名或密码错误' })
    expect(users.createUser).not.toHaveBeenCalled()
  })

  it('rejects the old debug password without changing the stored password', () => {
    const passwordHash = hashPassword('my-own-password')
    const user = { id: 1, username: 'tt', password_hash: passwordHash }
    users.getUserByUsername.mockReturnValue(user)
    const result = handlers.get('auth:login')!({}, { username: 'tt', password: '123456' })
    expect(result.success).toBe(false)
    expect(users.updateUser).not.toHaveBeenCalled()
    expect(user.password_hash).toBe(passwordHash)
  })

  it('accepts the registered password and excludes its hash from the response', () => {
    users.getUserByUsername.mockReturnValue({
      id: 1, username: 'local-user', nickname: 'Local', password_hash: hashPassword('my-own-password'),
    })
    const result = handlers.get('auth:login')!({}, { username: 'local-user', password: 'my-own-password' })
    expect(result).toEqual({ success: true, user: { id: 1, username: 'local-user', nickname: 'Local' } })
  })
})
