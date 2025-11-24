import type { StateCreator } from 'zustand';
import { nanoid } from 'nanoid';
import { produce } from 'immer';
import type { Filters, SavedFilter, SortRule, GroupBy } from '../../types';
import type { AppStore } from '../appStore';

const DEFAULT_SORT: SortRule[] = [
  { key: 'status', direction: 'asc' },
  { key: 'dueDate', direction: 'asc' },
  { key: 'priority', direction: 'desc' },
];

export interface FilterSlice {
  filters: Filters;
  savedFilters: SavedFilter[];
  sortRules: SortRule[];
  sortSchemes: Array<{ id: string; name: string; rules: SortRule[] }>;
  groupBy: GroupBy;
  setFilters: (filters: Partial<Filters>) => void;
  resetFilters: () => void;
  setGroupBy: (groupBy: GroupBy) => void;
  setSortRules: (rules: SortRule[]) => void;
  saveFilter: (payload: { id?: string; name: string }) => void;
  applySavedFilter: (id: string) => void;
  deleteSavedFilter: (id: string) => void;
  saveSortScheme: (scheme: { id?: string; name: string; rules: SortRule[] }) => void;
  deleteSortScheme: (id: string) => void;
  applySortScheme: (id: string) => void;
}

const initialFilters: Filters = {
  search: '',
  status: 'all',
  statuses: [],
  priority: 'all',
  tags: [],
};

export const createFilterSlice: StateCreator<
  AppStore,
  [],
  [],
  FilterSlice
> = (set, get) => ({
  filters: initialFilters,
  savedFilters: [],
  sortRules: DEFAULT_SORT,
  sortSchemes: [
    { id: nanoid(8), name: 'Default Sort', rules: DEFAULT_SORT },
  ],
  groupBy: 'project',

  setFilters: (filters) => {
    set(
      produce((state: AppStore) => {
        state.filters = { ...state.filters, ...filters };
      })
    );
  },

  resetFilters: () => {
    set(
      produce((state: AppStore) => {
        state.filters = { ...initialFilters };
      })
    );
  },

  setGroupBy: (groupBy) => {
    set(
      produce((state: AppStore) => {
        state.groupBy = groupBy;
      })
    );
  },

  setSortRules: (rules) => {
    set(
      produce((state: AppStore) => {
        state.sortRules = rules.length ? rules : DEFAULT_SORT;
      })
    );
  },

  saveFilter: (payload) => {
    const { id, name } = payload;
    const trimmed = name.trim();
    if (!trimmed) {
      throw new Error('Filter name cannot be empty');
    }

    set(
      produce((state: AppStore) => {
        if (id) {
          const existing = state.savedFilters.find((f) => f.id === id);
          if (existing) {
            existing.name = trimmed;
            existing.filters = { ...state.filters };
            return;
          }
        }
        state.savedFilters.push({
          id: nanoid(8),
          name: trimmed,
          filters: { ...state.filters },
        });
      })
    );
  },

  applySavedFilter: (id) => {
    const saved = get().savedFilters.find((f) => f.id === id);
    if (saved) {
      set(
        produce((state: AppStore) => {
          state.filters = { ...saved.filters };
        })
      );
    }
  },

  deleteSavedFilter: (id) => {
    set(
      produce((state: AppStore) => {
        state.savedFilters = state.savedFilters.filter((f) => f.id !== id);
      })
    );
  },

  saveSortScheme: ({ id, name, rules }) => {
    const trimmed = name.trim();
    if (!trimmed) {
      throw new Error('Scheme name cannot be empty');
    }
    
    set(
      produce((state: AppStore) => {
        if (id) {
          const target = state.sortSchemes.find((s) => s.id === id);
          if (target) {
            target.name = trimmed;
            target.rules = rules;
            return;
          }
        }
        state.sortSchemes.push({ 
          id: nanoid(8), 
          name: trimmed, 
          rules 
        });
      })
    );
  },

  deleteSortScheme: (id) => {
    set(
      produce((state: AppStore) => {
        state.sortSchemes = state.sortSchemes.filter((s) => s.id !== id);
      })
    );
  },

  applySortScheme: (id) => {
    const scheme = get().sortSchemes.find((s) => s.id === id);
    if (scheme) {
      set(
        produce((state: AppStore) => {
          state.sortRules = scheme.rules;
        })
      );
    }
  },
});
