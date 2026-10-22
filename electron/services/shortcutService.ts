/**
 * 快捷键管理服务 (ShortcutService)
 *
 * 负责快捷键配置的加载、保存、冲突检测，
 * 以及通过 Electron globalShortcut 注册/注销快捷键。
 * 配置持久化到 userData/shortcuts.json。
 */

import { app, globalShortcut } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

// ==================== 类型定义 ====================

export interface ShortcutConfig {
  actionId: string
  actionName: string
  accelerator: string
  enabled: boolean
}

export type ShortcutActionId = 'create-task' | 'complete-task' | 'filter-tasks' | 'open-settings'

// ==================== 默认配置 ====================

const DEFAULT_SHORTCUTS: ShortcutConfig[] = [
  { actionId: 'create-task', actionName: '创建任务', accelerator: 'CmdOrCtrl+N', enabled: true },
  { actionId: 'complete-task', actionName: '标记完成', accelerator: 'CmdOrCtrl+D', enabled: true },
  { actionId: 'filter-tasks', actionName: '筛选任务', accelerator: 'CmdOrCtrl+F', enabled: true },
  { actionId: 'open-settings', actionName: '打开设置', accelerator: 'CmdOrCtrl+,', enabled: true },
]

// ==================== 配置文件路径 ====================

function getConfigPath(): string {
  return path.join(app.getPath('userData'), 'shortcuts.json')
}


// ==================== 公开方法 ====================

/**
 * 获取默认快捷键配置
 */
export function getDefaultShortcuts(): ShortcutConfig[] {
  return DEFAULT_SHORTCUTS.map(s => ({ ...s }))
}

/**
 * 从本地存储加载快捷键配置
 * 文件不存在或损坏时返回默认配置
 */
export function loadShortcuts(): ShortcutConfig[] {
  try {
    const configPath = getConfigPath()
    if (!fs.existsSync(configPath)) {
      return getDefaultShortcuts()
    }
    const content = fs.readFileSync(configPath, 'utf-8')
    const parsed = JSON.parse(content)
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return getDefaultShortcuts()
    }
    return parsed as ShortcutConfig[]
  } catch {
    return getDefaultShortcuts()
  }
}

/**
 * 保存快捷键配置到本地存储
 */
export function saveShortcuts(shortcuts: ShortcutConfig[]): void {
  const configPath = getConfigPath()
  fs.writeFileSync(configPath, JSON.stringify(shortcuts, null, 2), 'utf-8')
}

/**
 * 检查快捷键是否与已有配置冲突
 * 返回冲突的操作名称，无冲突返回 null
 */
export function checkConflict(
  accelerator: string,
  excludeActionId: string,
  shortcuts: ShortcutConfig[]
): string | null {
  const normalized = accelerator.toLowerCase().trim()
  for (const s of shortcuts) {
    if (s.actionId === excludeActionId) continue
    if (s.accelerator.toLowerCase().trim() === normalized) {
      return s.actionName
    }
  }
  return null
}

/**
 * 注册所有已启用的快捷键到 Electron globalShortcut
 */
export function registerAllShortcuts(
  shortcuts: ShortcutConfig[],
  callback: (actionId: string) => void
): void {
  for (const s of shortcuts) {
    if (!s.enabled) continue
    try {
      globalShortcut.register(s.accelerator, () => {
        callback(s.actionId)
      })
    } catch (e) {
      console.warn(`[ShortcutService] 注册快捷键失败: ${s.accelerator}`, e)
    }
  }
}

/**
 * 注销所有已注册的快捷键
 */
export function unregisterAllShortcuts(): void {
  globalShortcut.unregisterAll()
}
