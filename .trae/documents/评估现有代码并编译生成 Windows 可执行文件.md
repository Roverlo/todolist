## 评估结论
- 已存在 Tauri + React + TS 项目：`c:\personal\task\app`。
- 关键文件：
  - `package.json`（含 `tauri:build` 脚本）
  - `src-tauri/tauri.conf.json`（产品名 ProjectTodo，bundle active）
  - 前端代码与类型实现：`src/**`，对齐设计稿（保存视图、排序、导入预览、附件等）。
- 现有构建产物：`app\src-tauri\target\release\app.exe` 已存在，但需重新编译以同步你最新代码。

## 编译方案（继续用现有项目）
- 使用现有 `app` 项目，不重新初始化；执行干净安装与构建：
  1. `npm ci`（使用现有 `package-lock.json`）
  2. `npm run build`（前端产物到 `dist/`）
  3. `npm run tauri build`（生成 `exe`）
- 产物位置：`c:\personal\task\app\src-tauri\target\release\ProjectTodo.exe` 或同目录下 `app.exe`（以实际输出为准）。
- 验证：启动 `exe`，检查表格视图、筛选、导入预览、附件上传等基础功能是否正常；记录异常并修复后重建。

## 风险与处理
- Rust 与 MSVC 工具链：如缺失会导致编译失败；如失败，执行安装或转用已有 `deps\app.exe`（临时）。
- 权限与路径：若产生写权限问题，切换到用户文档目录；保留默认 `data/`。

## 交付
- 提供已构建的 `exe` 路径与运行说明（双击运行、数据路径说明）。
- 如你需要，我可附带示例 `demo.csv` 与 SavedFilter 视图以便验收。