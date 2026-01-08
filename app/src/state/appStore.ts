import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { StateStorage } from 'zustand/middleware';
import { invoke } from '@tauri-apps/api/core';
import { produce } from 'immer';
import dayjs from 'dayjs';
import { nanoid } from 'nanoid';
import { useShallow } from 'zustand/react/shallow';
import type {
  Project,
  SortRule,
  AppData,
  AppDataSnapshot,
  Filters,
  GroupBy,
  ColumnConfig,
  ColumnTemplate,
  RecurringTemplate,
  Task,
  Attachment,
  ProgressEntry,
  Settings,
  AISettings,
  SavedFilter,
  Note,
  NoteTag,
  AIProviderProfile
} from '../types';

const CORE_COLUMNS = [
  'project',
  'title',
  'status',
  'priority',
  'dueDate',
  'createdAt',
  'onsiteOwner',
  'lineOwner',
  'nextStep',
];

export const ALL_COLUMNS = [
  ...CORE_COLUMNS,
  'checklist',
  'notes',
  'attachments',
  // intentionally no 'tags' column
];

const DEFAULT_SORT: SortRule[] = [
  { key: 'dueDate', direction: 'asc' },
  { key: 'status', direction: 'asc' },
  { key: 'priority', direction: 'desc' },
];

const defaultColumnConfig: ColumnConfig = {
  columns: [
    'project',
    'title',
    'status',
    'priority',
    'notes',
    'latestProgress',
    'nextStep',
    'createdAt',
    'dueDate',
    'onsiteOwner',
    'lineOwner',
  ],
  pinned: ['project', 'title', 'createdAt'],
  density: 'compact',
  templates: [],
};

const defaultSettings: Settings = {
  dateFormat: 'YYYY-MM-DD',
  overdueThresholdDays: 0,
  colorScheme: 'purple',
  undoDepth: 10,
  trashRetentionDays: 30,
  listFontSize: 13,
  highlightRows: false,
  autoBackup: {
    enabled: false,
    interval: 60,
    retentionCount: 24,
    dailyBackup: true,
  },
  ai: {
    providers: [
      {
        id: 'deepseek-default',
        type: 'deepseek',
        name: 'DeepSeek V3',
        model: 'deepseek-chat',
        apiEndpoint: 'https://api.deepseek.com/v1/chat/completions',
      }
    ],
    activeProviderId: 'deepseek-default',
  },
  updateCheck: {
    checkOnStartup: true,
    autoCheck: true,
    checkInterval: 60,
  },
};

const makeProject = (name: string): Project => ({
  id: nanoid(10),
  name,
  archived: false,
  createdAt: Date.now(),
  updatedAt: Date.now(),
});

const sampleProjects = [
  makeProject('设备升级'),
  makeProject('产线改造'),
  makeProject('供应商上线'),
];

const today = dayjs();

const sampleTasks: Task[] = [
  {
    id: nanoid(12),
    projectId: sampleProjects[0].id,
    title: '升级服务器固件',
    status: 'doing',
    priority: 'high',
    dueDate: today.add(3, 'day').format('YYYY-MM-DD'),
    createdAt: today.subtract(5, 'day').valueOf(),
    updatedAt: today.valueOf(),
    nextStep: '验证升级后的稳定性',
    tags: ['设备', '固件'],
    notes: '本周完成固件升级并回归测试',
  },
  {
    id: nanoid(12),
    projectId: sampleProjects[1].id,
    title: '生产线搬迁方案评审',
    status: 'paused',
    priority: 'medium',
    dueDate: today.add(7, 'day').format('YYYY-MM-DD'),
    createdAt: today.subtract(2, 'day').valueOf(),
    updatedAt: today.subtract(1, 'day').valueOf(),
    nextStep: '安排现场走查',
    tags: ['评审'],
    notes: '等待厂务确认电力改造时间',
  },
  {
    id: nanoid(12),
    projectId: sampleProjects[2].id,
    title: '对接供应商接口测试',
    status: 'doing',
    priority: 'medium',
    dueDate: today.add(1, 'day').format('YYYY-MM-DD'),
    createdAt: today.subtract(1, 'day').valueOf(),
    updatedAt: today.valueOf(),
    nextStep: '输出联合测试报告',
    tags: ['接口', '联调'],
  },
  {
    id: nanoid(12),
    projectId: sampleProjects[0].id,
    title: '设备入库验收',
    status: 'paused',
    priority: 'low',
    dueDate: today.add(12, 'day').format('YYYY-MM-DD'),
    createdAt: today.subtract(3, 'day').valueOf(),
    updatedAt: today.subtract(1, 'day').valueOf(),
    tags: ['设备'],
  },
];

const initialData: AppData = {
  projects: sampleProjects,
  tasks: sampleTasks,
  filters: {
    search: '',
    status: 'all',
    statuses: [],
    priority: 'all',
    tags: [],
  },
  groupBy: 'project',
  sortRules: DEFAULT_SORT,
  savedFilters: [],
  columnConfig: defaultColumnConfig,
  dictionary: {
    onsiteOwners: ['Alex Zhang', 'Maria Wang', 'Elaine Zhao'],
    lineOwners: ['Lee Chen', 'Victor Liu', 'Nina Zhou'],
    tags: ['vendor', 'hardware', 'research', 'contract', 'legal'],
    autoAppend: true,
  },
  settings: defaultSettings,
  sortSchemes: [
    { id: nanoid(8), name: 'Default Sort', rules: DEFAULT_SORT },
  ],
  recurringTemplates: [],
  notes: [],
  tags: [
    { id: 'all', name: '全部', icon: '📌', count: 0, isSystem: true },
    { id: 'uncategorized', name: '未分类', icon: '📋', count: 0, isSystem: true },
    { id: 'work', name: '工作', icon: '💼', count: 0, isSystem: false },
    { id: 'life', name: '生活', icon: '🏠', count: 0, isSystem: false },
    { id: 'idea', name: '灵感', icon: '💡', count: 0, isSystem: false },
  ],
  noteTreeExpandedState: {},
  activeView: 'tasks',
  noteViewMode: 'tree',
  selectedNoteId: null,
};

const deepClone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

type Draft<T> = T extends (...args: any[]) => any ? never : T;

type DictionaryKey = 'onsiteOwners' | 'lineOwners' | 'tags';

const rebuildDictionary = (state: Draft<AppStore>) => {
  if (!state.dictionary.autoAppend) return;

  const onsite = new Set<string>();
  const line = new Set<string>();
  const tags = new Set<string>();

  // Keep initial defaults if needed, or start fresh. 
  // Current user request implies they want to remove ghosts, so starting fresh based on active tasks is better.
  // But we should preserve the initial sample data structure if it was empty? 
  // Let's just scan active tasks.

  // Get trash project ID
  const trashId = state.projects.find(p => p.name === '回收站')?.id;

  state.tasks.forEach(task => {
    if (task.projectId === trashId) return;

    // 扫描旧字段（兼容）
    if (task.onsiteOwner?.trim()) onsite.add(task.onsiteOwner.trim());
    if (task.lineOwner?.trim()) line.add(task.lineOwner.trim());

    // 扫描新的 owners 字段（以 / 分隔的责任人列表）
    if (task.owners?.trim()) {
      task.owners.split('/').forEach(name => {
        const trimmed = name.trim();
        if (trimmed) onsite.add(trimmed); // 统一添加到 onsite 集合
      });
    }

    (task.tags ?? []).forEach(t => {
      if (t.trim()) tags.add(t.trim());
    });
  });

  state.dictionary.onsiteOwners = Array.from(onsite).sort();
  state.dictionary.lineOwners = Array.from(line).sort();
  state.dictionary.tags = Array.from(tags).sort();
};

