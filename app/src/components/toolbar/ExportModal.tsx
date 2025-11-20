import { useState } from 'react';
import dayjs from 'dayjs';
import { exportTasksToCsv, triggerDownload } from '../../utils/csv';
import type { Task } from '../../types';

interface Props {
  open: boolean;
  onClose: () => void;
  tasks: Task[];
  projectMap: Record<string, { name: string } | undefined>;
}

export const ExportModal = ({ open, onClose, tasks, projectMap }: Props) => {
  const defaultName = `tasks-${dayjs().format('YYYYMMDD-HHmmss')}.csv`;
  const [dir, setDir] = useState<string>('');
  const [name, setName] = useState<string>(defaultName);

  const pickDir = async () => {
    try {
      const dynamicImport = (id: string) => (new Function('id', 'return import(id)'))(id);
      const { open } = await dynamicImport('@tauri-apps/api/dialog');
      const result = await open({ directory: true, multiple: false });
      if (typeof result === 'string') setDir(result);
      else if (Array.isArray(result) && result.length) setDir(result[0]);
    } catch {
      alert('选择文件夹仅在桌面应用中可用，请在打包的应用内使用');
    }
  };

  const handleConfirm = async () => {
    const csv = exportTasksToCsv(tasks, projectMap);
    const BOM = '\ufeff';
    const data = BOM + csv.replace(/\n/g, '\r\n');
    const hasTauri = typeof (window as any).__TAURI__ !== 'undefined';
    if (hasTauri && dir) {
      const dynamicImport = (id: string) => (new Function('id', 'return import(id)'))(id);
      const { writeFile } = await dynamicImport('@tauri-apps/api/fs');
      const pathApi = await dynamicImport('@tauri-apps/api/path');
      const full = await pathApi.join(dir, name);
      await writeFile({ path: full, contents: data });
      alert(`已导出 ${tasks.length} 条任务到:\n${full}`);
      onClose();
      return;
    }
    triggerDownload(name, csv);
    alert(`已导出 ${tasks.length} 条任务到 CSV: ${name}`);
    onClose();
  };

  if (!open) return null;
  return (
    <div className='modal-backdrop'>
      <div className='modal-panel'>
        <div className='modal-header'>
          <h3>导出任务到 CSV</h3>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label>
            目标文件夹
            <div style={{ display: 'flex', gap: 8 }}>
              <input type='text' value={dir} readOnly />
              <button type='button' onClick={pickDir}>选择文件夹</button>
            </div>
          </label>
          <label>
            文件名
            <input type='text' value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <div className='modal-actions'>
            <button type='button' onClick={onClose}>取消</button>
            <button type='button' className='primary-btn' onClick={handleConfirm}>确定</button>
          </div>
        </div>
      </div>
    </div>
  );
};