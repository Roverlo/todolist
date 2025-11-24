import type { StateCreator } from 'zustand';
import { nanoid } from 'nanoid';
import { produce } from 'immer';
import type { Task, ProgressEntry, Attachment, HistoryLog, HistoryChange } from '../../types';
import type { AppStore } from '../appStore';

export interface TaskSlice {
  tasks: Task[];
  addTask: (task: { projectId: string; title: string } & Partial<Task>) => Task;
  updateTask: (id: string, updates: Partial<Task>, batchId?: string) => void;
  deleteTask: (id: string) => void;
  restoreTask: (id: string) => void;
  hardDeleteTask: (id: string) => void;
  bulkUpdateTasks: (ids: string[], updates: Partial<Task>, batchId?: string) => void;
  addProgress: (
    id: string,
    entry: { note: string; at?: number; attachments?: Attachment[] },
  ) => void;
  deleteProgress: (id: string, entryId: string) => void;
  updateProgress: (id: string, entryId: string, patch: Partial<ProgressEntry>) => void;
  importTasks: (tasks: (Partial<Task> & { projectId: string; title: string })[]) => void;
  purgeTrash: () => void;
}

export const createTaskSlice: StateCreator<
  AppStore,
  [],
  [],
  TaskSlice
> = (set, get) => ({
  tasks: [],
  
  addTask: (taskInput) => {
    const { projectId, title, ...rest } = taskInput;
    if (!projectId) {
      throw new Error('Task must belong to a project');
    }
    const newTask: Task = {
      id: nanoid(12),
      projectId,
      title: title.trim(),
      status: rest.status ?? 'doing',
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
      history: [],
      progress: rest.progress ?? [],
      extras: rest.extras ?? {},
      attachments: rest.attachments ?? [],
    };

    set(
      produce((state: AppStore) => {
        state.tasks.push(newTask);
        // Register dictionary values if auto-append is enabled
        if (state.dictionary.autoAppend) {
          if (newTask.onsiteOwner && !state.dictionary.onsiteOwners.includes(newTask.onsiteOwner)) {
            state.dictionary.onsiteOwners.push(newTask.onsiteOwner);
          }
          if (newTask.lineOwner && !state.dictionary.lineOwners.includes(newTask.lineOwner)) {
            state.dictionary.lineOwners.push(newTask.lineOwner);
          }
          (newTask.tags ?? []).forEach((tag) => {
            if (!state.dictionary.tags.includes(tag)) {
              state.dictionary.tags.push(tag);
            }
          });
        }
      })
    );
    return newTask;
  },

  updateTask: (id, updates, batchId) => {
    set(
      produce((state: AppStore) => {
        const task = state.tasks.find((t) => t.id === id);
        if (!task) return;

        const changes: HistoryChange[] = [];
        const trackableFields = ['status', 'priority', 'dueDate', 'onsiteOwner', 'lineOwner', 'nextStep'];
        
        trackableFields.forEach((field) => {
          const key = field as keyof Task;
          if (updates[key] !== undefined && task[key] !== updates[key]) {
            changes.push({ field, from: task[key], to: updates[key] });
          }
        });

        if (changes.length > 0) {
          const historyLog: HistoryLog = {
            id: nanoid(10),
            taskId: id,
            at: Date.now(),
            changes,
            batchId,
          };
          task.history = [...(task.history ?? []), historyLog];
        }

        Object.assign(task, updates);
        task.updatedAt = Date.now();

        // Register new dictionary values
        if (state.dictionary.autoAppend) {
          if (updates.onsiteOwner && !state.dictionary.onsiteOwners.includes(updates.onsiteOwner)) {
            state.dictionary.onsiteOwners.push(updates.onsiteOwner);
          }
          if (updates.lineOwner && !state.dictionary.lineOwners.includes(updates.lineOwner)) {
            state.dictionary.lineOwners.push(updates.lineOwner);
          }
          (updates.tags ?? []).forEach((tag) => {
            if (!state.dictionary.tags.includes(tag)) {
              state.dictionary.tags.push(tag);
            }
          });
        }
      })
    );
  },

  deleteTask: (id) => {
    const projects = get().projects;
    const trashProject = projects.find((p) => p.name === '回收站');
    const trashId = trashProject?.id ?? get().ensureProjectByName('回收站');
    
    set(
      produce((state: AppStore) => {
        const task = state.tasks.find((t) => t.id === id);
        if (task) {
          task.projectId = trashId;
          task.updatedAt = Date.now();
        }
      })
    );
  },

  restoreTask: (id) => {
    set(
      produce((state: AppStore) => {
        const task = state.tasks.find((t) => t.id === id);
        if (task) {
          // Restore to "未分类" if original project doesn't exist
          const unassignedProject = state.projects.find((p) => p.name === '未分类');
          task.projectId = unassignedProject?.id ?? '';
          task.updatedAt = Date.now();
        }
      })
    );
  },

  hardDeleteTask: (id) => {
    set(
      produce((state: AppStore) => {
        state.tasks = state.tasks.filter((t) => t.id !== id);
      })
    );
  },

  bulkUpdateTasks: (ids, updates, batchId = nanoid(8)) => {
    ids.forEach((id) => {
      get().updateTask(id, updates, batchId);
    });
  },

  addProgress: (id, entry) => {
    const progressEntry: ProgressEntry = {
      id: nanoid(10),
      at: entry.at ?? Date.now(),
      note: entry.note,
      attachments: entry.attachments,
    };
    
    set(
      produce((state: AppStore) => {
        const task = state.tasks.find((t) => t.id === id);
        if (task) {
          task.progress = [...(task.progress ?? []), progressEntry];
          task.updatedAt = Date.now();
        }
      })
    );
  },

  deleteProgress: (id, entryId) => {
    set(
      produce((state: AppStore) => {
        const task = state.tasks.find((t) => t.id === id);
        if (task) {
          task.progress = (task.progress ?? []).filter((p) => p.id !== entryId);
          task.updatedAt = Date.now();
        }
      })
    );
  },

  updateProgress: (id, entryId, patch) => {
    set(
      produce((state: AppStore) => {
        const task = state.tasks.find((t) => t.id === id);
        if (task) {
          const entry = (task.progress ?? []).find((p) => p.id === entryId);
          if (entry) {
            Object.assign(entry, patch);
            task.updatedAt = Date.now();
          }
        }
      })
    );
  },

  importTasks: (tasks) => {
    const imported = tasks.map((taskInput) => {
      const { projectId, title, ...rest } = taskInput;
      return {
        id: rest.id ?? nanoid(12),
        projectId,
        title: title.trim(),
        status: rest.status ?? 'doing',
        priority: rest.priority ?? 'medium',
        dueDate: rest.dueDate,
        createdAt: rest.createdAt ?? Date.now(),
        updatedAt: rest.updatedAt ?? Date.now(),
        onsiteOwner: rest.onsiteOwner,
        lineOwner: rest.lineOwner,
        nextStep: rest.nextStep,
        tags: rest.tags ?? [],
        notes: rest.notes,
        dependencies: rest.dependencies ?? [],
        history: rest.history ?? [],
        progress: rest.progress ?? [],
        extras: rest.extras ?? {},
        attachments: rest.attachments ?? [],
      } as Task;
    });

    set(
      produce((state: AppStore) => {
        state.tasks.push(...imported);
      })
    );
  },

  purgeTrash: () => {
    const projects = get().projects;
    const trashProject = projects.find((p) => p.name === '回收站');
    if (!trashProject) return;

    const retentionDays = get().settings.trashRetentionDays ?? 60;
    const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;

    set(
      produce((state: AppStore) => {
        state.tasks = state.tasks.filter(
          (t) => t.projectId !== trashProject.id || t.updatedAt > cutoff
        );
      })
    );
  },
});
