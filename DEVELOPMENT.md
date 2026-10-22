# 开发与发布

## 环境

使用 Node.js 22 和 npm 10。项目通过 `package-lock.json` 固定依赖版本，统一使用 `npm ci` 安装。

```bash
npm ci
npm run dev
```

`postinstall` 会运行 `electron-builder install-app-deps`，将 `better-sqlite3` 与项目中的 Electron 版本匹配。若本机缺少可下载的预编译文件，需要安装 Visual Studio 的 C++ 桌面开发工具和 Python 后重新安装。

## 检查与打包

```bash
npm run typecheck
npm test
npm run build
npm run build:win
npm run smoke:win
```

`build` 生成 Vue 页面和 Electron 主进程、预加载脚本；`build:win` 在 Windows 上进一步生成 x64 NSIS 安装包，输出到 `release/<version>/`。

单元测试使用 Vitest，主要覆盖备份文件校验和认证逻辑。`smoke:win` 使用临时数据目录启动打包后的应用，验证注册、密码校验、任务保存和登录页面，并将截图写入 `release/<version>/smoke.png`。测试数据留在系统临时目录，不修改个人任务。`npm run preview` 仅预览静态页面，数据库功能需要 Electron 环境。

仅主进程使用的 `better-sqlite3` 和 `exceljs` 作为运行依赖打入安装包。Vue、图表和组件库由 Vite 打包，因此放在开发依赖中，避免重复分发。

## 数据与通信

Vue 通过 `src/api/database.ts` 调用预加载脚本暴露的 IPC；主进程在 `electron/database/ipcHandlers.ts` 注册处理器，DAO 使用 SQLite 连接。密码在主进程中使用 PBKDF2 处理。

数据库位于 Electron 的 `userData` 目录（Windows 默认 `%APPDATA%\taskflow\task-manager.db`）。开发与正式应用使用相同应用名，测试请使用独立的数据目录，避免修改自己的任务。

备份功能保存 SQLite 数据库；附件和头像是独立文件，迁移电脑时需要另外保留。提醒由主进程轮询触发，关闭应用后停止。应用不提供云同步。

## 发布

1. 更新 `package.json` 与 `package-lock.json` 中的版本，提交到 `main`。
2. 确认 CI 通过，并在 Windows 验证启动、注册、登录、任务保存和安装。
3. 创建与版本相同的标签，例如 `git tag v1.0.1`，然后 `git push origin v1.0.1`。
4. Release 工作流检查版本、运行测试、构建安装包，生成 SHA-256 校验文件并发布到 GitHub Releases。

首次发布为 `v1.0.0`。GitHub Actions 使用仓库内置 `GITHUB_TOKEN`，无需另配发布令牌。当前仅发布 Windows x64；安装包未进行代码签名，也未集成应用内自动更新。