const registerFromTask = (state: Draft<AppStore>, _payload: Partial<Task>) => {
  // This function is now just a trigger for full rebuild to ensure consistency
  // Or we can keep it as an optimistic update, but rebuildDictionary is safer.
  rebuildDictionary(state);
};

export interface AppStore extends AppData {
  undoStack: AppDataSnapshot[];
  redoStack: AppDataSnapshot[];
  addProject: (name: string) => Project;
  renameProject: (id: string, name: string) => void;

  deleteProject: (id: string, options?: { deleteTasks?: boolean }) => void;
  setFilters: (filters: Partial<Filters>) => void;
  resetFilters: () => void;
  setGroupBy: (groupBy: GroupBy) => void;
  setSortRules: (rules: SortRule[]) => void;
  saveSortScheme: (scheme: { id?: string; name: string; rules: SortRule[] }) => void;
  deleteSortScheme: (id: string) => void;
  applySortScheme: (id: string) => void;
  addTask: (task: { projectId: string; title: string } & Partial<Task>) => Task;
  updateTask: (id: string, updates: Partial<Task>, batchId?: string) => void;
  deleteTask: (id: string) => void;
  updateSettings: (settings: Partial<Settings>) => void;

  moveToUncategorized: (id: string) => void;
  restoreTask: (id: string) => void;
  purgeTrash: () => void;
  emptyTrash: () => void;
  hardDeleteTask: (id: string) => void;
  togglePin: (id: string) => void;
  bulkUpdateTasks: (ids: string[], updates: Partial<Task>, batchId?: string) => void;
  bulkDeleteTasks: (ids: string[]) => void;
  addProgress: (
    id: string,
    entry: { note: string; at?: number; attachments?: Attachment[] },
  ) => void;
  deleteProgress: (id: string, entryId: string) => void;
  updateProgress: (id: string, entryId: string, patch: Partial<ProgressEntry>) => void;
  saveFilter: (payload: { id?: string; name: string }) => void;
  applySavedFilter: (id: string) => void;
  deleteSavedFilter: (id: string) => void;
  updateColumnConfig: (config: Partial<ColumnConfig>) => void;
  saveColumnTemplate: (template: { id?: string; name: string; columns: string[]; pinned: string[] }) => void;
  applyColumnTemplate: (id: string) => void;
  registerDictionaryEntries: (entries: Partial<Record<DictionaryKey, string | string[]>>) => void;
  setDictionaryAutoAppend: (enabled: boolean) => void;
  setSettings: (settings: Partial<Settings>) => void;
  importTasks: (tasks: (Partial<Task> & { projectId: string; title: string })[]) => void;
  undo: () => void;
  redo: () => void;
  ensureProjectByName: (name: string) => string;
  addRecurringTemplate: (tpl: Omit<RecurringTemplate, 'id'> & { id?: string }) => RecurringTemplate;
  updateRecurringTemplate: (id: string, patch: Partial<RecurringTemplate>) => void;
  deleteRecurringTemplate: (id: string) => void;
  materializeRecurringTasks: () => void;
  migrateLegacyRecurringTasks: () => void;
  // Note Actions
  addNote: (note: { title?: string; content: string; tags?: string[] }) => Note;
  updateNote: (id: string, updates: Partial<Note>) => void;
  deleteNote: (id: string) => void;
  toggleNotePin: (id: string) => void;

  // Note Tag Actions
  addNoteTag: (tag: Omit<NoteTag, 'id' | 'count'>) => NoteTag;
  updateNoteTag: (id: string, updates: Partial<NoteTag>) => void;
  deleteNoteTag: (id: string) => void;
  refreshNoteTagCounts: () => void;

  // Note UI Actions
  setNoteSearchText: (text: string) => void;
  setActiveNoteTag: (tagId: string | null) => void;
  toggleNoteTreeNode: (nodeId: string) => void;
  setNoteTreeNodeExpanded: (nodeId: string, expanded: boolean) => void;

  // AI Settings Actions
  addAIProvider: (provider: Omit<AIProviderProfile, 'id'>) => AIProviderProfile;
  updateAIProvider: (id: string, updates: Partial<AIProviderProfile>) => void;
  deleteAIProvider: (id: string) => void;
  setAIActiveProvider: (id: string | undefined) => void;
  updateAISettings: (settings: Partial<AISettings>) => void;

  // View Switching
  setActiveView: (view: 'tasks' | 'notes') => void;
  setNoteViewMode: (mode: 'tree' | 'trash') => void;
  setSelectedNoteId: (id: string | null) => void;

  // Note Trash Actions
  restoreNote: (id: string) => void;
  restoreNotes: (ids: string[]) => void;
  permanentDeleteNote: (id: string) => void;
  permanentDeleteNotes: (ids: string[]) => void;
  emptyNoteTrash: () => void;

  _hasHydrated: boolean;
  setHasHydrated: (state: boolean) => void;
}

const pickSnapshot = (state: Draft<AppStore>): AppDataSnapshot => ({
  projects: state.projects,
  tasks: state.tasks,
  filters: state.filters,
  groupBy: state.groupBy,
  sortRules: state.sortRules,
  savedFilters: state.savedFilters,
  columnConfig: state.columnConfig,
  dictionary: state.dictionary,
  settings: state.settings,
  sortSchemes: state.sortSchemes,
  recurringTemplates: state.recurringTemplates,
  notes: state.notes,
  tags: state.tags,
  // UI state is persisted in snapshot for undo/redo consistency
  noteSearchText: state.noteSearchText,
  noteTreeExpandedState: state.noteTreeExpandedState,
  activeView: state.activeView,
  selectedNoteId: state.selectedNoteId,
});

const withHistory = (set: any, updater: (state: Draft<AppStore>) => void) => {
  set(
    produce((state: AppStore) => {
      const draft = state as Draft<AppStore>;
      const snapshot = deepClone(pickSnapshot(draft));
      draft.undoStack.push(snapshot);
      const depth = draft.settings.undoDepth ?? 10;
      if (draft.undoStack.length > depth) {
        draft.undoStack.shift();
      }
      draft.redoStack = [];
      updater(draft);
    }),
    false,
  );
};

// noopStorage removed


