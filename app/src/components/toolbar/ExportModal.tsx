import { useState, useEffect } from 'react';
import dayjs from 'dayjs';
import { exportTasksToCsv, triggerDownload, saveCsvWithTauri } from '../../utils/csv';
import { useAppStore } from '../../state/appStore';
import { BACKUP_VERSION, calculateChecksum } from '../../utils/backupUtils';
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
type ExportFormat = 'csv' | 'markdown' | 'json';

export const ExportModal = ({ open, onClose, tasks, allTasks, projectMap, currentProjectId: _currentProjectId }: Props) => {
  const defaultName = `tasks-${dayjs().format('YYYYMMDD-HHmmss')}`;
  const [dir, setDir] = useState<string>('');
  const [scope, setScope] = useState<ExportScope>('current');
  const [format, setFormat] = useState<ExportFormat>('csv');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [includeRecurring, setIncludeRecurring] = useState(true);

  // 获取周期任务模板和项目列表
  const recurringTemplates = useAppStore((state) => state.recurringTemplates);
  const projects = useAppStore((state) => state.projects);

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

    // 排除尚未到显示时间的任务（周期任务延迟显示）
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    result = result.filter(task => {
      if (task.extras?.visibleFrom) {
        const visibleFrom = new Date(task.extras.visibleFrom);
        visibleFrom.setHours(0, 0, 0, 0);
        if (today < visibleFrom) return false;
      }
      return true;
    });

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

        // 责任人回退逻辑
        const displayOwners = task.owners ?? task.onsiteOwner ?? task.lineOwner;
        if (displayOwners) lines.push(`- **责任人**: ${displayOwners}`);

        if (task.notes) {
          lines.push('- **详情**:');
          lines.push(`  > ${task.notes.replace(/\n/g, '\n  > ')}`);
        }
        if (task.nextStep) {
          lines.push('- **下一步计划**:');
          lines.push(`  > ${task.nextStep.replace(/\n/g, '\n  > ')}`);
        }
        // 导出子任务
        if (task.subtasks && task.subtasks.length > 0) {
          lines.push('- **子任务**:');
          for (const sub of task.subtasks) {
            const checkMark = sub.completed ? '✅' : '⬜';
            let subLine = `  - ${checkMark} ${sub.title}`;
            if (sub.assignee) subLine += ` (@${sub.assignee})`;
            if (sub.dueDate) subLine += ` [截止: ${sub.dueDate}]`;
            lines.push(subLine);
          }
        }
        lines.push('');
      }
    }

    return lines.join('\n');
  };

  // 导出为 JSON 格式（包含完整数据结构）
  const exportToJson = (tasksToExport: Task[]): string => {
    // 获取相关项目
    const projectIds = new Set(tasksToExport.map(t => t.projectId));
    const relatedProjects = projects.filter(p => projectIds.has(p.id) && p.name !== '回收站');

    // 获取相关的周期任务模板（如果启用）
    const relatedRecurring = includeRecurring
      ? recurringTemplates.filter(rt => projectIds.has(rt.projectId))
      : [];

    const data = {
      projects: relatedProjects,
      tasks: tasksToExport,
      recurringTemplates: relatedRecurring,
    };

    const dataString = JSON.stringify(data);
    const checksum = calculateChecksum(dataString);

    const exportData = {
      version: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      checksum,
      data,
    };

    return JSON.stringify(exportData, null, 2);
  };

  const handleConfirm = async () => {
    const tasksToExport = getTasksToExport();

    if (tasksToExport.length === 0) {
      alert('没有符合条件的任务可导出！');
      return;
    }

    // 确定文件扩展名和内容
    let ext: string;
    let content: string;
    let mimeType: string;

    switch (format) {
      case 'json':
        ext = 'json';
        content = exportToJson(tasksToExport);
        mimeType = 'application/json;charset=utf-8';
        break;
      case 'markdown':
        ext = 'md';
        content = exportToMarkdown(tasksToExport);
        mimeType = 'text/markdown;charset=utf-8';
        break;
      case 'csv':
      default:
        ext = 'csv';
        content = exportTasksToCsv(tasksToExport, projectMap);
        mimeType = 'text/csv;charset=utf-8';
    }

    const filename = `${defaultName}.${ext}`;

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

    // 其他格式或 CSV 出错时的备用下载
    try {
      const { save: tauriSave } = await import('@tauri-apps/plugin-dialog');
      const { writeTextFile } = await import('@tauri-apps/plugin-fs');
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
      triggerDownload(filename, content, mimeType);
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

  // 计算可见任务数（排除未到显示时间的任务）
  const getVisibleCount = (taskList: Task[]) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return taskList.filter(task => {
      if (task.extras?.visibleFrom) {
        const visibleFrom = new Date(task.extras.visibleFrom);
        visibleFrom.setHours(0, 0, 0, 0);
        if (today < visibleFrom) return false;
      }
      return true;
    }).length;
  };

  const scopeOptions = [
    { value: 'current', label: `当前视图 (${getVisibleCount(tasks)} 条)` },
    { value: 'all', label: `全部任务 (${getVisibleCount(allTasks.filter(t => projectMap[t.projectId]?.name !== '回收站'))} 条)` },
    { value: 'dateRange', label: '自定义日期范围' },
  ];

  return (
    <div className='create-overlay' style={{ zIndex: 100 }} onClick={(e) => e.stopPropagation()}>
      <div className='create-dialog' style={{ width: 560 }} onClick={(e) => e.stopPropagation()}>
        <header className='create-dialog-header'>
          <div className='create-dialog-title-block'>
            <div className='create-dialog-title'>导出任务</div>
            <div className='create-dialog-subtitle'>选择导出范围和格式，系统会自动生成文件。</div>
          </div>
          <button className='create-btn-icon' aria-label='关闭导出弹窗' type='button' onClick={onClose}>
            ✕
          </button>
        </header>

        <div className='create-dialog-body' style={{ background: 'var(--surface)', padding: '20px 24px' }}>
          {/* 导出范围 */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-subtle)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
              📋 导出范围
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {scopeOptions.map(opt => {
                const isSelected = scope === opt.value;
                return (
                  <div
                    key={opt.value}
                    onClick={() => setScope(opt.value as ExportScope)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '12px 16px',
                      borderRadius: 10,
                      border: isSelected ? '2px solid var(--primary)' : '1px solid var(--border)',
                      background: isSelected ? 'var(--primary-bg)' : 'var(--bg)',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                    }}
                  >
                    <div style={{
                      width: 20,
                      height: 20,
                      borderRadius: '50%',
                      border: isSelected ? '6px solid var(--primary)' : '2px solid var(--border)',
                      background: 'var(--surface)',
                      transition: 'all 0.2s ease',
                    }} />
                    <div style={{ flex: 1, fontWeight: 500, color: 'var(--text-main)' }}>
                      {opt.label}
                    </div>
                    {isSelected && (
                      <span style={{ color: 'var(--primary)', fontSize: 16 }}>✓</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* 日期范围选择器 */}
          {scope === 'dateRange' && (
            <div style={{
              marginBottom: 20,
              padding: 16,
              background: 'var(--bg)',
              borderRadius: 10,
              border: '1px solid var(--border)',
            }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-subtle)', marginBottom: 10 }}>
                📅 选择日期范围
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <input
                  type='date'
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  style={{
                    flex: 1,
                    padding: '10px 12px',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    background: 'var(--surface)',
                    color: 'var(--text-main)',
                    fontSize: 13,
                  }}
                />
                <span style={{ color: 'var(--text-subtle)', fontWeight: 500 }}>至</span>
                <input
                  type='date'
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  style={{
                    flex: 1,
                    padding: '10px 12px',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    background: 'var(--surface)',
                    color: 'var(--text-main)',
                    fontSize: 13,
                  }}
                />
              </div>
            </div>
          )}

          {/* 导出格式 */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-subtle)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
              📁 导出格式
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
              {[
                { value: 'json', icon: '{ }', name: 'JSON', desc: '支持导入' },
                { value: 'csv', icon: '📊', name: 'CSV', desc: '适合 Excel' },
                { value: 'markdown', icon: '📝', name: 'Markdown', desc: '文档整理' },
              ].map(fmt => {
                const isSelected = format === fmt.value;
                return (
                  <div
                    key={fmt.value}
                    onClick={() => setFormat(fmt.value as any)}
                    style={{
                      padding: '16px 12px',
                      borderRadius: 10,
                      border: isSelected ? '2px solid var(--primary)' : '1px solid var(--border)',
                      background: isSelected ? 'var(--primary-bg)' : 'var(--bg)',
                      cursor: 'pointer',
                      textAlign: 'center',
                      transition: 'all 0.2s ease',
                    }}
                  >
                    <div style={{ fontSize: 24, marginBottom: 6, opacity: isSelected ? 1 : 0.7 }}>
                      {fmt.icon}
                    </div>
                    <div style={{ fontWeight: 600, color: 'var(--text-main)', fontSize: 13, marginBottom: 2 }}>
                      {fmt.name}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-subtle)' }}>
                      {fmt.desc}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* JSON 格式时显示周期任务选项 */}
          {format === 'json' && (
            <div
              onClick={() => setIncludeRecurring(!includeRecurring)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '12px 16px',
                marginBottom: 20,
                borderRadius: 10,
                border: includeRecurring ? '2px solid var(--primary)' : '1px solid var(--border)',
                background: includeRecurring ? 'var(--primary-bg)' : 'var(--bg)',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
            >
              <div style={{
                width: 20,
                height: 20,
                borderRadius: 4,
                border: includeRecurring ? 'none' : '2px solid var(--border)',
                background: includeRecurring ? 'var(--primary)' : 'var(--surface)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                fontSize: 12,
                transition: 'all 0.2s ease',
              }}>
                {includeRecurring && '✓'}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 500, color: 'var(--text-main)', fontSize: 13 }}>
                  🔄 包含周期任务模板
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-subtle)' }}>
                  导出相关项目的周期任务设置
                </div>
              </div>
            </div>
          )}

          {/* 目标文件夹 */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-subtle)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
              📂 目标文件夹
            </div>
            <div
              onClick={pickDir}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '12px 16px',
                borderRadius: 10,
                border: '2px dashed var(--border)',
                background: 'var(--bg)',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
            >
              <div style={{ fontSize: 24, opacity: 0.6 }}>📁</div>
              <div style={{ flex: 1, color: dir ? 'var(--text-main)' : 'var(--text-subtle)', fontSize: 13 }}>
                {dir || '不选择则弹出保存对话框'}
              </div>
              <button
                className='btn btn-light'
                type='button'
                onClick={(e) => { e.stopPropagation(); pickDir(); }}
                style={{ padding: '6px 12px', fontSize: 12 }}
              >
                选择
              </button>
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
    </div >
  );
};
