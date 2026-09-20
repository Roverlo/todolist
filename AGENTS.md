# ProjectTodo 项目指引

实际应用位于 `app/`，是 React + TypeScript + Tauri 的 Windows 桌面程序。命令在 `app/` 执行；[开发说明](app/README.md) 是环境与产物入口，[技术方案](app/docs/TECH_PLAN.md) 是代码定位入口。

- 以当前分支的 package.json、锁文件、Tauri 配置和脚本为准；不要沿用旧文档中的版本、缺失的 design.md 或不存在的 bundle/app 路径。
- 桌面数据默认在系统 Documents/ProjectTodo；浏览器预览的存储与原生行为不能代替桌面验收。任何可能写入用户数据的验证前，完整备份该目录并核对哈希、记录恢复命令。
- 测试使用独立 `PROJECTTODO_TEST_DATA_DIR` 和 `WEBVIEW2_USER_DATA_FOLDER`，只用虚构数据；不触碰真实同步空间、模型凭据或用户正在使用的进程。
- 日常代码修改运行覆盖受影响行为的检查；涉及数据保存、导入、备份、恢复、关闭或单实例逻辑时，必须覆盖失败路径与原生行为。
- 用户要求 Windows 可用产物时，交付实际测试过的单文件 EXE，记录提交和 SHA-256。完整流程见 [Windows 验收](app/docs/RELEASE_QA.md)；构建成功或网页预览通过不等于 EXE 验收通过。
- 持续使用本任务绑定的 feature 分支；合并、发布与交付包分发分别以用户授权为准，验收流程不能自动授权合并 main。

纯文档修改检查引用、命令与代码事实及 `git diff --check`；无需为此构建 EXE 或打开用户数据。