export const useAppStore = create<AppStore>()(
  persist(
    (set, get) => ({
      ...initialData,
      undoStack: [],
      redoStack: [],
      _hasHydrated: false,
      addProject: (name) => {
        const trimmed = name.trim();
        if (!trimmed) {
          throw new Error('Project name cannot be empty');
        }
        let existing = get().projects.find((p) => p.name === trimmed);
        if (existing) {
          return existing;
        }
        const project = makeProject(trimmed);
        withHistory(set, (state) => {
          state.projects.push(project);
        });
        return project;
      },
      renameProject: (id, name) => {
        withHistory(set, (state) => {
          const project = state.projects.find((p) => p.id === id);
          if (project) {
            project.name = name.trim() || project.name;
            project.updatedAt = Date.now();
          }
        });
      },

      deleteProject: (id, options) => {
        const { deleteTasks = false } = options ?? {};
        withHistory(set, (state) => {
          state.projects = state.projects.filter((p) => p.id !== id);
          if (deleteTasks) {
            // 将任务移到回收站（软删除）
            let trashId = state.projects.find((p) => p.name === '回收站')?.id;
            if (!trashId) {
              // 如果回收站不存在，创建它
              const newProject = {
                id: nanoid(),
                name: '回收站',
                createdAt: Date.now(),
                updatedAt: Date.now(),
              };
              state.projects.push(newProject);
              trashId = newProject.id;
            }
            const now = Date.now();
            state.tasks = state.tasks.map((t) => {
              if (t.projectId === id) {
                return {
                  ...t,
                  projectId: trashId!,
                  updatedAt: now,
                  extras: {
                    ...t.extras,
                    trashedAt: String(now),
                    trashedFrom: id,
                  },
                };
              }
              return t;
            });
          } else {
            // 将任务移到"未分类"项目
            let unassignedId = state.projects.find((p) => p.name === '未分类')?.id;
            if (!unassignedId) {
              // 如果"未分类"项目不存在，创建它
              const newProject = {
                id: nanoid(),
                name: '未分类',
                createdAt: Date.now(),
                updatedAt: Date.now(),
              };
              state.projects.push(newProject);
              unassignedId = newProject.id;
            }
            state.tasks = state.tasks.map((t) =>
              t.projectId === id ? { ...t, projectId: unassignedId!, updatedAt: Date.now() } : t
            );
          }
        });
      },
      setFilters: (filters) => {
        set(
          produce((state: Draft<AppStore>) => {
            state.filters = { ...state.filters, ...filters };
          }),
          false,
        );
      },
      resetFilters: () => {
        set(
          produce((state: Draft<AppStore>) => {
            state.filters = deepClone(initialData.filters);
          }),
          false,
        );
      },
      setGroupBy: (groupBy) => {
        set(
          produce((state: Draft<AppStore>) => {
            state.groupBy = groupBy;
          }),
          false,
        );
      },
      setSortRules: (rules) => {
        set(
          produce((state: Draft<AppStore>) => {
            state.sortRules = rules.length ? rules : DEFAULT_SORT;
          }),
          false,
        );
      },
      saveSortScheme: ({ id, name, rules }) => {
        const trimmed = name.trim();
        if (!trimmed) {
          throw new Error('Scheme name cannot be empty');
        }
        withHistory(set, (state) => {
          if (id) {
            const target = state.sortSchemes.find((s) => s.id === id);
            if (target) {
              target.name = trimmed;
              target.rules = rules;
              return;
            }
          }
          state.sortSchemes.push({ id: nanoid(8), name: trimmed, rules });
        });
      },
      deleteSortScheme: (id) => {
        withHistory(set, (state) => {
          state.sortSchemes = state.sortSchemes.filter((s) => s.id !== id);
        });
      },
      applySortScheme: (id) => {
        const scheme = get().sortSchemes.find((s) => s.id === id);
        if (scheme) {
          set(
            produce((state: Draft<AppStore>) => {
              state.sortRules = scheme.rules;
            }),
            false,
          );
        }
      },
      addTask: (taskInput) => {
        const { projectId, title, ...rest } = taskInput;
        if (!projectId) {
          throw new Error('Task must belong to a project');
        }
        const newTask: Task = {
          id: nanoid(12),
          projectId,
          title: title.trim(),
          status: (rest.status as any) ?? 'doing',
          priority: rest.priority ?? 'medium',
          dueDate: rest.dueDate,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          onsiteOwner: rest.onsiteOwner,
          lineOwner: rest.lineOwner,
          nextStep: rest.nextStep,
          tags: rest.tags ?? [],
          notes: rest.notes,
          dependencies: rest.dependencies ?? [],
          attachments: rest.attachments ?? [],
          history: [],
          progress: [],
          subtasks: rest.subtasks ?? [],
          extras: (rest as any).extras ?? {},
        };
        withHistory(set, (state) => {
          state.tasks.push(newTask);
          registerFromTask(state, newTask);
        });
        return newTask;
      },
      updateTask: (id, updates) => {
        withHistory(set, (state) => {
          const task = state.tasks.find((t) => t.id === id);
          if (!task) return;
          const prevStatus = task.status as any;
          Object.assign(task, updates);
          task.updatedAt = Date.now();
          registerFromTask(state, task);
          const recurringRaw = (task.extras?.recurring ?? '') as string;
          let recurring: { type: 'daily' | 'weekly' | 'monthly'; dueWeekday?: number; dueDom?: number; day?: number; dueStrategy?: 'sameDay' | 'endOfWeek' | 'endOfMonth' | 'none'; autoRenew?: boolean } | null = null;
          try { recurring = recurringRaw ? JSON.parse(recurringRaw) : null; } catch { recurring = null; }
          if (recurring?.autoRenew && prevStatus !== 'done' && (updates.status as any) === 'done') {
            const now = dayjs();
            let due = '';
            let visibleFrom = '';

            if (recurring.type === 'daily') {
              // 每日任务：下一天的截止日期
              due = now.add(1, 'day').format('YYYY-MM-DD');
              visibleFrom = due; // 到明天才显示
            } else if (recurring.type === 'weekly') {
              const nextWeekStart = now.add(1, 'week').subtract((now.day() + 6) % 7, 'day');
              const d = (recurring.dueWeekday ?? recurring.day ?? 5);
              due = nextWeekStart.add(((d + 7) % 7), 'day').format('YYYY-MM-DD');
              visibleFrom = nextWeekStart.format('YYYY-MM-DD'); // 下周一开始显示
            } else if (recurring.type === 'monthly') {
              const nextMonthStart = now.startOf('month').add(1, 'month');
              const endOfNextMonth = nextMonthStart.endOf('month');
              const dom = Math.max(1, Math.min(31, (recurring.dueDom ?? recurring.day ?? 15)));
              due = nextMonthStart.date(Math.min(dom, endOfNextMonth.date())).format('YYYY-MM-DD');
              visibleFrom = nextMonthStart.format('YYYY-MM-DD'); // 下个月1号开始显示
            }

            if (due) {
              const newTask: Task = {
                id: nanoid(12),
                projectId: task.projectId,
                title: task.title,
                status: 'doing' as any,
                priority: task.priority,
                dueDate: due,
                createdAt: Date.now(),
                updatedAt: Date.now(),
                onsiteOwner: task.onsiteOwner,
                lineOwner: task.lineOwner,
                owners: task.owners,
                nextStep: task.nextStep,
                tags: task.tags ?? [],
                notes: task.notes,
                attachments: [],
                dependencies: [],
                history: [],
                progress: [],
                subtasks: task.subtasks?.map(st => ({ ...st, id: nanoid(8), createdAt: Date.now(), completed: false })) ?? [],
                extras: { recurring: recurringRaw, visibleFrom },
              };
              state.tasks.push(newTask);
            }
          }
        });
      },
      deleteTask: (id) => {
        withHistory(set, (state) => {
          const task = state.tasks.find((t) => t.id === id);
          if (!task) return;

          let trashId = state.projects.find((p) => p.name === '回收站')?.id;
          if (!trashId) {
            const newProject = {
              id: nanoid(),
              name: '回收站',
              createdAt: Date.now(),
              updatedAt: Date.now(),
            };
            state.projects.push(newProject);
            trashId = newProject.id;
          }

          const from = task.projectId;
          task.projectId = trashId;
          task.updatedAt = Date.now();
          const extras = { ...(task.extras ?? {}) } as Record<string, string>;
          extras.trashedAt = String(Date.now());
          extras.trashedFrom = from;
          task.extras = extras;
          rebuildDictionary(state);
        });
      },
      updateSettings: (newSettings) => {
        set(produce((state: AppStore) => {
          state.settings = { ...state.settings, ...newSettings };
        }));
      },

      moveToUncategorized: (id) => {
        withHistory(set, (state) => {
          const task = state.tasks.find((t) => t.id === id);
          if (!task) return;

          let unassignedId = state.projects.find((p) => p.name === '未分类')?.id;
          if (!unassignedId) {
            const newProject = {
              id: nanoid(),
              name: '未分类',
              createdAt: Date.now(),
              updatedAt: Date.now(),
            };
            state.projects.push(newProject);
            unassignedId = newProject.id;
          }

          task.projectId = unassignedId;
          task.updatedAt = Date.now();
          rebuildDictionary(state);
        });
      },
      hardDeleteTask: (id) => {
        withHistory(set, (state) => {
          state.tasks = state.tasks.filter((t) => t.id !== id);
          rebuildDictionary(state);
        });
      },
      togglePin: (id) => {
        withHistory(set, (state) => {
          const task = state.tasks.find((t) => t.id === id);
          if (task) {
            task.isPinned = !task.isPinned;
            task.updatedAt = Date.now();
          }
        });
      },
      restoreTask: (id) => {
        withHistory(set, (state) => {
          const task = state.tasks.find((t) => t.id === id);
          if (!task) return;
          const from = task.extras?.trashedFrom;
          if (from) {
            // 检查原项目是否还存在
            const originalProject = state.projects.find((p) => p.id === from);
            if (originalProject) {
              // 原项目存在，正常恢复
              task.projectId = from;
            } else {
              // 原项目已被删除，移到"未分类"项目
              let unassignedId = state.projects.find((p) => p.name === '未分类')?.id;
              if (!unassignedId) {
                // 如果"未分类"项目不存在，创建它
                const newProject = {
                  id: nanoid(),
                  name: '未分类',
                  createdAt: Date.now(),
                  updatedAt: Date.now(),
                };
                state.projects.push(newProject);
                unassignedId = newProject.id;
              }
              task.projectId = unassignedId;
              // 在标题前添加标记
              if (!task.title.startsWith('[原项目已被删除]')) {
                task.title = `[原项目已被删除] ${task.title}`;
              }
            }
            const { trashedAt, trashedFrom, ...rest } = task.extras ?? {};
            task.extras = rest;
            task.updatedAt = Date.now();
            rebuildDictionary(state);
          }
        });
      },
      purgeTrash: () => {
        withHistory(set, (state) => {
          const trashId = state.projects.find((p) => p.name === '回收站')?.id;
          const days = state.settings.trashRetentionDays ?? 60;
          const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
          if (!trashId) return;
          state.tasks = state.tasks.filter((t) => {
            if (t.projectId !== trashId) return true;
            const trashedAt = Number(t.extras?.trashedAt ?? '0');
            return trashedAt > cutoff;
          });
          rebuildDictionary(state);
        });
      },
      emptyTrash: () => {
        withHistory(set, (state) => {
          const trashId = state.projects.find((p) => p.name === '回收站')?.id;
          if (!trashId) return;
          state.tasks = state.tasks.filter((t) => t.projectId !== trashId);
          rebuildDictionary(state);
        });
      },
      bulkUpdateTasks: (ids, updates) => {
        withHistory(set, (state) => {
          state.tasks = state.tasks.map((task) =>
            ids.includes(task.id)
              ? (() => {
                const updated = { ...task, ...updates, updatedAt: Date.now() };
                registerFromTask(state, updated);
                return updated;
              })()
              : task,
          );
        });
      },
      bulkDeleteTasks: (ids) => {
        withHistory(set, (state) => {
          const trashId = state.projects.find((p) => p.name === '回收站')?.id ?? (() => {
            const newProject = {
              id: nanoid(),
              name: '回收站',
              createdAt: Date.now(),
              updatedAt: Date.now(),
            };
            state.projects.push(newProject);
            return newProject.id;
          })();
          const now = Date.now();
          state.tasks = state.tasks.map((task) => {
            if (ids.includes(task.id)) {
              const from = task.projectId;
              return {
                ...task,
                projectId: trashId,
                updatedAt: now,
                extras: {
                  ...task.extras,
                  trashedAt: String(now),
                  trashedFrom: from,
                },
              };
            }
            return task;
          });
          rebuildDictionary(state);
        });
      },
      addProgress: (id, entry) => {
        withHistory(set, (state) => {
          const task = state.tasks.find((t) => t.id === id);
          if (!task) return;
          const at = entry.at ?? Date.now();
          const newEntry = {
            id: nanoid(10),
            at,
            note: entry.note.trim(),
            attachments: entry.attachments ?? [],
          };
          task.progress = [...(task.progress ?? []), newEntry];
          task.updatedAt = Date.now();
        });
      },
      deleteProgress: (id, entryId) => {
        withHistory(set, (state) => {
          const task = state.tasks.find((t) => t.id === id);
          if (!task || !task.progress?.length) return;
          task.progress = task.progress.filter((e) => e.id !== entryId);
          task.updatedAt = Date.now();
        });
      },
      updateProgress: (id, entryId, patch) => {
        withHistory(set, (state) => {
          const task = state.tasks.find((t) => t.id === id);
          if (!task || !task.progress?.length) return;
          task.progress = task.progress.map((e) =>
            e.id === entryId
              ? {
                ...e,
                ...(patch.at !== undefined ? { at: patch.at } : {}),
                ...(patch.status !== undefined ? { status: patch.status } : {}),
                ...(patch.note !== undefined ? { note: patch.note } : {}),
                ...(patch.attachments !== undefined ? { attachments: patch.attachments } : {}),
              }
              : e,
          );
          task.updatedAt = Date.now();
        });
      },
      saveFilter: ({ id, name }) => {
        const trimmed = name.trim();
        if (!trimmed) {
          throw new Error('View name cannot be empty');
        }
        const payload: SavedFilter = {
          id: id ?? nanoid(10),
          name: trimmed,
          filters: deepClone(get().filters),
          sort: deepClone(get().sortRules),
          groupBy: get().groupBy,
        };
        withHistory(set, (state) => {
          const idx = state.savedFilters.findIndex((f) => f.id === payload.id);
          if (idx >= 0) {
            state.savedFilters[idx] = payload;
          } else {
            if (state.savedFilters.length >= 50) {
              throw new Error('Cannot store more than 50 saved views');
            }
            state.savedFilters.push(payload);
          }
        });
      },
      applySavedFilter: (id) => {
        const filter = get().savedFilters.find((f) => f.id === id);
        if (filter) {
          set(
            produce((state: Draft<AppStore>) => {
              state.filters = deepClone(filter.filters);
              if (filter.sort) {
                state.sortRules = filter.sort;
              }
              state.groupBy = filter.groupBy ?? state.groupBy;
            }),
            false,
          );
        }
      },
      deleteSavedFilter: (id) => {
        withHistory(set, (state) => {
          state.savedFilters = state.savedFilters.filter((f) => f.id !== id);
        });
      },
      updateColumnConfig: (config) => {
        withHistory(set, (state) => {
          state.columnConfig = {
            ...state.columnConfig,
            ...config,
          };
          // ensure pinned subset of columns
          state.columnConfig.pinned = state.columnConfig.pinned.filter((col) =>
            state.columnConfig.columns.includes(col),
          );
        });
      },
      saveColumnTemplate: ({ id, name, columns, pinned }) => {
        const trimmed = name.trim();
        if (!trimmed) {
          throw new Error('Template name cannot be empty');
        }
        withHistory(set, (state) => {
          const template: ColumnTemplate = {
            id: id ?? nanoid(8),
            name: trimmed,
            columns,
            pinned,
          };
          if (id) {
            state.columnConfig.templates = state.columnConfig.templates.map((t) =>
              t.id === id ? template : t,
            );
          } else {
            if (state.columnConfig.templates.length >= 10) {
              throw new Error('Cannot store more than 10 column templates');
            }
            state.columnConfig.templates.push(template);
          }
        });
      },
      applyColumnTemplate: (id) => {
        withHistory(set, (state) => {
          const template = state.columnConfig.templates.find((t) => t.id === id);
          if (template) {
            state.columnConfig.columns = [...template.columns];
            state.columnConfig.pinned = [...template.pinned];
          }
        });
      },
      registerDictionaryEntries: (entries) => {
        withHistory(set, (state) => {
          (Object.entries(entries) as [DictionaryKey, string | string[]][]).forEach(
            ([key, value]) => {
              if (!value) {
                return;
              }
              const arr = Array.isArray(value) ? value : [value];
              const target = state.dictionary[key];
              arr.forEach((item) => {
                const trimmed = item.trim();
                if (trimmed && !target.includes(trimmed)) {
                  target.push(trimmed);
                }
              });
            },
          );
        });
      },
      setDictionaryAutoAppend: (enabled) => {
        set(
          produce((state: Draft<AppStore>) => {
            state.dictionary.autoAppend = enabled;
          }),
          false,
        );
      },
      setSettings: (settings) => {
        set(
          produce((state: Draft<AppStore>) => {
            state.settings = { ...state.settings, ...settings };
          }),
          false,
        );
        // run purge when retention changes
        if (settings.trashRetentionDays !== undefined) {
          get().purgeTrash();
        }
      },
      importTasks: (tasks) => {
        withHistory(set, (state) => {
          tasks.forEach((incoming) => {
            const normalized: Task = {
              id: nanoid(12),
              projectId: incoming.projectId,
              title: incoming.title.trim(),
              status: (incoming.status as any) ?? 'doing',
              priority: incoming.priority ?? 'medium',
              dueDate: incoming.dueDate,
              createdAt: incoming.createdAt ?? Date.now(),
              updatedAt: Date.now(),
              onsiteOwner: incoming.onsiteOwner,
              lineOwner: incoming.lineOwner,
              nextStep: incoming.nextStep,
              tags: incoming.tags ?? [],
              notes: incoming.notes,
              attachments: incoming.attachments ?? [],
              dependencies: incoming.dependencies ?? [],
              history: incoming.history ?? [],
              extras: (incoming as any).extras ?? {},
            };
            state.tasks.push(normalized);
            registerFromTask(state, normalized);
          });
        });
      },
      undo: () => {
        const { undoStack } = get();
        if (!undoStack.length) {
          return;
        }
        const snapshot = undoStack[undoStack.length - 1];
        set(
          produce((state: Draft<AppStore>) => {
            state.undoStack.pop();
            state.redoStack.push(pickSnapshot(state));
            Object.assign(state, deepClone(snapshot));
          }),
          false,
        );
      },
      redo: () => {
        const { redoStack } = get();
        if (!redoStack.length) {
          return;
        }
        const snapshot = redoStack[redoStack.length - 1];
        set(
          produce((state: Draft<AppStore>) => {
            state.redoStack.pop();
            state.undoStack.push(pickSnapshot(state));
            Object.assign(state, deepClone(snapshot));
          }),
          false,
        );
      },
      ensureProjectByName: (name: string) => {
        const trimmed = name.trim();
        const existing = get().projects.find((p) => p.name === trimmed);
        if (existing) {
          return existing.id;
        }
        return get().addProject(trimmed).id;
      },
      addRecurringTemplate: (tpl) => {
        const payload: RecurringTemplate = { id: tpl.id ?? nanoid(10), ...tpl, active: tpl.active ?? true } as RecurringTemplate;
        withHistory(set, (state) => {
          state.recurringTemplates.push(payload);
        });
        return payload;
      },
      updateRecurringTemplate: (id, patch) => {
        withHistory(set, (state) => {
          state.recurringTemplates = state.recurringTemplates.map((t) => (t.id === id ? { ...t, ...patch } : t));
        });
      },
      deleteRecurringTemplate: (id) => {
        withHistory(set, (state) => {
          state.recurringTemplates = state.recurringTemplates.filter((t) => t.id !== id);
        });
      },
      materializeRecurringTasks: () => {
        const now = dayjs();
        const startOfWeek = now.subtract((now.day() + 6) % 7, 'day');
        const endOfWeek = startOfWeek.add(6, 'day');
        const startOfMonth = now.startOf('month');
        const endOfMonth = now.endOf('month');
        const periodKeyWeek = startOfWeek.format('YYYY-MM-DD');
        const periodKeyMonth = startOfMonth.format('YYYY-MM');
        withHistory(set, (state) => {
          state.recurringTemplates.filter((t) => t.active).forEach((tpl) => {
            const isWeekly = tpl.schedule.type === 'weekly';
            const interval = Math.max(tpl.schedule.interval ?? 1, 1);
            const anchorDate = tpl.schedule.anchorDate ? dayjs(tpl.schedule.anchorDate) : null;
            const anchorStart =
              anchorDate && anchorDate.isValid()
                ? isWeekly
                  ? anchorDate.subtract((anchorDate.day() + 6) % 7, 'day')
                  : anchorDate.startOf('month')
                : null;
            if (interval > 1 && anchorStart) {
              const diff = (isWeekly ? startOfWeek : startOfMonth).diff(
                anchorStart,
                isWeekly ? 'week' : 'month',
              );
              if (diff < 0 || diff % interval !== 0) {
                return;
              }
            }
            const dates: string[] = [];
            if (isWeekly) {
              if (tpl.schedule.flexible) {
                dates.push(startOfWeek.format('YYYY-MM-DD'));
              } else {
                (tpl.schedule.daysOfWeek ?? []).forEach((d) => {
                  const date = startOfWeek.add(((d + 7) % 7), 'day').format('YYYY-MM-DD');
                  dates.push(date);
                });
              }
            } else {
              if (tpl.schedule.flexible) {
                dates.push(startOfMonth.format('YYYY-MM-01'));
              } else {
                const dom = tpl.schedule.dayOfMonth ?? 1;
                const target = startOfMonth.date(Math.min(dom, endOfMonth.date()));
                dates.push(target.format('YYYY-MM-DD'));
              }
            }
            dates.forEach((dateStr) => {
              const periodKey = isWeekly ? periodKeyWeek : periodKeyMonth;
              const exists = state.tasks.some((task) => (task.extras?.recurrenceId === tpl.id && task.extras?.periodKey === periodKey));
              if (exists) return;
              const due = (() => {
                if (tpl.dueStrategy === 'none') return undefined;
                if (tpl.dueStrategy === 'sameDay') return dateStr;
                if (tpl.dueStrategy === 'endOfWeek') return endOfWeek.format('YYYY-MM-DD');
                if (tpl.dueStrategy === 'endOfMonth') return endOfMonth.format('YYYY-MM-DD');
                return undefined;
              })();
              const newTask: Task = {
                id: nanoid(12),
                projectId: tpl.projectId,
                title: tpl.title,
                status: tpl.status,
                priority: tpl.priority ?? 'medium',
                dueDate: due,
                createdAt: Date.now(),
                updatedAt: Date.now(),
                owners: tpl.owners,
                nextStep: tpl.defaults?.nextStep,
                tags: tpl.defaults?.tags ?? [],
                notes: tpl.defaults?.notes,
                extras: { recurrenceId: tpl.id, periodKey },
                subtasks: tpl.subtasks?.map(st => ({ ...st, id: nanoid(8), createdAt: Date.now(), completed: false })) ?? [],
              };
              state.tasks.push(newTask);
              registerFromTask(state, newTask);
            });
          });
        });
      },
      migrateLegacyRecurringTasks: () => {
        withHistory(set, (state) => {
          // 找到所有有 recurring 但没有 recurrenceId 的任务
          const legacyTasks = state.tasks.filter(t => t.extras?.recurring && !t.extras?.recurrenceId);
          if (legacyTasks.length === 0) return;

          // 用于去重：key -> templateId
          const createdTemplates = new Map<string, string>();

          legacyTasks.forEach(task => {
            try {
              const recurring = JSON.parse(task.extras!.recurring!);
              // 生成去重 key: projectId + title + schedule type + schedule details
              const distinctKey = `${task.projectId}|${task.title}|${recurring.type}|${JSON.stringify(recurring)}`;

              let templateId = createdTemplates.get(distinctKey);

              // 如果没有对应的模板，创建一个
              if (!templateId) {
                // 检查现有的模板库里是否已经有一样的（避免多次迁移导致重复）
                const existingTpl = state.recurringTemplates.find(t =>
                  t.projectId === task.projectId &&
                  t.title === task.title &&
                  t.schedule.type === recurring.type &&
                  // 简单的比较，实际可能需要更细致
                  JSON.stringify(t.schedule.daysOfWeek ?? []) === JSON.stringify(recurring.dueWeekday ? [recurring.dueWeekday] : [1])
                );

                if (existingTpl) {
                  templateId = existingTpl.id;
                } else {
                  templateId = nanoid(12);
                  const newTemplate: RecurringTemplate = {
                    id: templateId,
                    projectId: task.projectId,
                    title: task.title,
                    status: 'doing', // 默认为 conducting
                    priority: task.priority,
                    owners: task.owners,
                    schedule: {
                      type: recurring.type,
                      daysOfWeek: recurring.type === 'weekly' ? [recurring.dueWeekday ?? 1] : undefined,
                      dayOfMonth: recurring.type === 'monthly' ? recurring.dueDom ?? 1 : undefined,
                    },
                    defaults: {
                      notes: task.notes,
                      nextStep: task.nextStep,
                    },
                    active: true, // 默认迁移后激活
                    dueStrategy: 'sameDay',
                  };
                  state.recurringTemplates.push(newTemplate);
                }
                createdTemplates.set(distinctKey, templateId);
              }

              // 更新任务，关联到模板
              task.extras!.recurrenceId = templateId;

              // 推算 periodKey (尽量模拟，即使不准确也比没有好)
              const dueDate = dayjs(task.dueDate || task.createdAt);
              if (recurring.type === 'weekly') {
                const startOfWeek = dueDate.subtract((dueDate.day() + 6) % 7, 'day');
                task.extras!.periodKey = startOfWeek.format('YYYY-MM-DD');
              } else {
                task.extras!.periodKey = dueDate.format('YYYY-MM');
              }

            } catch (e) {
              console.warn('Failed to migrate task', task.id, e);
            }
          });
        });
      },
      restoreData: (backupData: AppData) => {
        set((state) => ({
          ...state,
          ...backupData,
          tags: backupData.tags || state.tags,
          noteSearchText: '',
          activeNoteTagId: 'all',
          noteTreeExpandedState: {},
        }));
      },

      // ==================== Note CRUD ====================
      addNote: (noteInput: { title?: string; content: string; tags?: string[] }) => {
        const now = Date.now();
        const newNote: Note = {
          id: nanoid(12),
          title: noteInput.title?.trim() || '',
          content: noteInput.content,
          tags: noteInput.tags || [],
          createdAt: now,
          updatedAt: now,
          isPinned: false,
        };

        set(produce((state: AppStore) => {
          state.notes.unshift(newNote);
        }));
        get().refreshNoteTagCounts();
        return newNote;
      },

      updateNote: (id: string, updates: Partial<Note>) => {
        set(produce((state: AppStore) => {
          const note = state.notes.find(n => n.id === id);
          if (!note) return;
          Object.assign(note, updates);
          note.updatedAt = Date.now();
        }));
        get().refreshNoteTagCounts();
      },

      deleteNote: (id: string) => {
        set(produce((state: AppStore) => {
          const note = state.notes.find(n => n.id === id);
          if (note) {
            note.deletedAt = Date.now();
            note.updatedAt = Date.now();
          }
          if (state.selectedNoteId === id) {
            state.selectedNoteId = null;
          }
        }));
        get().refreshNoteTagCounts();
      },

      toggleNotePin: (id: string) => {
        set(produce((state: AppStore) => {
          const note = state.notes.find(n => n.id === id);
          if (note) {
            note.isPinned = !note.isPinned;
            note.updatedAt = Date.now();
          }
        }));
      },

      // ==================== Note Tag Actions ====================
      addNoteTag: (tagInput: Omit<NoteTag, 'id' | 'count'>) => {
        const newTag: NoteTag = {
          id: nanoid(10),
          ...tagInput,
          count: 0,
        };
        set(produce((state: AppStore) => {
          state.tags.push(newTag);
        }));
        return newTag;
      },

      updateNoteTag: (id: string, updates: Partial<NoteTag>) => {
        set(produce((state: AppStore) => {
          const tag = state.tags.find(t => t.id === id);
          if (tag && !tag.isSystem) {
            Object.assign(tag, updates);
          }
        }));
      },

      deleteNoteTag: (id: string) => {
        set(produce((state: AppStore) => {
          const tag = state.tags.find(t => t.id === id);
          if (tag && !tag.isSystem) {
            state.notes.forEach(note => {
              if (note.tags) {
                note.tags = note.tags.filter(t => t !== tag.name);
              }
            });
            state.tags = state.tags.filter(t => t.id !== id);
            if (state.activeNoteTagId === id) {
              state.activeNoteTagId = 'all';
            }
          }
        }));
      },

      refreshNoteTagCounts: () => {
        set(produce((state: AppStore) => {
          // 确保系统标签存在（迁移逻辑）
          const systemTags = [
            { id: 'all', name: '全部', icon: '📌', isSystem: true },
            { id: 'uncategorized', name: '未分类', icon: '📋', isSystem: true },
          ];
          systemTags.forEach(sysTag => {
            if (!state.tags.find(t => t.id === sysTag.id)) {
              // 在 'all' 后面插入，或者在开头插入
              const allIndex = state.tags.findIndex(t => t.id === 'all');
              if (sysTag.id === 'uncategorized' && allIndex >= 0) {
                state.tags.splice(allIndex + 1, 0, { ...sysTag, count: 0 });
              } else {
                state.tags.unshift({ ...sysTag, count: 0 });
              }
            }
          });

          // 刷新标签计数
          state.tags.forEach(tag => {
            if (tag.id === 'all') {
              tag.count = state.notes.length;
            } else if (tag.id === 'uncategorized') {
              // 未分类：没有任何标签的笔记数量
              tag.count = state.notes.filter(n => !n.tags || n.tags.length === 0).length;
            } else {
              tag.count = state.notes.filter(n =>
                n.tags?.includes(tag.name)
              ).length;
            }
          });
        }));
      },

      // ==================== Note UI Actions ====================
      setNoteSearchText: (text: string) => set({ noteSearchText: text }),
      setActiveNoteTag: (tagId: string | null) => set({ activeNoteTagId: tagId }),
      toggleNoteTreeNode: (nodeId: string) => {
        set(produce((state: AppStore) => {
          if (!state.noteTreeExpandedState) state.noteTreeExpandedState = {};
          state.noteTreeExpandedState[nodeId] = !state.noteTreeExpandedState[nodeId];
        }));
      },
      setNoteTreeNodeExpanded: (nodeId: string, expanded: boolean) => {
        set(produce((state: AppStore) => {
          if (!state.noteTreeExpandedState) state.noteTreeExpandedState = {};
          state.noteTreeExpandedState[nodeId] = expanded;
        }));
      },

      // ==================== AI Settings Actions ====================
      addAIProvider: (providerInput: Omit<AIProviderProfile, 'id'>) => {
        const newProvider: AIProviderProfile = {
          id: nanoid(10),
          ...providerInput,
        };
        set(produce((state: AppStore) => {
          if (!state.settings.ai) {
            state.settings.ai = { providers: [], activeProviderId: undefined };
          }
          state.settings.ai.providers.push(newProvider);
          if (state.settings.ai.providers.length === 1) {
            state.settings.ai.activeProviderId = newProvider.id;
          }
        }));
        return newProvider;
      },

      updateAIProvider: (id: string, updates: Partial<AIProviderProfile>) => {
        set(produce((state: AppStore) => {
          const provider = state.settings.ai?.providers.find(p => p.id === id);
          if (provider) {
            Object.assign(provider, updates);
          }
        }));
      },

      deleteAIProvider: (id: string) => {
        set(produce((state: AppStore) => {
          if (!state.settings.ai) return;
          state.settings.ai.providers = state.settings.ai.providers.filter(p => p.id !== id);
          if (state.settings.ai.activeProviderId === id) {
            state.settings.ai.activeProviderId = state.settings.ai.providers[0]?.id;
          }
        }));
      },

      setAIActiveProvider: (id: string | undefined) => {
        set(produce((state: AppStore) => {
          if (state.settings.ai) {
            state.settings.ai.activeProviderId = id;
          }
        }));
      },

      updateAISettings: (settings: Partial<AISettings>) => {
        set(produce((state: AppStore) => {
          if (!state.settings.ai) {
            state.settings.ai = { providers: [], activeProviderId: undefined };
          }
          Object.assign(state.settings.ai, settings);
        }));
      },

      setActiveView: (view) => set({ activeView: view }),
      setNoteViewMode: (mode) => set({ noteViewMode: mode }),
      setSelectedNoteId: (id) => set({ selectedNoteId: id }),

      restoreNote: (id: string) => {
        set(produce((state: AppStore) => {
          const note = state.notes.find(n => n.id === id);
          if (note) {
            note.deletedAt = undefined;
            note.updatedAt = Date.now();
          }
        }));
        get().refreshNoteTagCounts();
      },

      restoreNotes: (ids: string[]) => {
        set(produce((state: AppStore) => {
          ids.forEach(id => {
            const note = state.notes.find(n => n.id === id);
            if (note) {
              note.deletedAt = undefined;
              note.updatedAt = Date.now();
            }
          });
        }));
        get().refreshNoteTagCounts();
      },

      permanentDeleteNote: (id: string) => {
        set(produce((state: AppStore) => {
          state.notes = state.notes.filter(n => n.id !== id);
          if (state.selectedNoteId === id) {
            state.selectedNoteId = null;
          }
        }));
        get().refreshNoteTagCounts();
      },

      permanentDeleteNotes: (ids: string[]) => {
        set(produce((state: AppStore) => {
          state.notes = state.notes.filter(n => !ids.includes(n.id));
          if (state.selectedNoteId && ids.includes(state.selectedNoteId)) {
            state.selectedNoteId = null;
          }
        }));
        get().refreshNoteTagCounts();
      },

      emptyNoteTrash: () => {
        set(produce((state: AppStore) => {
          state.notes = state.notes.filter(n => !n.deletedAt);
        }));
        get().refreshNoteTagCounts();
      },

      setHasHydrated: (val) => {
        set({ _hasHydrated: val } as Partial<AppStore>);
      },
    }),
    {
      name: 'project-todo-app',
      version: 10,
      storage: createJSONStorage(() => {
        const portableStorage: StateStorage = {
          getItem: async (name: string): Promise<string | null> => {
            if (typeof window === 'undefined') return null;
            try {
              // 优先尝试读取本地文件 (Portable Mode)
              const data = await invoke<string>('load_data');
              if (data) return data;

              // 如果文件不存在，回退读取 localStorage (迁移旧数据)
              const local = window.localStorage.getItem(name);
              if (local) {
                // 自动迁移：读取到系统数据后，立即保存一份到本地文件，确保即时便携
                try {
                  await invoke('save_data', { data: local });
                } catch (e) {
                  console.warn('Failed to auto-migrate data to file', e);
                }
              }
              return local;
            } catch (e) {
              console.warn('Failed to load portable data, falling back to localStorage', e);
              return window.localStorage.getItem(name);
            }
          },
          setItem: async (name: string, value: string): Promise<void> => {
            if (typeof window === 'undefined') return;

            // 1. 写入本地文件 (Portable)
            try {
              await invoke('save_data', { data: value });
            } catch (e) {
              console.error('Failed to save portable data', e);
            }

            // 2. 写入系统 localStorage (Backup/Legacy)
            try {
              window.localStorage.setItem(name, value);
            } catch (e) {
              console.error('Failed to save local backup', e);
            }
          },
          removeItem: async (_name: string): Promise<void> => {
            // Not implemented for file storage
          },
        };
        return portableStorage;
      }),
      migrate: (persisted, version) => {
        const state = persisted as AppData;
        if (!state) return persisted;
        if (version < 2) {
          const cols = state.columnConfig?.columns ?? [];
          if (!cols.includes('notes')) {
            const idx = Math.max(cols.indexOf('priority'), 0);
            const next = [...cols];
            next.splice(idx + 1, 0, 'notes');
            state.columnConfig = {
              ...state.columnConfig,
              columns: next,
            } as ColumnConfig;
          }
        }
        if (version < 3) {
          const cols = state.columnConfig?.columns ?? [];
          if (!cols.includes('latestProgress')) {
            const idx = Math.max(cols.indexOf('notes'), 0);
            const next = [...cols];
            next.splice(idx + 1, 0, 'latestProgress');
            state.columnConfig = {
              ...state.columnConfig,
              columns: next,
            } as ColumnConfig;
          }
        }
        if (version < 4) {
          const cols = state.columnConfig?.columns ?? [];
          const next = cols.filter((c) => c !== 'nextStep' && c !== 'latestProgress');
          const insertAfter = next.indexOf('notes');
          if (insertAfter >= 0) {
            next.splice(insertAfter + 1, 0, 'latestProgress');
            next.splice(insertAfter + 2, 0, 'nextStep');
          } else {
            next.push('latestProgress');
            next.push('nextStep');
          }
          state.columnConfig = { ...state.columnConfig, columns: next } as ColumnConfig;
        }
        if (version < 5) {
          const cols = state.columnConfig?.columns ?? [];
          const filtered = cols.filter((c) => c !== 'tags');
          const pinned = (state.columnConfig?.pinned ?? []).filter((c) => c !== 'tags');
          state.columnConfig = { ...state.columnConfig, columns: filtered, pinned } as ColumnConfig;
        }
        if (version < 6) {
          state.tasks = state.tasks.map((t) => ({
            ...t,
            status: (t.status as any) === 'todo' ? ('paused' as any) : t.status,
          }));
          state.filters = {
            ...state.filters,
            status: (state.filters.status as any) === 'todo' ? ('paused' as any) : state.filters.status,
          };
          state.savedFilters = state.savedFilters.map((sf) => ({
            ...sf,
            filters: {
              ...sf.filters,
              status: (sf.filters.status as any) === 'todo' ? ('paused' as any) : sf.filters.status,
            },
          }));
        }
        if (version < 7) {
          const cols = state.columnConfig?.columns ?? [];
          const filtered = cols.filter((c) => c !== 'checklist');
          const pinned = (state.columnConfig?.pinned ?? []).filter((c) => c !== 'checklist');
          state.columnConfig = { ...state.columnConfig, columns: filtered, pinned } as ColumnConfig;
        }
        if (version < 8) {
          state.recurringTemplates = (state.recurringTemplates ?? []).map((tpl) => {
            const defaults = (tpl.defaults ?? {}) as Record<string, any>;
            const { onsiteOwner, lineOwner, ...restDefaults } = defaults;
            const cleanedEntries = Object.entries(restDefaults).filter(
              ([, value]) => value !== undefined && value !== null,
            );
            const cleanedDefaults = cleanedEntries.length
              ? (Object.fromEntries(cleanedEntries) as RecurringTemplate['defaults'])
              : undefined;
            return {
              ...tpl,
              owners: (tpl as any).owners ?? (tpl as any).onsiteOwner,
              defaults: cleanedDefaults,
              schedule: {
                ...tpl.schedule,
                interval: tpl.schedule.interval ?? 1,
                anchorDate: tpl.schedule.anchorDate ?? dayjs().format('YYYY-MM-DD'),
              },
            } as RecurringTemplate;
          });
        }
        if (version < 9) {
          const cols = state.columnConfig?.columns ?? [];
          const filtered = cols.filter((c) => c !== 'test');
          const pinned = (state.columnConfig?.pinned ?? []).filter((c) => c !== 'test');
          const labelsEntries = Object.entries(state.columnConfig?.labels ?? {}).filter(([k]) => k !== 'test');
          const labels = labelsEntries.length ? Object.fromEntries(labelsEntries) : undefined;
          const templates = (state.columnConfig?.templates ?? []).map((t) => ({
            ...t,
            columns: (t.columns ?? []).filter((c) => c !== 'test'),
            pinned: (t.pinned ?? []).filter((c) => c !== 'test'),
            labels: undefined,
          }));
          state.columnConfig = { ...state.columnConfig, columns: filtered, pinned, labels, templates } as ColumnConfig;
          state.tasks = (state.tasks ?? []).map((t) => {
            const extras = { ...(t.extras ?? {}) } as Record<string, string>;
            if ('test' in extras) {
              delete extras.test;
            }
            return { ...t, extras } as Task;
          });
        }
        if (version < 10) {
          // 强制更新排序规则以应用新的 DEFAULT_SORT (dueDate 优先)
          state.sortRules = DEFAULT_SORT;
        }
        return state as any;
      },
      partialize: (state) => ({
        projects: state.projects,
        tasks: state.tasks,
        filters: state.filters,
        groupBy: state.groupBy,
        sortRules: state.sortRules,
        savedFilters: state.savedFilters,
        columnConfig: state.columnConfig,
        dictionary: state.dictionary,
        settings: state.settings,
        sortSchemes: state.sortSchemes,
        recurringTemplates: state.recurringTemplates,
        notes: state.notes,
        tags: state.tags,
        activeNoteTagId: state.activeNoteTagId,
        noteTreeExpandedState: state.noteTreeExpandedState,
        activeView: state.activeView,
        selectedNoteId: state.selectedNoteId,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    },
  ),
);

export const useAppStoreShallow = <T>(selector: (state: AppStore) => T) =>
  useAppStore(useShallow(selector));

