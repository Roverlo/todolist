# 以项目为中心的紧凑型待办管理设计稿（精简版）

## 1. 目标与范围
- 目标：按“项目→事项”管理，支持高效筛选、紧凑表格视图与全流程跟踪。
- 范围：项目与事项的创建/编辑/筛选/分组/导入导出/批量操作。

## 2. 信息架构与UI
- 左侧：项目列表（支持创建、重命名、归档、搜索）。
- 顶部：搜索框、筛选器（项目/状态/责任人/截止期/标签）、排序、导入/导出、批量操作按钮。
- 主区：任务表格（紧凑密度，行内编辑，支持列自定义与固定）。
- 右侧（可选）：详情抽屉（备注/附件/历史记录），默认关闭以保持紧凑。
- 表格默认列（已重排）：
  - 项目（`project`）
  - 标题（`title`）
  - 状态（`status`: todo/doing/done）
  - 优先级（`priority`: high/medium/low）
  - 详情（`notes`，创建时可填写详细描述）
  - 下一步计划（`nextStep`）
  - 创建时间（`createdAt`）
  - 截止日（`dueDate`）
  - 任务现场责任人（`onsiteOwner`）
  - 任务产线责任人（`lineOwner`）
  - 标签（`tags`）
- 交互：
  - 快速新增行（键入标题后可选字段自动补齐）。
  - 行内编辑、键盘导航（↑↓、Enter 编辑、Ctrl+S 保存）。
  - 多选行批量修改（状态/责任人/截止日/项目）。
  - 过滤：支持保存筛选（如“本周到期”、“张三负责的进行中”）。
  - 分组：按项目或状态分组，展开/折叠计数显示。

### UI改进（中文化/高对比/自适应密度/动态列宽/色块侧栏）
- 全面中文化：侧栏、工具栏、表头、弹窗与按钮统一中文术语。
- 高对比主题：加强卡片阴影、分隔线与表头背景，选中/逾期/近到期对比度提升；主题名 `theme-high-contrast`。
- 自适应密度与字号：列数>10 自动切换为紧凑模式（字号≈12px、单元格 padding 降低），≤8 恢复常规模式（≈14px）。
- 可选择展示列：入口在“列/密度”，核心列（项目/标题/状态/截止日）不可隐藏；支持固定列、移动顺序与模板保存。
- 方框配色与分隔：表格采用淡蓝/淡黄色相间的斑马纹（奇数行淡蓝 `#e6f0ff`，偶数行淡黄 `#fff7e6`），单元格间以黑色线条分隔（垂直分隔线 `#000`），高亮状态覆盖斑马底色。
 - 动态列宽：根据当前视图中文本长度计算列宽（设定最小/最大阈值），容器不足自动切换紧凑密度并减小字号；粘性列偏移基于动态宽度计算。
 - 侧栏项目色块：按项目名称哈希从淡色调（蓝/黄/绿/粉）中选择背景，提升区分度。

### UI线框图（ASCII）
```
┌────────────────────────────────────────────────────────────────────────────┐
│ 顶栏: 搜索 [▮▮▮] | 筛选[项目|状态|现场|产线|截止期|标签|优先级] | 排序 | 列/密度 | 导入 | 导出 │
├────────────────────────────────────────────────────────────────────────────┤
│ 侧栏(项目)                   │ 主区：任务表格（紧凑，行内编辑）             │
│ ▸ 项目A (12)                │ ┌──────────────────────────────────────────┐ │
│ ▸ 项目B (7)                 │ │ 项目 | 标题 | 状态 | 优先级 | 截止日 ... │ │
│ ▸ 新建项目                  │ │------------------------------------------│ │
│ 搜索项目: [........]        │ │ A   | 文档审批 | doing | high | 2025-11-20│ │
│ 归档(折叠)                  │ │ B   | 设备验收 | todo  | medium| 2025-11-22│ │
│                             │ │ …                                          │ │
├────────────────────────────────────────────────────────────────────────────┤
│ 分组切换: [按项目] [按状态] | 展开/折叠 | 计数显示                         │
└────────────────────────────────────────────────────────────────────────────┘
```

```
┌ 主区：任务表格 ──────────────────────────────┬ 详情抽屉(默认关闭) ─────────────┐
│ 行选择: A / 文档审批                         │ 备注: …                          │
│ 快捷键: Enter编辑, Ctrl+S保存                 │ 附件: [添加] 列表                 │
│ 多选: Shift/Ctrl                             │ 历史: 状态/字段变更时间线          │
└──────────────────────────────────────────────┴─────────────────────────────────┘
```

