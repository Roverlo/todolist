## 目标
- 移除与“子任务/清单（checklist）”相关的所有 UI、数据结构、导入导出、列配置与默认值
- 保持现有数据与其它功能稳定（附件/进展/详情/责任人等不受影响）

## 代码改动范围
### 1. 类型与数据模型
- `app/src/types.ts`
  - 删除 `ChecklistItem` 接口
  - 从 `Task` 中删除 `checklist?: ChecklistItem[]` 字段
- 迁移注意：如有历史数据含 `checklist`，在运行时不会再被访问；为避免编译错误，清理所有使用点

### 2. 列与配置
- `app/src/state/appStore.ts`
  - 从 `ALL_COLUMNS`、默认 `columnConfig.columns` 中移除 `checklist`
  - bump 版本号（例如 `version: 7`），在 `migrate` 中将用户已有的 `checklist` 从 `columns` 与 `pinned` 中剔除
  - `addTask` / `importTasks` 去掉对 `checklist` 的初始化与赋值
  - 示例任务不包含 `checklist`
- `app/src/components/toolbar/ColumnManager.tsx`
  - 列标签映射中删除 `checklist`

### 3. 表格与展示
- `app/src/components/task-table/TaskTable.tsx`
  - `columnMeta` 删除 `checklist`
  - `renderDisplay` 删除 `checklist` 分支
  - `computeColumnWidths` 不再采样 `checklist`

### 4. 详情/抽屉
- `app/src/components/details/DetailsDrawer.tsx`
  - 删除清单区域、相关 UI 与逻辑（`toggleChecklist`、`addChecklist` 等）

### 5. 导入/导出
- `app/src/components/toolbar/ImportModal.tsx`
  - 确认未包含 `checklist` 字段（当前仅有 `tags`）；无需改则保留
- `app/src/utils/csv.ts`
  - 若导出包含清单统计或字段，删除相关列

### 6. 其它
- 全局搜索并移除 `checklist`、`ChecklistItem` 的残留引用（包括注释、常量、类型断言）
- 样式无特定依赖则无需调整；若详情区出现空分区，顺手清理

## 验证
- 编译通过（TS 类型无残留引用）
- 运行检查：
  - 列编辑不再出现“子任务”
  - 表格中无“子任务”列/内容
  - 详情抽屉无“子任务”分区
  - 导入/导出不包含子任务
- 历史数据：含有 `checklist` 的任务依旧可显示其它信息，不报错（字段未被访问）

## 交付
- 应用以上改动后，构建并产出绿色版 exe：`C:\personal\task\portable\Task.exe`
- 清理安装包输出（保留绿色版）

## 变更记录
- 提升 `appStore` 持久化版本到 7，以确保用户自定义列配置会自动剔除 `checklist`
- 不影响`extras`、`attachments`、`progress`等现有功能

如无异议，我将按以上步骤实施并交付新的绿色版。