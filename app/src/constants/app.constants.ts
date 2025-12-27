// ID长度常量
export const ID_LENGTHS = {
  PROJECT: 10,
  TASK: 12,
  TEMPLATE: 8,
  PROGRESS: 10,
  HISTORY: 10,
  ATTACHMENT: 10,
} as const;

// 默认设置
export const DEFAULT_SETTINGS = {
  UNDO_DEPTH: 10,
  TRASH_RETENTION_DAYS: 60,
  OVERDUE_THRESHOLD_DAYS: 0,
  DATE_FORMAT: 'YYYY-MM-DD',
} as const;

// 状态标签
export const STATUS_LABELS = {
  doing: '进行中',
  paused: '挂起',
  done: '已完成',
} as const;

// 优先级标签
export const PRIORITY_LABELS = {
  high: '高',
  medium: '中',
  low: '低',
} as const;

// 排序顺序
export const SORT_ORDER = {
  STATUS: {
    doing: 0,
    paused: 1,
    done: 2,
  },
  PRIORITY: {
    high: 0,
    medium: 1,
    low: 2,
  },
} as const;

// 文件上传限制
export const FILE_UPLOAD = {
  MAX_SIZE: 10 * 1024 * 1024, // 10MB
  ALLOWED_TYPES: [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain',
    'text/csv',
  ],
} as const;

// 表格配置
export const TABLE_CONFIG = {
  ROW_HEIGHT: 80,
  VIRTUAL_SCROLL_THRESHOLD: 50,
  DEFAULT_PAGE_SIZE: 20,
} as const;

// 键盘快捷键
export const KEYBOARD_SHORTCUTS = {
  NEW_TASK: 'Ctrl+N',
  UNDO: 'Ctrl+Z',
  REDO: 'Ctrl+Y',
  SEARCH: 'Ctrl+F',
  DELETE: 'Delete',
  SAVE: 'Ctrl+S',
  EXPORT: 'Ctrl+E',
} as const;

// 颜色方案
export const COLOR_SCHEMES = {
  light: {
    bg: '#f3f4f6',
    surface: '#ffffff',
    borderSubtle: '#e5e7eb',
    primary: '#2563eb',
    primarySoft: '#dbeafe',
    primaryDeep: '#1d4ed8',
    accent: '#0ea5e9',
    textMain: '#111827',
    textSubtle: '#6b7280',
    danger: '#dc2626',
    dangerSoft: '#fee2e2',
  },
  dark: {
    bg: '#0f172a',
    surface: '#1e293b',
    borderSubtle: '#334155',
    primary: '#3b82f6',
    primarySoft: '#1e3a8a',
    primaryDeep: '#2563eb',
    accent: '#06b6d4',
    textMain: '#f1f5f9',
    textSubtle: '#94a3b8',
    danger: '#ef4444',
    dangerSoft: '#7f1d1d',
  },
} as const;

// API端点（预留）
export const API_ENDPOINTS = {
  BASE_URL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000',
  TASKS: '/api/tasks',
  PROJECTS: '/api/projects',
  ATTACHMENTS: '/api/attachments',
} as const;

// 存储键名
export const STORAGE_KEYS = {
  APP_STATE: 'app-state',
  USER_PREFERENCES: 'user-preferences',
  RECENT_PROJECTS: 'recent-projects',
  DRAFT_TASK: 'draft-task',
} as const;