```
┌ 选中3项 ─ 批量：移动项目 | 改责任人 | 改状态 | 改截止日 | 清除标签 ───────────────┐
└───────────────────────────────────────────────────────────────────────────────┘
```

注解：
- 逾期行以高亮背景或“!”标识；状态以颜色胶囊显示。
- 列固定支持将 `project`、`title`、`dueDate` 置顶与固定左侧。
- 表格密度切换：`[紧凑|正常]`；键盘↑↓移动行，Enter 行内编辑，Ctrl+S 保存。

## 3. 功能模块与规则
- 项目管理：新增/重命名/归档，归档项目不在默认筛选中显示。
- 事项管理：CRUD、复制为新事项、移动到其他项目。
- 筛选与排序：
  - 筛选字段：项目、状态、责任人（现场/产线）、截止期范围、标签、优先级。
  - 排序：截止日/优先级/创建时间；支持多列排序（优先按状态→截止日）。
- 逾期与提醒：仅在表格中高亮逾期行；不做通知系统。
- 批量操作：批量移动项目、批量改责任人/状态/截止日。
- 导入导出：
  - 导入 CSV：映射到表头；未提供列使用默认值（如 status=todo）。
   - 导出 CSV：遵循当前列顺序与筛选结果；支持全量导出。
- 权限与隐私：本地数据，单人使用；无账号与多人协作；不含团队分享功能。

## 4. 数据结构
> 基础数据模型用于描述最小可运行的数据结构，供第 1~8 章引用；第 10 章在此基础上扩展 SavedFilter、列模板等增强字段，修改字段时需同步维护两个章节确保一致。

```
type Status = 'todo'|'doing'|'done';
type Priority = 'high'|'medium'|'low';

type Project = {
  id: string;
  name: string;
  archived?: boolean;
  createdAt: number;
  updatedAt: number;
};

type Task = {
  id: string;
  projectId: string;
  title: string;
  status: Status;
  priority?: Priority;
  dueDate?: string;       // ISO date
  createdAt: number;
  updatedAt: number;
  onsiteOwner?: string;
  lineOwner?: string;
  nextStep?: string;
  tags?: string[];
  attachments?: { id:string; name:string; path:string }[]; // 可选
  notes?: string;          // 备注，可选
};

type AppState = {
  projects: Project[];
  tasks: Task[];
  filters: {
    search: string;
    projectId?: string;
    status?: Status|"all";
    onsiteOwner?: string;
    lineOwner?: string;
    dueRange?: { from?: string; to?: string };
    tags?: string[];
    priority?: Priority|"all";
  };
  table: { density: 'compact'|'normal'; columns: string[]; pinned: string[] };
  settings: { dateFormat: string };
};
```

## 5. CSV 规范
- 列：`project,title,status,priority,dueDate,createdAt,onsiteOwner,lineOwner,nextStep,tags`
- 导入规则：
  - `project` 未匹配则创建新项目；`status` 非法值回退到 `todo`；
  - `tags` 逗号分隔；`createdAt` 空则由系统生成当前时间。
- 导出规则：
  - 按当前筛选与列顺序导出；日期统一 `YYYY-MM-DD`；
  - 空值导出为空字符串。

- 示例 CSV（UTF-8 BOM）：
```csv
project,title,status,priority,dueDate,createdAt,onsiteOwner,lineOwner,nextStep,tags
设备更新,上线审批,doing,high,2025-11-20,2025-11-01,张三,李四,提交合同,"供应商,硬件"
```
- 映射校验说明：
  - 示例源列“项目名称”映射到 `project`，“现场负责人”映射到 `onsiteOwner`；映射结果会在预览页高亮提示。
  - 导入前随机抽取 5 行与源 CSV 对照字段值，确保日期/多标签按照 `YYYY-MM-DD` 与逗号拆分写入。

## 6. 非功能与成功指标
- 操作效率：新增事项≤2步，行内编辑一次击键保存。
  - 验收：随机抽取 20 条事项，记录从新建到保存的操作步数，平均值 ≤2 且 95% 操作可在 15 秒内完成。
  - 监控：埋点统计快捷键保存成功率 ≥95%，异常会在日志中标记任务 `id`。
- 过滤准确性：组合筛选毫秒级反馈，逾期高亮清晰可见。
  - 验收：以 10 组组合筛选 + DSL 查询对比人工确认结果，差异为 0 才可发布。
  - 性能：在 2,000 行数据下，本地渲染耗时 ≤200ms，超出阈值记录性能日志。
