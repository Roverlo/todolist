import { useState, useEffect } from 'react';
import dayjs from 'dayjs';
import { exportTasksToCsv, triggerDownload, saveCsvWithTauri } from '../../utils/csv';
import type { Task } from '../../types';

interface Props {
  open: boolean;
  onClose: () => void;
  tasks: Task[];
  allTasks: Task[];
  projectMap: Record<string, { name: string } | undefined>;
  currentProjectId?: string;
}

type ExportScope = 'current' | 'all' | 'dateRange';
type ExportFormat = 'csv' | 'markdown';

export const ExportModal = ({ open, onClose, tasks, allTasks, projectMap, currentProjectId: _currentProjectId }: Props) => {
  const defaultName = `tasks-${dayjs().format('YYYYMMDD-HHmmss')}`;
  const [dir, setDir] = useState<string>('');
  const [scope, setScope] = useState<ExportScope>('current');
  const [format, setFormat] = useState<ExportFormat>('csv');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const pickDir = async () => {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const result = (await open({ directory: true, multiple: false })) as string | string[] | null;
      if (typeof result === 'string') setDir(result);
      else if (Array.isArray(result) && result.length) setDir(result[0]);
    } catch (error) {
      console.error('选择文件夹失败', error);
      alert('选择文件夹失败，请重试，或直接点击"导出"使用默认目录。');
    }
  };

  const getTasksToExport = (): Task[] => {
    let result: Task[];

    switch (scope) {
      case 'all':
        // 排除回收站任务
        result = allTasks.filter(t => projectMap[t.projectId]?.name !== '回收站');
        break;
      case 'dateRange':
        result = allTasks.filter(t => {
          if (projectMap[t.projectId]?.name === '回收站') return false;
          const created = dayjs(t.createdAt).format('YYYY-MM-DD');
          if (startDate && created < startDate) return false;
          if (endDate && created > endDate) return false;
          return true;
        });
        break;
      case 'current':
      default:
        result = tasks;
    }

    return result;
  };

  const exportToMarkdown = (tasksToExport: Task[]): string => {
    const lines: string[] = [];
    lines.push(`# 任务导出报告`);
    lines.push(`> 导出时间：${dayjs().format('YYYY-MM-DD HH:mm:ss')}`);
    lines.push(`> 任务数量：${tasksToExport.length}`);
    lines.push('');

    // 按项目分组
    const grouped = tasksToExport.reduce<Record<string, Task[]>>((acc, task) => {
      const projectName = projectMap[task.projectId]?.name ?? '未分类';
      if (!acc[projectName]) acc[projectName] = [];
      acc[projectName].push(task);
      return acc;
    }, {});

    for (const [projectName, projectTasks] of Object.entries(grouped)) {
      lines.push(`## ${projectName}`);
      lines.push('');

      for (const task of projectTasks) {
        const statusMap: Record<string, string> = { done: '✅', paused: '⏸️', doing: '🔄' };
        const priorityMap: Record<string, string> = { high: '🔴', medium: '🟡', low: '🟢' };
        const status = statusMap[task.status] || '🔄';
        const priority = priorityMap[task.priority ?? 'medium'] || '🟡';

        lines.push(`### ${status} ${task.title}`);
        lines.push('');
        lines.push(`- **优先级**: ${priority} ${task.priority ?? 'medium'}`);
        lines.push(`- **创建时间**: ${dayjs(task.createdAt).format('YYYY-MM-DD')}`);
        if (task.dueDate) lines.push(`- **截止日期**: ${task.dueDate}`);
        if (task.onsiteOwner) lines.push(`- **现场负责人**: ${task.onsiteOwner}`);
        if (task.lineOwner) lines.push(`- **产线负责人**: ${task.lineOwner}`);
        if (task.notes) {
          lines.push('- **详情**:');
          lines.push(`  > ${task.notes.replace(/\n/g, '\n  > ')}`);
        }
        if (task.nextStep) {
          lines.push('- **下一步计划**:');
          lines.push(`  > ${task.nextStep.replace(/\n/g, '\n  > ')}`);
        }
        lines.push('');
      }
    }

    return lines.join('\n');
  };

  const handleConfirm = async () => {
    const tasksToExport = getTasksToExport();

    if (tasksToExport.length === 0) {
      alert('没有符合条件的任务可导出！');
      return;
    }

    const ext = format === 'csv' ? 'csv' : 'md';
    const filename = `${defaultName}.${ext}`;
    const content = format === 'csv'
      ? exportTasksToCsv(tasksToExport, projectMap)
      : exportToMarkdown(tasksToExport);

    if (dir) {
      try {
        const { join } = await import('@tauri-apps/api/path');
        const { writeTextFile } = await import('@tauri-apps/plugin-fs');
        const bom = format === 'csv' ? '\ufeff' : '';
        const data = bom + (format === 'csv' ? content.replace(/\n/g, '\r\n') : content);
        const full = await join(dir, filename);
        await writeTextFile(full, data);
        alert(`已导出 ${tasksToExport.length} 条任务到：\n${full}`);
        onClose();
        return;
      } catch (error) {
        console.error('写入文件失败', error);
        alert('写入文件失败，将直接下载文件。');
      }
    }

    if (format === 'csv') {
      const savedPath = await saveCsvWithTauri(filename, content);
      if (savedPath === 'cancelled') {
        // 用户取消，不做任何操作
        return;
      }
      if (savedPath) {
        alert(`已导出 ${tasksToExport.length} 条任务到：\n${savedPath}`);
        onClose();
        return;
      }
      // savedPath 为 null 表示出错，继续使用浏览器下载
    }

    // Markdown 格式或 CSV 出错时的备用下载
    try {
      const { save: tauriSave } = await import('@tauri-apps/plugin-dialog');
      const { writeTextFile } = await import('@tauri-apps/plugin-fs');
      const ext = format === 'csv' ? 'csv' : 'md';
      const path = await tauriSave({
        defaultPath: filename,
        filters: [{ name: format.toUpperCase(), extensions: [ext] }]
      });
      if (!path) {
        // 用户取消
        return;
      }
      const bom = format === 'csv' ? '\ufeff' : '';
      await writeTextFile(path, bom + content);
      alert(`已导出 ${tasksToExport.length} 条任务到：\n${path}`);
      onClose();
    } catch {
      // Tauri 对话框失败，使用浏览器下载
      triggerDownload(filename, content, format === 'csv' ? 'text/csv;charset=utf-8' : 'text/markdown;charset=utf-8');
      alert(`已导出 ${tasksToExport.length} 条任务到: ${filename}`);
      onClose();
    }
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

  const scopeOptions = [
    { value: 'current', label: `当前视图 (${tasks.length} 条)` },
    { value: 'all', label: `全部任务 (${allTasks.filter(t => projectMap[t.projectId]?.name !== '回收站').length} 条)` },
    { value: 'dateRange', label: '自定义日期范围' },
  ];

  return (
    <div className='create-overlay'>
      <div className='create-dialog' style={{ width: 560 }}>
        <header className='create-dialog-header'>
          <div className='create-dialog-title-block'>
            <div className='create-dialog-title'>导出任务</div>
            <div className='create-dialog-subtitle'>选择导出范围和格式，系统会自动生成文件。</div>
          </div>
          <button className='create-btn-icon' aria-label='关闭导出弹窗' type='button' onClick={onClose}>
            ✕
          </button>
        </header>

        <div className='create-dialog-body' style={{ background: 'var(--surface)' }}>
          <div className='create-section'>
            {/* 导出范围 */}
            <div className='create-field create-field-span-2'>
              <label className='create-field-label'>导出范围</label>
              <div className='export-scope-options'>
                {scopeOptions.map(opt => (
                  <label key={opt.value} className='export-scope-option'>
                    <input
                      type='radio'
                      name='exportScope'
                      value={opt.value}
                      checked={scope === opt.value}
                      onChange={(e) => setScope(e.target.value as ExportScope)}
                    />
                    <span>{opt.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* 日期范围选择器 */}
            {scope === 'dateRange' && (
              <div className='create-field create-field-span-2'>
                <label className='create-field-label'>创建日期范围</label>
                <div className='export-date-range'>
                  <input
                    type='date'
                    className='create-field-input'
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    placeholder='开始日期'
                  />
                  <span className='date-range-separator'>至</span>
                  <input
                    type='date'
                    className='create-field-input'
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    placeholder='结束日期'
                  />
                </div>
              </div>
            )}

            {/* 导出格式 */}
            <div className='create-field create-field-span-2'>
              <label className='create-field-label'>导出格式</label>
              <div className='export-format-options'>
                <label className='export-format-option'>
                  <input
                    type='radio'
                    name='exportFormat'
                    value='csv'
                    checked={format === 'csv'}
                    onChange={() => setFormat('csv')}
                  />
                  <span className='format-label'>
                    <strong>CSV</strong>
                    <small>适合 Excel 打开</small>
                  </span>
                </label>
                <label className='export-format-option'>
                  <input
                    type='radio'
                    name='exportFormat'
                    value='markdown'
                    checked={format === 'markdown'}
                    onChange={() => setFormat('markdown')}
                  />
                  <span className='format-label'>
                    <strong>Markdown</strong>
                    <small>适合文档整理</small>
                  </span>
                </label>
              </div>
            </div>

            {/* 目标文件夹 */}
            <div className='create-field create-field-span-2'>
              <label className='create-field-label'>目标文件夹</label>
              <div className='export-input-row'>
                <input
                  className='create-field-input export-input'
                  type='text'
                  readOnly
                  placeholder='不选择则弹出保存对话框'
                  value={dir}
                />
                <button className='btn btn-outline' type='button' onClick={pickDir}>
                  选择
                </button>
              </div>
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
