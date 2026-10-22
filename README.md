# TaskFlow

本地任务管理与提醒桌面应用。基于 Electron、Vue 3 和 SQLite，支持任务整理、桌面提醒、统计图表和数据备份，无需部署服务器。

[![CI](https://github.com/Yee-Ning/TaskFlow/actions/workflows/ci.yml/badge.svg)](https://github.com/Yee-Ning/TaskFlow/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/Yee-Ning/TaskFlow)](https://github.com/Yee-Ning/TaskFlow/releases/latest)

## 下载安装

前往 [最新版本](https://github.com/Yee-Ning/TaskFlow/releases/latest)，下载 `TaskFlow-Windows-版本号-Setup.exe`，双击运行并选择安装目录。

当前提供 **Windows 10 / 11 x64** 安装包。安装后可从桌面或开始菜单启动；首次使用请注册本地账号。账号和任务均保存在当前电脑，不会同步到云端。

安装包未进行代码签名，Windows 可能显示发布者未验证提示。发布页附有 `SHA256SUMS.txt`，可用 PowerShell 的 `Get-FileHash 安装包路径 -Algorithm SHA256` 核对文件。

## 功能

- 创建和编辑任务，管理优先级、截止日期、状态与进度。
- 自定义分类和标签，筛选任务并管理附件。
- 设置单次或重复提醒，通过桌面通知和应用内弹窗提示。
- 查看任务趋势、分类分布和耗时统计，导出 Excel 报表。
- 备份和恢复数据，导入与导出任务，配置全局快捷键。
- 本地账号、密码找回、头像设置、深浅主题与自动退出。

提醒需要保持应用运行。用户数据位于 `%APPDATA%\taskflow\`，卸载时保留该目录；更换电脑前请使用应用内备份，并另行保留附件和头像目录。

## 本地运行

需要 Git 和 Node.js 22。Windows 用户可直接运行：

```bash
git clone https://github.com/Yee-Ning/TaskFlow.git
cd TaskFlow
npm ci
npm run dev
```

安装依赖时会自动为 Electron 准备 SQLite 原生模块。开发、测试及打包命令见 [DEVELOPMENT.md](DEVELOPMENT.md)。

## 目录

| 目录 | 内容 |
| --- | --- |
| `src/` | Vue 页面、组件、路由、状态与 IPC 调用 |
| `electron/main/`、`electron/preload/` | 桌面窗口、生命周期与预加载桥接 |
| `electron/database/` | SQLite 表结构、数据访问与 IPC 处理 |
| `electron/services/`、`electron/utils/` | 提醒、备份、导入导出、快捷键与密码处理 |
| `public/` | 应用图标 |
| `scripts/` | 打包后应用的启动与数据读写验证 |
| `.github/workflows/` | 自动检查与 Windows 安装包发布 |

依赖、构建产物、安装包和本地数据库不提交到源码仓库。下载安装包通过 GitHub Releases 分发。

## 许可与来源

项目使用 [MIT 许可](LICENSE)，基于 [electron-vite-vue](https://github.com/electron-vite/electron-vite-vue) 模板开发，保留原作者的许可与署名。第三方依赖遵循各自许可。
