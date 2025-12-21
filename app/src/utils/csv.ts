import dayjs from 'dayjs';
import type { Task } from '../types';

const CSV_COLUMNS = [
  'project',
  'title',
  'status',
  'priority',
  'owners',
  'notes',
  'latestProgress',
  'nextStep',
  'dueDate',
  'createdAt',
  'updatedAt',
] as const;

const CSV_HEADERS_CN: Record<(typeof CSV_COLUMNS)[number], string> = {
  project: '项目',
  title: '标题',
  status: '状态',
  priority: '优先级',
  owners: '责任人',
  notes: '详情',
  latestProgress: '最新进展',
  nextStep: '下一步',
  dueDate: '截止日期',
  createdAt: '创建日期',
  updatedAt: '更新日期',
};

export const exportTasksToCsv = (
  tasks: Task[],
  projectMap: Record<string, { name: string } | undefined>,
) => {
  const header = CSV_COLUMNS.map((c) => CSV_HEADERS_CN[c] ?? c).join(',');
  const lines = tasks.map((task) => {
    const values = CSV_COLUMNS.map((column) => escapeCsv(getFieldValue(task, column, projectMap)));
    return values.join(',');
  });
  return [header, ...lines].join('\n');
};

const getFieldValue = (
  task: Task,
  column: (typeof CSV_COLUMNS)[number],
  projectMap: Record<string, { name: string } | undefined>,
) => {
  switch (column) {
    case 'project':
      return projectMap[task.projectId]?.name ?? '';
    case 'title':
      return task.title ?? '';
    case 'status': {
      const map: Record<string, string> = { done: '已完成', paused: '暂停', doing: '进行中' };
      const v = String(task.status ?? '');
      return map[v] ?? v;
    }
    case 'priority': {
      const map: Record<string, string> = { high: '高', medium: '中', low: '低' };
      const v = String(task.priority ?? '');
      return map[v] ?? v;
    }
    case 'dueDate':
      return task.dueDate ?? '';
    case 'createdAt':
      return dayjs(task.createdAt).format('YYYY-MM-DD');
    case 'updatedAt':
      return dayjs(task.updatedAt).format('YYYY-MM-DD');
    case 'owners':
      // 优先 owners，回退到 onsiteOwner/lineOwner
      return task.owners ?? task.onsiteOwner ?? task.lineOwner ?? '';
    case 'latestProgress': {
      const last = task.progress?.[task.progress.length - 1];
      return last?.note ?? '';
    }
    case 'nextStep':
      return task.nextStep ?? '';
    case 'notes':
      return task.notes ?? '';
    default:
      return '';
  }
};

const escapeCsv = (value: string) => {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
};

export const triggerDownload = (filename: string, content: string, mime = 'text/csv;charset=utf-8') => {
  const BOM = '\ufeff';
  const blob = new Blob([BOM + content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

export const saveCsvWithTauri = async (filename: string, content: string): Promise<string | null | 'cancelled'> => {
  const BOM = '\ufeff';
  const data = BOM + content.replace(/\n/g, '\r\n');
  try {
    const { save: tauriSave } = await import('@tauri-apps/plugin-dialog');
    const { writeTextFile: tauriWriteTextFile } = await import('@tauri-apps/plugin-fs');
    const path = await tauriSave({ defaultPath: filename, filters: [{ name: 'CSV', extensions: ['csv'] }] });
    if (!path) return 'cancelled'; // 用户取消
    await tauriWriteTextFile(path, data);
    return String(path);
  } catch {
    return null; // 错误情况
  }
};
