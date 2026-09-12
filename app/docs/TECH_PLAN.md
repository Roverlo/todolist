# ProjectTodo 技术方案

本文记录当前代码入口与数据边界。依赖版本、构建命令和产物路径见 [开发说明](../README.md)；完整 Windows 验收见 [RELEASE_QA.md](RELEASE_QA.md)。

## 结构与职责

| 范围 | 当前入口 |
|---|---|
| 类型和数据结构 | [src/types.ts](../src/types.ts) |
| 状态、迁移与持久化 | [src/state/appStore.ts](../src/state/appStore.ts)、src/state/slices/ |
| 任务筛选与排序 | [src/hooks/useVisibleTasks.ts](../src/hooks/useVisibleTasks.ts) |
| 项目、任务与周期任务 | src/components/sidebar/、src/components/task-table/、src/components/toolbar/ |
| 随记编辑与 AI 交互 | src/components/notes/、src/services/、src/utils/noteAI.ts |
| 备份、图片与恢复 | src/utils/backupUtils.ts、src/utils/noteImages.ts、src/components/toolbar/BackupModal.tsx |
| 导入、导出与远程同步 | src/components/toolbar/ImportModal.tsx、src/components/toolbar/ExportModal.tsx、src/components/toolbar/CloudSyncModal.tsx |
| 原生存储、同步命令与窗口生命周期 | [src-tauri/src/lib.rs](../src-tauri/src/lib.rs)、src-tauri/src/ |
| 前端入口与关闭协调 | [src/App.tsx](../src/App.tsx) |

上表路径均相对 app/，链接相对本文。模型字段与方法直接查当前类型和实现，不维护一份容易与代码脱节的完整字段副本。

## 持久化与平台差异

状态使用 Zustand persist + Immer。桌面存储通过 `load_data` / `save_data` 命令读写系统 Documents/ProjectTodo/data.json，`PROJECTTODO_TEST_DATA_DIR` 可切换到隔离目录。localStorage 用于旧数据迁移及备份/回退，浏览器环境也可能走该路径；网页与桌面结果需分别验证。

应用已有任务/随记、导入导出、备份恢复和远程同步相关入口，不能再按早期“去除导入、暂无云同步”的假设开发。同步是否实际可用取决于配置、网络、服务端与原生环境；测试记录必须区分模拟服务与真实端点。

调整存储或恢复时，保留兼容迁移和校验失败不覆盖的行为，验证随记、标签、图片与任务往返完整性。先备份用户目录，再使用隔离数据；不同进程不得共用测试数据和 WebView 目录。

## 验证与交付

日常迭代运行受影响模块的检查；数据、备份、恢复、窗口关闭和单实例改动需要对应失败场景回归。发布前执行 [Windows 验收](RELEASE_QA.md)，网页构建通过不能代替被交付 EXE 的真实运行结果。本文中的技术步骤不授权合并主分支或发布。