- 导入导出一致性：两次导入后不产生重复或丢字段（基于 `id` 与列映射）。
  - 验收：使用示例 CSV A/B 循环导入 2 次后导出，diff 仅允许排序差异。
  - 监控：导入任务写入审计表，记录操作者、时间与校验摘要，便于追踪。

## 7. 实施计划
1. 用本设计替换现有内容（移除复盘/番茄/日志等章节）。
2. 重写“信息架构/模块/数据结构/CSV规范/约束”章节为上述精简版本。
3. 验证：以两份示例 CSV 完成导入/导出自检，确保字段映射与筛选生效。

## 8. 交付
- 产出：简洁紧凑、项目为中心的待办产品设计稿（单文件）。
- 不变更其他文件（仅更新设计稿内容）。
 
## 9. 扩展功能与详细规格
 
### 9.1 保存筛选视图（SavedFilter）
 - 入口：顶栏“保存视图”按钮；弹窗输入名称，保存当前 filters/sort/groupBy。
 - 行为：
  - 应用视图时覆盖 filters/sort/groupBy，不影响表格列配置。
  - 允许更新与重命名；删除后不影响原数据。
 - 校验：名称 1-30 字，唯一；最多保存 50 个视图。
 - 边界：跨项目筛选时 `projectId` 可空；保存的视图与用户本地设置绑定。
 
### 9.2 多列排序与方案保存
 - 入口：顶栏“排序”下拉（可添加排序键），支持方向 asc/desc；“保存方案”。
 - 默认：`status asc -> dueDate asc -> priority desc`。
 - 规则：
  - 排序键范围：`status,dueDate,priority,createdAt,onsiteOwner,lineOwner`。
  - 方案命名与数量与 SavedFilter 相同限制；可与视图绑定或独立保存。
 
### 9.3 Excel 批量粘贴新增
 - 入口：顶栏“批量粘贴”按钮或在空行焦点下 Ctrl+V。
 - 行为：
  - 根据当前列顺序解析剪贴板多行，多列以制表符/逗号分隔。
  - 未提供列使用默认值：`status=todo, priority=medium, createdAt=now`。
 - 校验：必填 `title, project`；非法 `status` 回退 `todo`；日期非法拒绝并提示行号。
 - 失败处理：弹出失败明细对话框，并支持导出失败CSV。
 
### 9.4 导入预览与错误报告
 - 入口：顶栏“导入”→选择 CSV→映射预览（展示源列与目标字段）。
 - 行为：
  - 预览页显示 20 行样例与映射结果，用户可调整映射。
  - 导入后生成失败CSV：`row,field,error,rawValue,suggestion`。
 - 校验：
  - 逾期日期仍可导入但高亮；未知项目自动创建；空 `createdAt` 用当前时间。
  - 标签以逗号分隔并去重；值前后空白清洗。
 
### 9.5 自定义列与列模板
 - 行为：
  - 列设置中可增删列（系统保留核心列：`project,title,status,dueDate`）。
  - 列模板：保存一组列配置（顺序、固定、密度），支持快速切换。
 - 约束：最多自定义 10 个列；模板最多 10 个；列名 1-20 字。
 
### 9.6 模板行与快速新增
 - 行为：
  - 定义模板行（预填 `status/priority/onsiteOwner/lineOwner/tags/nextStep`）。
  - 顶栏“用模板新增”下拉选择模板后插入新行。
 - 约束：模板最多 50 条；标题仍为用户输入。
 
### 9.7 责任人目录与自动建议
 - 数据：`Dictionary.onsiteOwners/lineOwners/tags` 维护常用项。
 - 行为：输入时下拉建议；不可用新词自动加入字典（可关闭自动加入）。
 - 约束：每类最多 500 项；重复项去重合并。
 
### 9.8 逾期阈值与颜色策略
 - 设置：`settings.overdueThresholdDays`（默认 0=截止日当天即逾期）。
 - 展示：逾期高亮背景；临近（≤3天）黄色提示；状态胶囊按 `status` 着色。
 - 自定义：`settings.colorScheme`（light/dark/高对比）。
 
### 9.9 子任务与依赖关系
 - 子任务（检查清单）：在详情抽屉中管理，汇总完成比率显示在主表格行。
 - 依赖：
  - 标记 `blocks`（A 阻塞 B），在被阻塞行显示提示与跳转。
  - 依赖关闭后自动清除“阻塞”提示。
 - 约束：每任务最多 50 子任务、20 依赖；循环依赖禁止。
 
