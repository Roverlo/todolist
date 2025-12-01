import { useState, useEffect } from 'react';
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
      alert('选择文件夹失败，请重试，或直接点击“导出”使用默认目录。');
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

  // Handle Esc key
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (open && e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className='create-overlay'>
      <div className='create-dialog' style={{ width: 520 }}>
        <header className='create-dialog-header'>
          <div className='create-dialog-title-block'>
            <div className='create-dialog-title'>导出任务到 CSV</div>
            <div className='create-dialog-subtitle'>只需选择导出目录，系统会自动生成文件名。</div>
          </div>
          <button className='create-btn-icon' aria-label='关闭导出弹窗' type='button' onClick={onClose}>
            ✕
          </button>
        </header>

        <div className='create-dialog-body' style={{ background: '#fff' }}>
          <div className='create-section'>
            <div className='create-field create-field-span-2'>
              <label className='create-field-label'>
                目标文件夹<span>*</span>
              </label>
              <div className='export-input-row'>
                <input
                  className='create-field-input export-input'
                  type='text'
                  readOnly
                  placeholder='例如：C:\Users\Ro\Documents\ProjectTodoExport'
                  value={dir}
                />
                <button className='btn btn-outline' type='button' onClick={pickDir}>
                  选择目标文件夹
                </button>
              </div>
              <div className='export-hint'>
                不选择时默认导出到应用当前工作目录，文件名形如 <span className='code-like'>{name}</span>。
              </div>
            </div>
            <div className='export-hint' style={{ marginTop: 6 }}>
              仅导出当前筛选条件下的任务数据，可随时重新导出覆盖。
            </div>
          </div>
        </div>

        <footer className='create-dialog-footer'>
          <div className='create-footer-actions export-footer-actions'>
            <button className='btn btn-light' type='button' onClick={onClose}>
              取消
            </button>
            <button className='btn btn-primary' type='button' onClick={handleConfirm}>
              导出
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
};
