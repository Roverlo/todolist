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
  | 'onsiteOwner'
  | 'lineOwner';

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
  status: ProgressStatus;
  note: string;
  attachments?: Attachment[];
}

export interface Task {
  id: string;
  projectId: string;
  title: string;
  status: Status;
  priority?: Priority;
  dueDate?: string;
  createdAt: number;
  updatedAt: number;
  onsiteOwner?: string;
  lineOwner?: string;
  nextStep?: string;
  tags?: string[];
  attachments?: Attachment[];
  notes?: string;
  dependencies?: Dependency[];
  history?: HistoryLog[];
  progress?: ProgressEntry[];
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
  };
  dueStrategy: 'sameDay' | 'endOfWeek' | 'endOfMonth' | 'none';
  defaults?: {
    onsiteOwner?: string;
    lineOwner?: string;
    nextStep?: string;
    tags?: string[];
    notes?: string;
  };
  active: boolean;
}

export interface DateRangeFilter {
  from?: string;
  to?: string;
}

export interface Filters {
  search: string;
  status?: Status | 'all';
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
  colorScheme: 'light' | 'dark' | 'high-contrast';
  undoDepth: number;
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
