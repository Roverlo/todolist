import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification';
import dayjs from 'dayjs';
import './App.css';
import { ProjectSidebar } from './components/sidebar/ProjectSidebar';
import { PrimaryToolbar } from './components/toolbar/PrimaryToolbar';
import { TaskTable } from './components/task-table/TaskTable';
import { DetailsDrawer } from './components/details/DetailsDrawer';
import { useAppStore } from './state/appStore';
import { SingleTaskModal } from './components/toolbar/SingleTaskModal';
import { RecurringTaskModal } from './components/toolbar/RecurringTaskModal';
import { ExportModal } from './components/toolbar/ExportModal';
import { SettingsModal } from './components/toolbar/SettingsModal';
import { ThemeModal } from './components/toolbar/ThemeModal';
import { FontSizeModal } from './components/toolbar/FontSizeModal';
import { useVisibleTasks } from './hooks/useVisibleTasks';
import { ToastContainer } from './components/ui/Toast';
import './components/ui/Toast.css';
import { ConfirmDialog } from './components/ui/ConfirmDialog';
import { NewTaskChoiceDialog } from './components/ui/NewTaskChoiceDialog';
import { BackupModal } from './components/toolbar/BackupModal';
import { DueReminderModal } from './components/ui/DueReminderModal';
import { StatsCard } from './components/ui/StatsCard';