### 9.10 撤销与历史
 - 撤销：支持最近 10 步撤销/重做（含批量操作）。
   - 实现：前端维护内存栈并持久化最近 3 步到 IndexedDB，断网刷新后仍可恢复关键修改。
   - 性能：每条撤销记录仅保存差异字段（field,from,to,taskId），单条 <1KB，超出则压缩。
 - 历史：详情抽屉显示字段变更时间线，可按批次查看。
   - 记录：批量操作会生成相同 `batchId`，导入/附件更新同样写入以便回溯。
   - 存储：仅在展开具体任务时拉取该任务的最新 50 条历史，避免全量加载。
 
### 9.11 搜索语法（轻量 DSL）
 - 语法：`key:value` 或比较 `key:<value`、`key:>value`；多条件空格相隔；字符串可用引号。
 - 支持键：`project,status,priority,onsiteOwner,lineOwner,tag,due,created`。
 - 示例：
  - `status:doing onsiteOwner:"张三" due:<2025-12-01`
  - `project:设备升级 priority:high tag:供应商`。
 
### 9.12 附件拖拽与轻量预览
 - 行为：拖拽到详情抽屉的附件区；支持图片/PDF/音频；缩略图与文件大小展示。
 - 限制：单文件 ≤10MB；总占用 ≤1GB；超过限制弹窗提示。
 
## 10. 数据结构扩展
> 在第 4 章 Task/AppState 基础之上叠加的扩展字段，用于 SavedFilter、列模板、Undo 等功能模块；仅实现轻量方案时可以忽略本章字段。

```
type SortKey = 'status'|'dueDate'|'priority'|'createdAt'|'onsiteOwner'|'lineOwner';

type SavedFilter = {
  id: string;
  name: string;              // 1-30 字，唯一
  filters: AppState['filters'];
  sort?: { keys: SortKey[]; directions: ('asc'|'desc')[] };
  groupBy?: 'project'|'status'|null;
};

type ColumnConfig = {
  columns: string[];         // 显示列
  pinned: string[];          // 固定列
  density: 'compact'|'normal';
  templates?: { id:string; name:string; columns:string[]; pinned:string[] }[];
};

type Dictionary = {
  onsiteOwners: string[];
  lineOwners: string[];
  tags: string[];
  autoAppend?: boolean;      // 输入新词是否自动加入
};

type ChecklistItem = { id:string; title:string; done:boolean; dueDate?:string; owner?:string; note?:string };

type Dependency = { fromTaskId:string; toTaskId:string; type:'blocks'|'relates'; status:'clear'|'blocked' };

type HistoryLog = {
  id:string;
  taskId:string;
  at:number;
  changes:{ field:string; from:any; to:any }[];
  batchId?:string;
};

// 在 Task 中扩展
type Task = Task & {
  checklist?: ChecklistItem[];
  dependencies?: Dependency[];
  history?: HistoryLog[];
};

// 在 AppState 中扩展
type AppState = AppState & {
  savedFilters: SavedFilter[];
  columnConfig: ColumnConfig;
  dictionary: Dictionary;
  settings: AppState['settings'] & {
    overdueThresholdDays: number;
    colorScheme: 'light'|'dark'|'high-contrast';
    undoDepth: number;
  };
};
```
 
## 11. 导入/导出与错误报告规范
 - 导入流程：选择 CSV→字段映射预览→校验→执行→结果摘要（成功/失败行数）。
 - 映射规则：可将任意源列映射到目标字段；未映射字段使用默认值或留空。
  - 示例：源列“项目ID”映射 `project`，“标签”列按逗号拆分映射 `tags`；预览页面展示“源列 → 目标字段”对照表。
  - 验收：每次导入都需保存映射模板并附在操作日志中，便于重复导入时核对。
 - 错误报告 CSV：`row,field,error,rawValue,suggestion`
  - `error` 枚举：`MissingRequired, InvalidStatus, InvalidDate, ValueTooLong, Unknown`。
  - `suggestion` 示例：`todo`,`2025-11-30` 等。
  - 示例行：`12,title,MissingRequired,,建模阶段,"请补全标题"`。
 - 导出规则：遵循当前筛选与列顺序；支持 UTF-8 与 GBK 两种编码选项。
 
## 12. 搜索语法规范
 - 格式：`expr := term { ' ' term }`；`term := key ':' value | key ':' comparator value`
 - 比较符：`<, <=, >, >=` 支持 `due/created` 日期；
 - 示例集合：
  - `status:todo priority:high due:<2025-12-01`
  - `project:"产线改造" lineOwner:"李四"`
  - `tag:供应商 onsiteOwner:王五`
 
