import { app, BrowserWindow, shell } from 'electron'
import path from 'node:path'
import os from 'node:os'

// ===== 数据库模块 =====
import { initDatabase, closeDatabase } from '../database/index'
import { registerIpcHandlers } from '../database/ipcHandlers'
import { startReminderService, stopReminderService } from '../services/reminderService'
import { loadShortcuts, registerAllShortcuts, unregisterAllShortcuts } from '../services/shortcutService'

// The built directory structure
//
// ├─┬ dist-electron
// │ ├─┬ main
// │ │ └── index.js    > Electron-Main
// │ └─┬ preload
// │   └── index.mjs   > Preload-Scripts
// ├─┬ dist
// │ └── index.html    > Electron-Renderer
//
process.env.APP_ROOT = path.join(__dirname, '../..')

export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')
export const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, 'public')
  : RENDERER_DIST

// Disable GPU Acceleration for Windows 7
if (os.release().startsWith('6.1')) app.disableHardwareAcceleration()

// Set application name for Windows 10+ notifications
if (process.platform === 'win32') app.setAppUserModelId(app.getName())

if (!app.requestSingleInstanceLock()) {
  app.quit()
  process.exit(0)
}

let win: BrowserWindow | null = null
const preload = path.join(__dirname, '../preload/index.js')
const indexHtml = path.join(RENDERER_DIST, 'index.html')

async function createWindow() {
  win = new BrowserWindow({
    title: 'TaskFlow',
    icon: path.join(process.env.VITE_PUBLIC, 'icon.png'),
    webPreferences: {
      preload,
      webSecurity: false,
    },
  })

  if (VITE_DEV_SERVER_URL) { // #298
    win.loadURL(VITE_DEV_SERVER_URL)
    // Open devTool if the app is not packaged
    win.webContents.openDevTools()
  } else {
    win.loadFile(indexHtml)
  }

  // Make all links open with the browser, not with the application
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:')) shell.openExternal(url)
    return { action: 'deny' }
  })
}

app.whenReady().then(() => {
  // 1. 初始化数据库
  initDatabase()
  // 2. 注册 IPC Handler（数据库操作通道）
  registerIpcHandlers()
  // 3. 创建窗口
  createWindow()
  // 4. 启动提醒轮询服务
  startReminderService()
  // 5. 加载快捷键配置并注册全局快捷键
  const shortcuts = loadShortcuts()
  registerAllShortcuts(shortcuts, (actionId) => {
    win?.webContents.send('shortcut:triggered', actionId)
  })
})

app.on('window-all-closed', () => {
  win = null
  // 停止提醒服务
  stopReminderService()
  // 注销所有快捷键
  unregisterAllShortcuts()
  // 关闭数据库连接
  closeDatabase()
  if (process.platform !== 'darwin') app.quit()
})

app.on('second-instance', () => {
  if (win) {
    // Focus on the main window if the user tried to open another
    if (win.isMinimized()) win.restore()
    win.focus()
  }
})

app.on('activate', () => {
  const allWindows = BrowserWindow.getAllWindows()
  if (allWindows.length) {
    allWindows[0].focus()
  } else {
    createWindow()
  }
})
