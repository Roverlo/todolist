# 项目技术方案（去除导入功能后）

## 1. 技术栈
- 前端：React 18 + TypeScript + Vite；状态管理：Zustand（persist + immer）；日期：dayjs；ID：nanoid；样式：手写 CSS。
- 桌面：Tauri 2（Rust 2021），插件：dialog、fs、log，用于目录选择与文件写入。
- 打包：Tauri 生成裸 exe、NSIS、MSI，便携版从 release exe 复制到 `portable/`。

## 2. 主要数据模型（types.ts）
- Task：id、projectId、title、status(todo/doing/done)、priority(high/medium/low)、dueDate、createdAt/updatedAt、onsiteOwner、lineOwner、nextStep、notes、tags[]、attachments[]、extras。
- Project：id、name、archived、createdAt/updatedAt。
- Filters：projectId、statuses[]、priority、onsiteOwner/lineOwner、dueRange、tags、search。
- ColumnConfig：columns、pinned、density、templates。
- RecurringTemplate：projectId、title、status、priority、schedule(weekly|monthly)、defaults、active。
- Settings：dateFormat、overdueThresholdDays、colorScheme、undoDepth、trashRetentionDays。
- SavedFilter / SortRule / Dictionary（责任人、标签自动补全）。

## 3. 状态与持久化（state/appStore.ts）
- 使用 Zustand + persist（localStorage JSON），启动时写入示例项目与任务。
- 状态分片：projects、tasks、filters/groupBy/sortRules、savedFilters、columnConfig、dictionary、settings、recurringTemplates、sortSchemes。
- 业务方法：add/update/delete Task，项目 CRUD，过滤/分组/排序更新，导出，周期任务生成，字典自动补全等。

## 4. UI 模块
- Sidebar：项目选择、系统视图、项目 CRUD。
- PrimaryToolbar：新建单次/周期任务、导出、筛选器、分组开关。
- RecurringTaskModal：周期模板（默认状态=进行中），周/月截止日选择，自动续期。
- ExportModal：CSV 导出；Tauri 走插件写文件，Web 走 Blob 下载。
- TaskTable：自适应列宽、固定列（项目/标题/创建时间）、分组折叠、行内编辑、底部详情行（状态/优先级/截止日/责任人/创建时间等）。
- 样式：`App.css` 定义变量、密度模式、高对比主题；表格有右侧安全区与固定 actions 宽度，近期对卡片/表单间距做过压缩。

## 5. 数据流与交互
- 加载：persist -> 初始化示例数据。
- 展示：`useVisibleTasks` 根据 filters/sort/groupBy 输出分组任务；TaskTable 渲染 + 伸缩列 + 斑马纹。
- 编辑：双击行编辑，Ctrl+S 保存，Esc 取消；批量操作在 toolbar。
- 导出：CSV 固定表头，UTF-8 BOM，Tauri 写文件，Web 触发下载。
- 周期任务：模板计算当前周/月截止日，生成 Task，支持自动续期标记（extras）。

## 6. 平台与产物
- Web：纯前端，无后端依赖。
- Desktop：Tauri 2，`src-tauri/src/lib.rs` 挂载 dialog/fs/log 插件，`tauri.conf.json` 定义 bundler。
- 产物：`app/src-tauri/target/release/app.exe`（裸），`bundle/nsis`/`bundle/msi` 安装包，`portable/ProjectTodo-*.exe` 便携版。

## 7. 非功能与约束
- 离线可用（localStorage + 本地导出）；暂无云同步。
- 性能目标：~2k 条任务下过滤/排序 <200ms，表格自动调整密度。
- 可访问性：高对比主题钩子，固定列阴影和右侧 gutter 防遮挡。


