import { create } from 'zustand';
import { invoke, isTauri } from '@tauri-apps/api/core';

export type DownloadFilter = 'all' | 'running' | 'paused' | 'complete' | 'error';
export interface DownloadTask {
  id: string; url: string; name: string; directory: string;
  status: 'active' | 'waiting' | 'paused' | 'complete' | 'error';
  total: number; completed: number; speed: number; error: string;
  createdAt: number; finishedAt: number | null;
}
export interface DownloadSettings { directory: string; concurrent: number; limitKib: number; notify: boolean }
interface Snapshot { tasks: DownloadTask[]; settings: DownloadSettings; engineVersion: string; error: string | null }
export type DownloadRequest = { action: 'list' } | { action: 'add'; url: string; name: string; directory: string }
  | { action: 'pause' | 'resume' | 'remove' | 'reveal'; id: string } | { action: 'settings'; settings: DownloadSettings };
interface DownloadStore extends Snapshot {
  filter: DownloadFilter; busy: boolean; loaded: boolean;
  setFilter: (filter: DownloadFilter) => void;
  refresh: () => Promise<void>;
  request: (request: DownloadRequest) => Promise<void>;
}

export const useDownloadStore = create<DownloadStore>((set, get) => ({
  tasks: [], settings: { directory: '', concurrent: 3, limitKib: 0, notify: true }, engineVersion: '', error: null,
  filter: 'all', busy: false, loaded: !isTauri(),
  setFilter: filter => set({ filter }),
  refresh: async () => {
    if (!isTauri() || get().busy) return;
    try { set({ ...await invoke<Snapshot>('downloads_request', { request: { action: 'list' } }), loaded: true }); }
    catch (error) { set({ error: String(error), loaded: true }); }
  },
  request: async request => {
    if (!isTauri()) throw new Error('请在 Windows 桌面版中使用文件下载功能');
    if (get().busy) throw new Error('上一项操作正在处理，请稍候');
    set({ busy: true });
    try { set({ ...await invoke<Snapshot>('downloads_request', { request }), loaded: true }); }
    finally { set({ busy: false }); await get().refresh(); }
  },
}));

export function matchesFilter(task: DownloadTask, filter: DownloadFilter) {
  return filter === 'all' || (filter === 'running' ? task.status === 'active' || task.status === 'waiting' : task.status === filter);
}
export function formatBytes(bytes: number) {
  if (!bytes) return '0 B';
  const index = Math.min(3, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** index).toFixed(index > 0 ? 1 : 0)} ${['B', 'KiB', 'MiB', 'GiB'][index]}`;
}
