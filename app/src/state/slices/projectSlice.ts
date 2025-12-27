import type { StateCreator } from 'zustand';
import { nanoid } from 'nanoid';
import { produce } from 'immer';
import type { Project } from '../../types';
import type { AppStore } from '../appStore';

export interface ProjectSlice {
  projects: Project[];
  addProject: (name: string) => Project;
  renameProject: (id: string, name: string) => void;
  deleteProject: (id: string, options?: { deleteTasks?: boolean }) => void;
  ensureProjectByName: (name: string) => string;
}

const makeProject = (name: string): Project => ({
  id: nanoid(10),
  name,
  archived: false,
  createdAt: Date.now(),
  updatedAt: Date.now(),
});

export const createProjectSlice: StateCreator<
  AppStore,
  [],
  [],
  ProjectSlice
> = (set, get) => ({
  projects: [],
  
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
    set(
      produce((state: AppStore) => {
        state.projects.push(project);
      })
    );
    return project;
  },

  renameProject: (id, name) => {
    set(
      produce((state: AppStore) => {
        const project = state.projects.find((p) => p.id === id);
        if (project) {
          project.name = name.trim() || project.name;
          project.updatedAt = Date.now();
        }
      })
    );
  },

  deleteProject: (id, options) => {
    const { deleteTasks = false } = options ?? {};
    set(
      produce((state: AppStore) => {
        state.projects = state.projects.filter((p) => p.id !== id);
        if (deleteTasks) {
          state.tasks = state.tasks.filter((t) => t.projectId !== id);
        } else {
          state.tasks = state.tasks.map((t) => 
            t.projectId === id ? { ...t, projectId: '' } : t
          );
        }
      })
    );
  },

  ensureProjectByName: (name) => {
    const existing = get().projects.find((p) => p.name === name);
    if (existing) {
      return existing.id;
    }
    const project = get().addProject(name);
    return project.id;
  },
});
