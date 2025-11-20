import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { produce } from 'immer';
import dayjs from 'dayjs';
import { nanoid } from 'nanoid';
import { useShallow } from 'zustand/react/shallow';
import type {
  AppData,
  AppDataSnapshot,
  ColumnConfig,
  Filters,
  GroupBy,
  Project,
  SavedFilter,
  Settings,
  SortRule,
  Task,
  ColumnTemplate,
  RecurringTemplate,
} from '../types';
import type { Attachment, ProgressEntry } from '../types';

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
  { key: 'status', direction: 'asc' },
  { key: 'dueDate', direction: 'asc' },
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
  colorScheme: 'light',
  undoDepth: 10,
};

const makeProject = (name: string): Project => ({
  id: nanoid(10),
  name,
  archived: false,
  createdAt: Date.now(),
  updatedAt: Date.now(),
});

const sampleProjects = [
  makeProject('Equipment Refresh'),
  makeProject('Line Retrofit'),
  makeProject('Supplier Enablement'),
];

const today = dayjs();

const sampleTasks: Task[] = [
  {
    id: nanoid(12),
    projectId: sampleProjects[0].id,
    title: 'Submit go-live paperwork',
    status: 'doing',
    priority: 'high',
    dueDate: today.add(2, 'day').format('YYYY-MM-DD'),
    createdAt: today.subtract(8, 'day').valueOf(),
    updatedAt: today.valueOf(),
    onsiteOwner: 'Alex Zhang',
    lineOwner: 'Lee Chen',
    nextStep: 'Wait for customer signature',
    tags: ['vendor', 'hardware'],
    notes: 'Sync with legal after approval',
  },
  {
    id: nanoid(12),
    projectId: sampleProjects[1].id,
    title: 'Survey workstation layout',
    status: 'paused',
    priority: 'medium',
    dueDate: today.add(5, 'day').format('YYYY-MM-DD'),
    createdAt: today.subtract(2, 'day').valueOf(),
    updatedAt: today.subtract(1, 'day').valueOf(),
    onsiteOwner: 'Maria Wang',
    lineOwner: 'Lee Chen',
    nextStep: 'Book onsite review with production manager',
    tags: ['research'],
  },
  {
    id: nanoid(12),
    projectId: sampleProjects[2].id,
    title: 'Align contract clauses',
    status: 'doing',
    priority: 'high',
    dueDate: today.subtract(1, 'day').format('YYYY-MM-DD'),
    createdAt: today.subtract(10, 'day').valueOf(),
    updatedAt: today.subtract(1, 'day').valueOf(),
    onsiteOwner: 'Elaine Zhao',
    lineOwner: 'Victor Liu',
    nextStep: 'Add payment milestones',
    tags: ['contract', 'legal'],
  },
  {
    id: nanoid(12),
    projectId: sampleProjects[0].id,
    title: 'Inspect inbound equipment',
    status: 'paused',
    priority: 'medium',
    dueDate: today.add(10, 'day').format('YYYY-MM-DD'),
    createdAt: today.subtract(1, 'day').valueOf(),
    updatedAt: today.subtract(1, 'day').valueOf(),
    onsiteOwner: 'Alex Zhang',
    lineOwner: 'Nina Zhou',
    tags: ['hardware'],
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
};

const deepClone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

type Draft<T> = T extends (...args: any[]) => any ? never : T;

type DictionaryKey = 'onsiteOwners' | 'lineOwners' | 'tags';

const appendDictionaryValue = (arr: string[], value?: string) => {
  const trimmed = (value ?? '').trim();
  if (trimmed && !arr.includes(trimmed)) {
    arr.push(trimmed);
  }
};

const registerFromTask = (state: Draft<AppStore>, payload: Partial<Task>) => {
  if (!state.dictionary.autoAppend) {
    return;
  }
  appendDictionaryValue(state.dictionary.onsiteOwners, payload.onsiteOwner);
  appendDictionaryValue(state.dictionary.lineOwners, payload.lineOwner);
  (payload.tags ?? []).forEach((tag) => appendDictionaryValue(state.dictionary.tags, tag));
};

export interface AppStore extends AppData {
  undoStack: AppDataSnapshot[];
  redoStack: AppDataSnapshot[];
  addProject: (name: string) => Project;
  renameProject: (id: string, name: string) => void;
  toggleArchiveProject: (id: string) => void;
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
  bulkUpdateTasks: (ids: string[], updates: Partial<Task>, batchId?: string) => void;
  addProgress: (
    id: string,
    entry: { status: 'doing' | 'blocked' | 'done'; note: string; at?: number; attachments?: Attachment[] },
  ) => void;
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

const noopStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};

export const useAppStore = create<AppStore>()(
  persist(
    (set, get) => ({
      ...initialData,
      undoStack: [],
      redoStack: [],
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
      toggleArchiveProject: (id) => {
        withHistory(set, (state) => {
          const project = state.projects.find((p) => p.id === id);
          if (project) {
            project.archived = !project.archived;
            project.updatedAt = Date.now();
          }
        });
      },
      deleteProject: (id, options) => {
        const { deleteTasks = false } = options ?? {};
        withHistory(set, (state) => {
          state.projects = state.projects.filter((p) => p.id !== id);
          if (deleteTasks) {
            state.tasks = state.tasks.filter((t) => t.projectId !== id);
          } else {
            state.tasks = state.tasks.map((t) => (t.projectId === id ? { ...t, projectId: '' } : t));
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
          if (task) {
            Object.assign(task, updates);
            task.updatedAt = Date.now();
            registerFromTask(state, task);
          }
        });
      },
      deleteTask: (id) => {
        withHistory(set, (state) => {
          state.tasks = state.tasks.filter((t) => t.id !== id);
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
      addProgress: (id, entry) => {
        withHistory(set, (state) => {
          const task = state.tasks.find((t) => t.id === id);
          if (!task) return;
          const at = entry.at ?? Date.now();
          const newEntry = {
            id: nanoid(10),
            at,
            status: entry.status,
            note: entry.note.trim(),
            attachments: entry.attachments ?? [],
          };
          task.progress = [...(task.progress ?? []), newEntry];
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
                onsiteOwner: tpl.onsiteOwner,
                lineOwner: tpl.lineOwner,
                nextStep: tpl.defaults?.nextStep,
                tags: tpl.defaults?.tags ?? [],
                notes: tpl.defaults?.notes,
                extras: { recurrenceId: tpl.id, periodKey },
              };
              state.tasks.push(newTask);
              registerFromTask(state, newTask);
            });
          });
        });
      },
    }),
    {
      name: 'project-todo-app',
      version: 8,
      storage: createJSONStorage(() => {
        if (typeof window === 'undefined') {
          return noopStorage;
        }
        try {
          return window.localStorage;
        } catch {
          return noopStorage;
        }
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
              onsiteOwner: tpl.onsiteOwner ?? onsiteOwner,
              lineOwner: tpl.lineOwner ?? lineOwner,
              defaults: cleanedDefaults,
              schedule: {
                ...tpl.schedule,
                interval: tpl.schedule.interval ?? 1,
                anchorDate: tpl.schedule.anchorDate ?? dayjs().format('YYYY-MM-DD'),
              },
            } as RecurringTemplate;
          });
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
      }),
    },
  ),
);

export const useAppStoreShallow = <T>(selector: (state: AppStore) => T) =>
  useAppStore(useShallow(selector));

