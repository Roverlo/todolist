# ProjectTodo

Windows 桌面项目与任务管理工具，包含项目、任务、进展、周期任务和随记。React + TypeScript + Vite 提供界面，Tauri 2 / Rust 提供本地文件与原生窗口能力。

## 环境与目录

- 前端依赖以 [package.json](package.json) 和 package-lock.json 为准：当前声明 React 18.3、Vite 7、Zustand、Tiptap 等。
- 当前 Vite 的 Node.js 要求是 `^20.19.0 || >=22.12.0`；升级依赖时重新核对锁文件的 engines。
- 桌面构建需要 Rust 工具链及 Windows C++ 构建工具；缺少系统工具时先说明并取得安装授权。

`src/` 是前端，`src-tauri/` 是原生代码与配置，`scripts/` 是构建和验证工具，`dist/` 是生成的网页产物。代码入口见 [技术方案](docs/TECH_PLAN.md)。

以下 PowerShell 命令在仓库的 `app/` 目录运行：

```powershell
npm ci
npm run dev
```

开发端口由 vite.config.ts 与 Tauri devUrl 配置，当前为 5173；实际启动前核对占用进程。桌面开发使用 `npm run tauri:dev`。浏览器预览不能验证文件存储、单实例、托盘、关闭或原生对话框。

## 构建与 Windows 产物

```powershell
npm run lint
npm run build
npm run tauri:build -- --no-bundle
./scripts/create-portable.ps1
```

网页输出在 `dist/`。原生 EXE 默认是 `src-tauri/target/release/app.exe`；设置了 `CARGO_TARGET_DIR` 时使用其 `release/app.exe`。便携脚本复制为仓库根目录下的 `portable/01_Offline_Portable/ProjectTodo_<构建时间>.exe`，并生成对应说明文件。

当前 Tauri 配置没有指定安装包 targets，也没有配置签名；不能把普通构建描述为已签名的 MSI/NSIS，或声称 EXE 位于 bundle/app。安装包和签名必须按当次明确要求另行配置、验证。

交付前按 [Windows 免安装版验收流程](docs/RELEASE_QA.md) 测试最终 EXE，记录源码提交、文件哈希和实际覆盖。先在本任务功能分支构建；只有用户明确要求合并时才合并，并复核合并后产物。

## 数据与验证边界

桌面模式通过 Rust 命令读写系统 Documents/ProjectTodo/data.json；Zustand 的 localStorage 还用于旧数据迁移及备份/浏览器回退，不能把桌面数据描述成仅保存在 localStorage。图片副本、备份、导入恢复和同步入口见设置页面及 [技术方案](docs/TECH_PLAN.md)。

涉及数据写入前备份用户 Documents/ProjectTodo 全目录并核对 SHA-256。测试使用独立 `PROJECTTODO_TEST_DATA_DIR` 和 `WEBVIEW2_USER_DATA_FOLDER`，真实同步服务使用专用测试端点；不得用生产数据测试恢复。

日常验证按改动选择 [RELEASE_QA.md](docs/RELEASE_QA.md) 中的检查；纯文档变更只核对内容、引用和 diff。完整 EXE 交付仍需原生流程与数据保护检查。
