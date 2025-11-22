import { useState } from 'react';
import dayjs from 'dayjs';
import { exportTasksToCsv, triggerDownload, saveCsvWithTauri } from '../../utils/csv';
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
  const [name] = useState<string>(defaultName);

  

  const pickDir = async () => {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const result = (await open({ directory: true, multiple: false })) as string | string[] | null;
      if (typeof result === 'string') setDir(result);
      else if (Array.isArray(result) && result.length) setDir(result[0]);
    } catch (error) {
      console.error('选择文件夹失败', error);
      alert('选择文件夹失败，请重试或直接点击“确定”下载 CSV 文件。');
    }
  };

  const handleConfirm = async () => {
    const csv = exportTasksToCsv(tasks, projectMap);

    if (dir) {
      try {
        const { join } = await import('@tauri-apps/api/path');
        const { writeTextFile } = await import('@tauri-apps/plugin-fs');
        const bom = '\ufeff';
        const data = bom + csv.replace(/\n/g, '\r\n');
        const full = await join(dir, name);
        await writeTextFile(full, data);
        alert(`已导出 ${tasks.length} 条任务到:\n${full}`);
        onClose();
        return;
      } catch (error) {
        console.error('写入文件失败', error);
        alert('写入文件失败，将直接下载 CSV。');
      }
    }

    {
      const savedPath = await saveCsvWithTauri(name, csv);
      if (savedPath) {
        alert(`已导出 ${tasks.length} 条任务到:\n${savedPath}`);
        onClose();
        return;
      }
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
          <div>
            将导出为：<span style={{ fontFamily: 'monospace' }}>{name}</span>
          </div>
          <div className='modal-actions'>
            <button type='button' onClick={onClose}>取消</button>
            <button type='button' className='primary-btn' onClick={handleConfirm}>确定</button>
          </div>
        </div>
      </div>
    </div>
  );
};
