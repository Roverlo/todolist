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

export interface Subtask {
  id: string;
  title: string;
  completed: boolean;
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
    type: 'weekly' | 'monthly';
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
  status?: Status | 'all';
  statuses?: Status[];
  projectId?: string;
  onsiteOwner?: string;
  lineOwner?: string;
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
}

export type AppDataSnapshot = Omit<AppData, never>;
