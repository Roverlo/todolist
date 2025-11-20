import dayjs from 'dayjs';
import type { Task } from '../types';

const CSV_COLUMNS = [
  'id',
  'project',
  'title',
  'status',
  'priority',
  'dueDate',
  'createdAt',
  'updatedAt',
  'onsiteOwner',
  'lineOwner',
  'latestProgressStatus',
  'latestProgressNote',
  'nextStep',
  'notes',
  'tags',
  'attachmentsCount',
  'attachmentNames',
] as const;

export const exportTasksToCsv = (
  tasks: Task[],
  projectMap: Record<string, { name: string } | undefined>,
) => {
  const header = CSV_COLUMNS.join(',');
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
    case 'id':
      return task.id;
    case 'project':
      return projectMap[task.projectId]?.name ?? '';
    case 'title':
      return task.title ?? '';
    case 'status':
      return task.status;
    case 'priority':
      return task.priority ?? '';
    case 'dueDate':
      return task.dueDate ?? '';
    case 'createdAt':
      return dayjs(task.createdAt).format('YYYY-MM-DD');
    case 'updatedAt':
      return dayjs(task.updatedAt).format('YYYY-MM-DD');
    case 'onsiteOwner':
      return task.onsiteOwner ?? '';
    case 'lineOwner':
      return task.lineOwner ?? '';
    case 'latestProgressStatus': {
      const last = task.progress?.[task.progress.length - 1];
      return last?.status ?? '';
    }
    case 'latestProgressNote': {
      const last = task.progress?.[task.progress.length - 1];
      return last?.note ?? '';
    }
    case 'nextStep':
      return task.nextStep ?? '';
    case 'notes':
      return task.notes ?? '';
    case 'tags':
      return (task.tags ?? []).join(',');
    case 'attachmentsCount':
      return String(task.attachments?.length ?? 0);
    case 'attachmentNames':
      return (task.attachments ?? []).map((a) => a.name).join('|');
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

export const saveCsvWithTauri = async (filename: string, content: string): Promise<string | null> => {
  const BOM = '\ufeff';
  const data = BOM + content.replace(/\n/g, '\r\n');
  const hasTauri = typeof (window as any).__TAURI__ !== 'undefined';
  if (!hasTauri) {
    triggerDownload(filename, data);
    return null;
  }
  const dynamicImport = (id: string) => (new Function('id', 'return import(id)'))(id);
  const { save: tauriSave } = await dynamicImport('@tauri-apps/api/dialog');
  const { writeFile: tauriWriteFile } = await dynamicImport('@tauri-apps/api/fs');
  const path = await tauriSave({ defaultPath: filename, filters: [{ name: 'CSV', extensions: ['csv'] }] });
  if (!path) return null;
  await tauriWriteFile({ path, contents: data });
  return String(path);
};
