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

交付前按 [Windows 免安装版验收流程](docs/RELEASE_QA.md) 测试最终 EXE，记录源码提交、文件哈希和实际覆盖。日常开发直接在 main 修改、验证、提交和推送；发布与交付包分发单独授权。

## 随记待办排序

点击随记正文中的一个待办，在工具栏“待办”旁打开“待办排序”，选择“未完成在前”或“已完成在前”。排序只整理光标所在列表的同级待办，相同状态保持原有顺序，子待办连同父项一起移动；点击子待办后也能单独整理该层列表。顺序会随正文自动保存，可用 Ctrl+Z 撤销。勾选完成时保持当前位置，需要整理时再点击排序。

勾选父待办会同时完成其所有下级待办（包括多层子项）。每个新完成的待办记录完整完成时间，并在文字末尾用小号灰字简写：当天显示时分，同年显示月日和时分，跨年显示年月日和时分；悬停可查看精确到秒的本地时间。已经完成的子项保留原时间。取消勾选只重新打开当前项并清除其完成时间，再次完成会记录新的时间。一次勾选及其联动支持整体撤销/重做。旧记录没有完成时间时不补造时间，单纯打开或排序不会补写时间。

## 数据与验证边界

桌面模式通过 Rust 命令读写系统 Documents/ProjectTodo/data.json；Zustand 的 localStorage 还用于旧数据迁移及备份/浏览器回退，不能把桌面数据描述成仅保存在 localStorage。图片副本、备份、导入恢复和同步入口见设置页面及 [技术方案](docs/TECH_PLAN.md)。

涉及数据写入前备份用户 Documents/ProjectTodo 全目录并核对 SHA-256。测试使用独立 `PROJECTTODO_TEST_DATA_DIR` 和 `WEBVIEW2_USER_DATA_FOLDER`，真实同步服务使用专用测试端点；不得用生产数据测试恢复。

日常验证按改动选择 [RELEASE_QA.md](docs/RELEASE_QA.md) 中的检查；纯文档变更只核对内容、引用和 diff。完整 EXE 交付仍需原生流程与数据保护检查。

## 图片与文件附件

随记支持粘贴、拖入或通过工具栏“插入附件”选择任意格式文件（包括空文件），不设单文件大小上限。PNG、JPEG、WebP、GIF 默认显示为图片；其他格式显示文件卡片，也可用“插入附件”将图片作为原文件保存。文件夹需先压缩。图片不会自动降质或压缩。

EXE 版统一将文件保存在系统 Documents/ProjectTodo/attachments；设置 → 数据 → 附件存储位置可查看并打开实际目录。正文只保存附件引用，另存为可导出原文件；“所在文件夹”定位存储副本。网页预览使用浏览器内嵌存储，与 EXE 独立，仍受浏览器存储容量约束。

旧随记的内嵌图片首次加载时自动迁移。迁移前在数据目录旁生成 `ProjectTodo-before-attachments-<时间>` 全目录备份，逐文件校验内容并写入 `RESTORE.ps1`；原 images 目录保留，不自动删除。迁移失败会保留原正文并提示。需要回滚时先关闭程序，再运行备份目录中的恢复脚本。

本地/自动备份、云同步上传以及随记 HTML/Markdown 导出会嵌入附件内容，迁移和恢复不依赖原电脑的路径。恢复时先写入附件，全部成功后才应用数据。附件缺失会使备份或导出明确失败。手动迁移需复制整个数据目录；仅复制 data.json 不包含新附件。

附件功能验证：`node scripts/test-note-attachments.mjs`；原生验证：`./scripts/test-portable.ps1 -Executable '<EXE绝对路径>' -Attachments`，包含大图、文件字节完整性、旧图迁移、缺失/写入失败及备份恢复。
