import type { StateCreator } from 'zustand';
import { nanoid } from 'nanoid';
import { produce } from 'immer';
import type { Settings, ColumnConfig, RecurringTemplate } from '../../types';
import type { AppStore } from '../appStore';

// Core columns - can be re-enabled when needed
// const CORE_COLUMNS = [
//   'project',
//   'title',
//   'status',
//   'priority',
//   'dueDate',
//   'createdAt',
//   'onsiteOwner',
//   'lineOwner',
//   'nextStep',
// ];

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
  trashRetentionDays: 30,
};

type DictionaryKey = 'onsiteOwners' | 'lineOwners' | 'tags';

export interface SettingsSlice {
  settings: Settings;
  columnConfig: ColumnConfig;
  dictionary: {
    onsiteOwners: string[];
    lineOwners: string[];
    tags: string[];
    autoAppend: boolean;
  };
  recurringTemplates: RecurringTemplate[];
  setSettings: (settings: Partial<Settings>) => void;
  updateColumnConfig: (config: Partial<ColumnConfig>) => void;
  saveColumnTemplate: (template: { id?: string; name: string; columns: string[]; pinned: string[] }) => void;
  applyColumnTemplate: (id: string) => void;
  registerDictionaryEntries: (entries: Partial<Record<DictionaryKey, string | string[]>>) => void;
  setDictionaryAutoAppend: (enabled: boolean) => void;
  addRecurringTemplate: (tpl: Omit<RecurringTemplate, 'id'> & { id?: string }) => RecurringTemplate;
  updateRecurringTemplate: (id: string, patch: Partial<RecurringTemplate>) => void;
  deleteRecurringTemplate: (id: string) => void;
  materializeRecurringTasks: () => void;
}

export const createSettingsSlice: StateCreator<
  AppStore,
  [],
  [],
  SettingsSlice
> = (set, get) => ({
  settings: defaultSettings,
  columnConfig: defaultColumnConfig,
  dictionary: {
    onsiteOwners: ['Alex Zhang', 'Maria Wang', 'Elaine Zhao'],
    lineOwners: ['Lee Chen', 'Victor Liu', 'Nina Zhou'],
    tags: ['vendor', 'hardware', 'research', 'contract', 'legal'],
    autoAppend: true,
  },
  recurringTemplates: [],

  setSettings: (settings) => {
    set(
      produce((state: AppStore) => {
        state.settings = { ...state.settings, ...settings };
      })
    );
  },

  updateColumnConfig: (config) => {
    set(
      produce((state: AppStore) => {
        state.columnConfig = { ...state.columnConfig, ...config };
      })
    );
  },

  saveColumnTemplate: ({ id, name, columns, pinned }) => {
    const trimmed = name.trim();
    if (!trimmed) {
      throw new Error('Template name cannot be empty');
    }

    set(
      produce((state: AppStore) => {
        const templates = state.columnConfig.templates ?? [];
        if (id) {
          const existing = templates.find((t) => t.id === id);
          if (existing) {
            existing.name = trimmed;
            existing.columns = columns;
            existing.pinned = pinned;
            return;
          }
        }
        templates.push({
          id: nanoid(8),
          name: trimmed,
          columns,
          pinned,
        });
        state.columnConfig.templates = templates;
      })
    );
  },

  applyColumnTemplate: (id) => {
    const template = (get().columnConfig.templates ?? []).find((t) => t.id === id);
    if (template) {
      set(
        produce((state: AppStore) => {
          state.columnConfig.columns = template.columns;
          state.columnConfig.pinned = template.pinned;
        })
      );
    }
  },

  registerDictionaryEntries: (entries) => {
    set(
      produce((state: AppStore) => {
        Object.entries(entries).forEach(([key, value]) => {
          const dictKey = key as DictionaryKey;
          if (Array.isArray(value)) {
            value.forEach((item) => {
              const trimmed = item.trim();
              if (trimmed && !state.dictionary[dictKey].includes(trimmed)) {
                state.dictionary[dictKey].push(trimmed);
              }
            });
          } else if (typeof value === 'string') {
            const trimmed = value.trim();
            if (trimmed && !state.dictionary[dictKey].includes(trimmed)) {
              state.dictionary[dictKey].push(trimmed);
            }
          }
        });
      })
    );
  },

  setDictionaryAutoAppend: (enabled) => {
    set(
      produce((state: AppStore) => {
        state.dictionary.autoAppend = enabled;
      })
    );
  },

  addRecurringTemplate: (tpl) => {
    const template: RecurringTemplate = {
      ...tpl,
      id: tpl.id ?? nanoid(10),
    };
    
    set(
      produce((state: AppStore) => {
        state.recurringTemplates.push(template);
      })
    );
    
    return template;
  },

  updateRecurringTemplate: (id, patch) => {
    set(
      produce((state: AppStore) => {
        const template = state.recurringTemplates.find((t) => t.id === id);
        if (template) {
          Object.assign(template, patch);
        }
      })
    );
  },

  deleteRecurringTemplate: (id) => {
    set(
      produce((state: AppStore) => {
        state.recurringTemplates = state.recurringTemplates.filter((t) => t.id !== id);
      })
    );
  },

  materializeRecurringTasks: () => {
    // This would generate tasks based on recurring templates
    // Implementation would depend on specific business logic
    // const templates = get().recurringTemplates.filter((t) => t.active);
    // TODO: Implement recurring task generation logic
  },
});