## 13. 快捷键与交互矩阵
 - 表格：↑↓ 移动、Enter 编辑、Esc 取消、Ctrl+S 保存、Ctrl+D 复制行。
 - 批量：Shift/Ctrl 多选；Ctrl+G 分组切换；Ctrl+B 批量面板。
 - 视图：Ctrl+F 聚焦搜索；Alt+S 保存筛选视图；Alt+O 应用视图。
 - 撤销：Ctrl+Z 撤销、Ctrl+Y 重做；批量操作作为单个批次。
 
## 14. 验收用例（开发自测）
 - 用例1：从 Excel 粘贴 20 行包含 `project/title/status/dueDate`，非法状态被回退，日期错误 3 行弹出错误报告。
 - 用例2：保存筛选视图“本周到期”，再次打开应用后仍可一键应用，排序方案正确。
 - 用例3：逾期阈值设为 2 天，近 2 天高亮黄色，逾期红色；切换到高对比方案颜色变化明显。
 - 用例4：任务 A 阻塞 B，清除依赖后 B 的阻塞提示消失；循环依赖被禁止并提示。
 - 用例5：撤销最近 10 次操作（含两次批量），重做后数据与历史一致。

## 15. 附件与图片（采集/展示/存储/导出）

### 15.1 入口与交互
- 详情抽屉的“附件”区：
  - 按钮：`上传`（文件选择），`粘贴图片`（剪贴板），`拖拽到此处`（高亮投放区）。
  - 列表：缩略图（图片）/文件图标 + 文件名 + 大小 + 创建时间。
  - 操作：预览（图片内嵌、PDF新窗口、音频轻量播放）、下载、重命名、删除（二次确认）、复制路径。
- 快捷键：Delete 删除、F2 重命名。

### 15.2 支持类型与限制
- 类型：图片（png/jpg/webp）、PDF、音频（mp3/wav）。
- 限制：
  - 单文件 ≤ 10MB；每任务最多 100 个附件；全局占用 ≤ 1GB。
  - 拒绝未知或可执行类型（如 `.exe`）；文件名长度 ≤ 120 字符。

### 15.3 存储与路径
- 结构：
  - 主文件：`data/attachments/{taskId}/{fileName}`
  - 缩略图：`data/attachments/{taskId}/thumbs/{fileName}.png`
- 文件名安全化：移除非法字符（`/\:*?"<>|`）、保留扩展名，重名自动追加 `-1,-2`。
- 去重：保存前计算 SHA-256（`hash`）；若同一任务下存在相同 `hash`，仅建立引用不重复存储。

### 15.4 数据结构
- `Task.attachments: { id,name,type,size,path,createdAt,hash? }[]`
- 缩略图地址可由 `path` 派生：`thumbPath = path.replace(/\\(?!.*\\)/, '\\thumbs\\') + '.png'`
- 历史：在 `HistoryLog` 中记录附件新增/删除/重命名的批次。

### 15.5 导入/导出
- 导出 ZIP：
  - 结构：`tasks.csv` + `attachments/{taskId}/files...` + `attachments/{taskId}/thumbs...`
  - 入口：顶栏 `导出` 下拉选择 `导出 ZIP（含附件）`。
- 导入 ZIP：
  - 流程：先导入 `tasks.csv` → 解析 `attachments/` 目录 → 挂载到对应 `taskId`。
  - 错误：若目标任务缺失或文件损坏，记录失败并生成错误报告。

### 15.6 错误处理与提示
- 超类型/超大小/超配额/读写失败：弹出明确错误原因与建议（压缩/清理）。
- 删除不可逆，需二次确认；重命名更改扩展名时再次确认。
- 生成缩略图失败时不阻断上传，显示通用图标并记录日志。

### 15.7 验收用例（附件）
- 用例A：粘贴截图成功生成 PNG，出现缩略图与大小；删除后历史记录包含删除事件。
- 用例B：拖拽 PDF 成功，点击预览新窗口打开；音频可轻量播放。
- 用例C：上传 12MB 文件被拒绝并提示；上传 100+ 文件被拒绝并提示数量上限。
- 用例D：重复文件（同内容）去重，仅建立引用；重命名保持扩展名。
- 用例E：导出 ZIP 后包含 CSV 与附件目录；导入 ZIP 后还原附件关系并生成预览。