function App() {
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [recurringOpen, setRecurringOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  const [fontSizeOpen, setFontSizeOpen] = useState(false);
  const [emptyTrashConfirmOpen, setEmptyTrashConfirmOpen] = useState(false);
  const [newTaskChoiceOpen, setNewTaskChoiceOpen] = useState(false);
  const [backupOpen, setBackupOpen] = useState(false);
  const [reminderOpen, setReminderOpen] = useState(false);
  const [reminderShown, setReminderShown] = useState(false);
  const colorScheme = useAppStore((state) => state.settings.colorScheme);
  const undo = useAppStore((state) => state.undo);
  const redo = useAppStore((state) => state.redo);
  const purgeTrash = useAppStore((state) => state.purgeTrash);
  const emptyTrash = useAppStore((state) => state.emptyTrash);
  const setFilters = useAppStore((state) => state.setFilters);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // 主题切换
  useEffect(() => {
    const theme = colorScheme || 'blue';
    document.documentElement.setAttribute('data-theme', theme);
  }, [colorScheme]);

  const { tasks, projectMap } = useVisibleTasks();
  const projects = useAppStore((state) => state.projects);
  const filters = useAppStore((state) => state.filters);
  const allTasks = useAppStore((state) => state.tasks);

  // 构建完整的projectMap用于提醒模态框
  const allProjectMap = useMemo(() => {
    return projects.reduce<Record<string, typeof projects[number]>>((acc, project) => {
      acc[project.id] = project;
      return acc;
    }, {});
  }, [projects]);

  const isTrashView = useMemo(() => {
    const trashId = projects.find((p) => p.name === '回收站')?.id;
    return trashId && filters.projectId === trashId;
  }, [projects, filters.projectId]);

  const metrics = useMemo(() => {
    const doing = tasks.filter((t) => t.status === 'doing').length;
    return { total: tasks.length, doing };
  }, [tasks]);

  const handleProjectSelected = useCallback(() => {
    setDrawerOpen(false);
  }, []);

  useEffect(() => {
    purgeTrash();
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isEditableElement = () => {
        if (!target || !(target instanceof HTMLElement)) return false;
        const tag = target.tagName;
        const contentEditable = target.getAttribute('contenteditable');
        if (contentEditable && contentEditable.toLowerCase() === 'true') return true;

        if (tag === 'TEXTAREA') {
          const el = target as HTMLTextAreaElement;
          return !(el.readOnly || el.disabled);
        }
        if (tag === 'INPUT') {
          const el = target as HTMLInputElement;
          const nonTextTypes = ['button', 'submit', 'reset', 'checkbox', 'radio', 'file'];
          if (nonTextTypes.includes(el.type)) return false;
          return !(el.readOnly || el.disabled);
        }
        if (tag === 'SELECT') {
          const el = target as HTMLSelectElement;
          return !el.disabled;
        }
        return false;
      };

      // 防止 Backspace 在非输入场景触发浏览器回退
      if (event.key === 'Backspace' && !isEditableElement()) {
        event.preventDefault();
        return;
      }

      // 如果在编辑模式下，不处理全局快捷键，保留浏览器默认行为（如 Ctrl+Z 撤销文本）
      if (isEditableElement()) {
        return;
      }

      // 拦截 Ctrl+W 防止误关窗口
      if (event.ctrlKey && event.key.toLowerCase() === 'w') {
        event.preventDefault();
        return;
      }

      if (event.ctrlKey && event.key.toLowerCase() === 'z' && !event.shiftKey) {
        event.preventDefault();
        undo();
      }
      if (
        event.ctrlKey &&
        ((event.key.toLowerCase() === 'y' && !event.shiftKey) ||
          (event.key.toLowerCase() === 'z' && event.shiftKey))
      ) {
        event.preventDefault();
        redo();
      }
      // Ctrl+N 或 单独 N 键新建任务（打开类型选择弹窗）
      if (event.ctrlKey && event.key.toLowerCase() === 'n') {
        event.preventDefault();
        setNewTaskChoiceOpen(true);
      }
      if (!event.ctrlKey && !event.altKey && !event.metaKey && event.key.toLowerCase() === 'n') {
        event.preventDefault();
        setNewTaskChoiceOpen(true);
      }
      // Esc 键关闭详情抽屉
      if (event.key === 'Escape') {
        if (activeTaskId) {
          setActiveTaskId(null);
        }
      }
      // Ctrl+F 或 / 键聚焦搜索框
      if ((event.ctrlKey && event.key.toLowerCase() === 'f') || (!event.ctrlKey && !event.altKey && !event.metaKey && event.key === '/')) {
        event.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [undo, redo, activeTaskId]);

  useEffect(() => {
    return () => { };
  }, [drawerOpen]);

  // 启动时检查到期任务并发送系统通知
  useEffect(() => {
    if (!reminderShown && allTasks.length > 0) {
      // 1. 显示应用内提醒 Modal
      const timer = setTimeout(() => {
        setReminderOpen(true);
        setReminderShown(true);
      }, 500);

      // 2. 发送系统通知
      const checkAndNotify = async () => {
        let permissionGranted = await isPermissionGranted();
        if (!permissionGranted) {
          const permission = await requestPermission();
          permissionGranted = permission === 'granted';
        }

        if (permissionGranted) {
          const today = dayjs();
          const dueTasks = allTasks.filter(t => {
            if (t.status === 'done' || !t.dueDate) return false;
            const due = dayjs(t.dueDate);
            // 逾期或今天到期
            return due.isBefore(today, 'day') || due.isSame(today, 'day');
          });

          if (dueTasks.length > 0) {
            // 避免一次性发送太多通知，只发送汇总或前几条
            const count = dueTasks.length;
            const title = `📅 ${count} 个任务待处理`;
            const body = dueTasks.slice(0, 3).map(t => `• ${t.title}`).join('\n') + (count > 3 ? `\n...等 ${count} 个任务` : '');

            sendNotification({ title, body });
          }
        }
      };

      checkAndNotify();

      return () => clearTimeout(timer);
    }
  }, [allTasks, reminderShown]);

  return (
    <div className={`app theme-${colorScheme}`}>
      <ProjectSidebar onProjectSelected={handleProjectSelected} />
      <main className='main'>
        <div className='main-header'>
          <div className='main-title-block'>
            <div className='main-title'>
              <span>任务看板</span>
              <span className='chip'>共 {metrics.total || 0} 条</span>
            </div>
            <div className='main-subtitle'>按截止时间升序</div>
          </div>

          {/* 搜索框 */}
          <div className='search-box'>
            <span className='search-icon'>🔍</span>
            <input
              ref={searchInputRef}
              type='text'
              className='search-input'
              placeholder='搜索任务... (Ctrl+F 或 /)'
              defaultValue={filters.search || ''}
              onChange={(e) => setFilters({ search: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.currentTarget.blur();
                }
              }}
            />
            {filters.search && (
              <button
                className='search-clear'
                onClick={() => {
                  setFilters({ search: '' });
                  if (searchInputRef.current) {
                    searchInputRef.current.value = '';
                  }
                }}
                title='清除搜索'
              >
                ✕
              </button>
            )}
          </div>

          <div className='toolbar'>
            {isTrashView ? (
              <>
                <button
                  className='btn'
                  style={{
                    backgroundColor: '#fef2f2',
                    color: '#dc2626',
                    border: '1px solid #fecaca',
                    fontWeight: 600,
                    marginRight: 8
                  }}
                  onClick={() => setEmptyTrashConfirmOpen(true)}
                >
                  清空回收站
                </button>
                <button
                  className='btn btn-light'
                  onClick={() => setSettingsOpen(true)}
                  title='设置回收站保留时长'
                >
                  回收站保留策略
                </button>
              </>
            ) : (
              <>
                <button
                  className='btn btn-primary-bold'
                  onClick={() => setNewTaskChoiceOpen(true)}
                  aria-label='新建任务'
                >
                  + 新建任务
                </button>
                <button
                  className='btn btn-light'
                  onClick={() => {
                    const el = document.getElementById('filters-panel');
                    if (el) {
                      if (el.style.display === 'none') {
                        el.style.display = 'flex';
                      } else {
                        el.style.display = 'none';
                      }
                    }
                  }}
                  aria-label='展开/收起筛选'
                  title='展开/收起筛选'
                >
                  🔍 筛选
                </button>
                <button
                  className='btn btn-light'
                  onClick={() => setExportOpen(true)}
                  aria-label='导出当前筛选'
                >
                  导出
                </button>
                <button
                  className='btn btn-light'
                  onClick={() => setThemeOpen(true)}
                  aria-label='切换主题'
                  title='切换主题'
                  style={{ marginLeft: 4 }}
                >
                  主题
                </button>
                <button
                  className='btn btn-light'
                  onClick={() => setFontSizeOpen(true)}
                  aria-label='字体大小'
                  title='字体大小'
                  style={{ marginLeft: 4 }}
                >
                  字号
                </button>
                <button
                  className='btn btn-light'
                  onClick={() => setBackupOpen(true)}
                  aria-label='备份恢复'
                  title='备份恢复'
                  style={{ marginLeft: 4 }}
                >
                  备份
                </button>
              </>
            )}
          </div>
        </div>

        <PrimaryToolbar />

        {/* 统计仪表盘 */}
        {!isTrashView && (
          <StatsCard tasks={allTasks} projectMap={allProjectMap as any} />
        )}

        <section className='content'>
          <TaskTable onTaskFocus={setActiveTaskId} activeTaskId={activeTaskId} />
        </section>
      </main>

      <DetailsDrawer
        open={!!activeTaskId}
        taskId={activeTaskId}
        onClose={() => setActiveTaskId(null)}
      />

      <SingleTaskModal open={addOpen} onClose={() => setAddOpen(false)} />
      <RecurringTaskModal open={recurringOpen} onClose={() => setRecurringOpen(false)} />
      <NewTaskChoiceDialog
        open={newTaskChoiceOpen}
        onSingleTask={() => {
          setNewTaskChoiceOpen(false);
          setAddOpen(true);
        }}
        onRecurringTask={() => {
          setNewTaskChoiceOpen(false);
          setRecurringOpen(true);
        }}
        onCancel={() => setNewTaskChoiceOpen(false)}
      />
      <ExportModal
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        tasks={tasks}
        allTasks={allTasks}
        projectMap={projectMap as any}
        currentProjectId={filters.projectId}
      />
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <ThemeModal open={themeOpen} onClose={() => setThemeOpen(false)} />
      <FontSizeModal open={fontSizeOpen} onClose={() => setFontSizeOpen(false)} />
      <BackupModal open={backupOpen} onClose={() => setBackupOpen(false)} />
      <DueReminderModal
        open={reminderOpen}
        onClose={() => setReminderOpen(false)}
        tasks={allTasks}
        projectMap={allProjectMap as any}
      />
      <ToastContainer />
      <ConfirmDialog
        open={emptyTrashConfirmOpen}
        title="清空回收站"
        message="确定要清空回收站吗？此操作将永久删除回收站中的所有任务，无法恢复。"
        confirmLabel="确定清空"
        cancelLabel="取消"
        variant="danger"
        onConfirm={() => {
          emptyTrash();
          setEmptyTrashConfirmOpen(false);
        }}
        onCancel={() => setEmptyTrashConfirmOpen(false)}
      />
    </div>
  );
}

export default App;
