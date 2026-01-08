export type Status = 'doing' | 'done' | 'paused';
export type Priority = 'high' | 'medium' | 'low';

export type SortKey =
  | 'project'
  | 'title'
  | 'status'
  | 'priority'
  | 'notes'
  | 'latestProgress'
  | 'nextStep'
  | 'dueDate'
  | 'createdAt'
  | 'owners';

export type GroupBy = 'project' | 'status' | null;

export type ColumnDensity = 'compact' | 'normal';

export interface Project {
  id: string;
  name: string;
  archived?: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface Attachment {
  id: string;
  name: string;
  size: number;
  type: string;
  dataUrl?: string;
  createdAt: number;
  hash?: string;
}


export interface Dependency {
  fromTaskId: string;
  toTaskId: string;
  type: 'blocks' | 'relates';
  status: 'clear' | 'blocked';
}

export interface HistoryChange {
  field: string;
  from: any;
  to: any;
}

export interface HistoryLog {
  id: string;
  taskId: string;
  at: number;
  changes: HistoryChange[];
  batchId?: string;
}

export type ProgressStatus = 'doing' | 'blocked' | 'done';

export interface ProgressEntry {
  id: string;
  at: number;
  status?: ProgressStatus;
  note: string;
  attachments?: Attachment[];
}

export type SubtaskStatus = 'todo' | 'doing' | 'done' | 'suspended';

export interface Subtask {
  id: string;
  title: string;
  completed: boolean;
  status?: SubtaskStatus; // Added for granular subtask status
  createdAt: number;
  completedAt?: number;  // 完成时间戳
  dueDate?: string;       // 截止日期 (YYYY-MM-DD)
  assignee?: string;      // 责任人
}

export interface Task {
  id: string;
  projectId: string;
  title: string;
  status: Status;
  isPinned?: boolean;
  priority?: Priority;
  dueDate?: string;
  createdAt: number;
  updatedAt: number;
  owners?: string;  // 责任人（格式: 小明/小红/小张）
  // 保留旧字段用于数据迁移兼容
  onsiteOwner?: string;
  lineOwner?: string;
  nextStep?: string;
  tags?: string[];
  attachments?: Attachment[];
  notes?: string;
  dependencies?: Dependency[];
  history?: HistoryLog[];
  progress?: ProgressEntry[];
  subtasks?: Subtask[];
  extras?: Record<string, string>;
}

export interface RecurringTemplate {
  id: string;
  projectId: string;
  title: string;
  status: Status;
  priority?: Priority;
  schedule: {
    type: 'daily' | 'weekly' | 'monthly';
    daysOfWeek?: number[];
    dayOfMonth?: number;
    flexible?: boolean;
    interval?: number;
    anchorDate?: string;
  };
  dueStrategy: 'sameDay' | 'endOfWeek' | 'endOfMonth' | 'none';
  owners?: string;
  defaults?: {
    nextStep?: string;
    tags?: string[];
    notes?: string;
  };
  subtasks?: Subtask[];
  active: boolean;
}

export interface DateRangeFilter {
  from?: string;
  to?: string;
}

export interface Filters {
  search: string;
  status?: Status | 'all' | 'overdue' | 'dueToday';
  statuses?: Status[];
  projectId?: string;
  owner?: string;  // 统一的责任人筛选（兼容 owners/onsiteOwner/lineOwner）
  dueRange?: DateRangeFilter;
  tags?: string[];
  priority?: Priority | 'all';
  query?: string;
}

export interface SortRule {
  key: SortKey;
  direction: 'asc' | 'desc';
}

export interface SavedFilter {
  id: string;
  name: string;
  filters: Filters;
  sort?: SortRule[];
  groupBy?: GroupBy;
}

export interface ColumnTemplate {
  id: string;
  name: string;
  columns: string[];
  pinned: string[];
}

export interface ColumnConfig {
  columns: string[];
  pinned: string[];
  density: ColumnDensity;
  templates: ColumnTemplate[];
  labels?: Record<string, string>;
}

export interface Dictionary {
  onsiteOwners: string[];
  lineOwners: string[];
  tags: string[];
  autoAppend?: boolean;
}

export interface Settings {
  dateFormat: string;
  overdueThresholdDays: number;
  colorScheme: string;
  undoDepth: number;
  trashRetentionDays?: number;
  listFontSize?: number;
  highlightRows?: boolean;
  autoBackup?: AutoBackupConfig;
  // 到期提醒设置
  dueReminderEnabled?: boolean; // 是否启用到期提醒，默认 true
  dueReminderSnoozeUntil?: string; // 暂时不提醒，直到该时间（ISO 格式）
  ai?: AISettings; // AI 设置
  defaultView?: 'last' | 'tasks' | 'notes'; // 默认启动视图
  updateCheck?: UpdateCheckConfig; // 自动更新检查配置
}

export interface AutoBackupConfig {
  enabled: boolean;
  interval: number; // minutes
  retentionCount: number;
  dailyBackup?: boolean; // 是否启用每日归档
  lastBackupAt?: string;
  customPath?: string; // 自定义备份目录路径
}

export interface UpdateCheckConfig {
  checkOnStartup: boolean;    // 启动时检查，默认 true
  autoCheck: boolean;         // 定时检查，默认 true
  checkInterval: number;      // 检查间隔（分钟），默认 60，最小 10
  lastCheckAt?: string;       // 上次检查时间（ISO 格式）
  skipVersion?: string;       // 跳过提醒的版本号
}

export interface SortScheme {
  id: string;
  name: string;
  rules: SortRule[];
}

export interface UndoState {
  past: AppDataSnapshot[];
  future: AppDataSnapshot[];
}

export interface AppData {
  projects: Project[];
  tasks: Task[];
  filters: Filters;
  groupBy: GroupBy;
  sortRules: SortRule[];
  savedFilters: SavedFilter[];
  columnConfig: ColumnConfig;
  dictionary: Dictionary;
  settings: Settings;
  sortSchemes: SortScheme[];
  recurringTemplates: RecurringTemplate[];
  notes: Note[];
  tags: NoteTag[];           // 笔记标签系统
  aiSettings?: AISettings;   // AI 设置
  noteSearchText?: string;
  activeNoteTagId?: string | null;
  noteTreeExpandedState?: Record<string, boolean>;
  activeView?: 'tasks' | 'notes'; // 当前视图模式
  noteViewMode?: 'tree' | 'trash'; // 笔记视图模式：树形列表或回收站
  selectedNoteId?: string | null; // 全局选中的笔记 ID
}

export type AppDataSnapshot = Omit<AppData, never>;

// ==================== Note Types ====================

export interface Note {
  id: string;
  title: string;          // 可选标题，默认为空
  content: string;        // 笔记内容
  tags?: string[];        // 标签数组
  createdAt: number;      // 创建时间戳
  updatedAt: number;      // 更新时间戳
  isPinned?: boolean;     // 是否置顶
  deletedAt?: number;     // 删除时间戳（软删除）
}

export interface NoteTag {
  id: string;
  name: string;
  icon: string;           // Emoji 图标
  color?: string;         // 高亮颜色
  count: number;          // 该标签的笔记数
  isSystem: boolean;      // 是否为系统标签（如"全部"）
}

export type NoteTreeNodeType = 'root' | 'pinned-group' | 'year' | 'month' | 'note';

export interface NoteTreeNode {
  id: string;
  type: NoteTreeNodeType;
  label: string;
  icon: string;
  children?: NoteTreeNode[];
  collapsed: boolean;
  selected?: boolean;
  count: number;
  noteId?: string;        // 对应的笔记ID（type=note 时）
  tags?: string[];        // 笔记标签（type=note 时）
  date?: string;          // ISO date string (type=year/month)
}

// ==================== AI Types ====================

export type AIProviderType = 'deepseek' | 'openai' | 'qwen' | 'custom' | 'gemini' | 'anthropic' | 'moonshot' | 'yi';

export interface AIProviderProfile {
  id: string;
  type: AIProviderType;
  name: string;           // 显示名称
  apiKey?: string;        // API Key
  apiEndpoint?: string;   // 自定义端点
  model?: string;         // 模型名称
}

export interface AISettings {
  activeProviderId?: string;
  providers: AIProviderProfile[];
}

export interface AIGeneratedTask {
  title: string;
  notes?: string;         // 备注/描述
  priority?: Priority;
  dueDate?: string;       // YYYY-MM-DD
  owner?: string;
  nextStep?: string;            // 下一步计划
  isRecurring?: boolean;        // 是否为周期任务
  recurringHint?: string;       // 周期提示（如 "每周五"）
  suggestedProject?: string;    // AI 推荐的项目名
  projectId?: string;           // 用户选择的项目 ID
  subtasks?: AIGeneratedSubtask[];
  selected?: boolean;     // 用户选择状态
}

export interface AIGeneratedSubtask {
  title: string;
  dueDate?: string;
  owner?: string;
}
