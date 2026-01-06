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
import { ImportModal } from './components/toolbar/ImportModal';
import { SettingsModal } from './components/toolbar/SettingsModal';
import { TrashSettingsModal } from './components/toolbar/TrashSettingsModal';
import { CloudSyncModal } from './components/toolbar/CloudSyncModal';
import { RecurringTaskManagerModal } from './components/toolbar/RecurringTaskManagerModal';
import { SettingsPanel } from './components/toolbar/SettingsPanel';
import { ThemeModal } from './components/toolbar/ThemeModal';
import { FontSizeModal } from './components/toolbar/FontSizeModal';
import { useAutoBackup } from './hooks/useAutoBackup';
import { useVisibleTasks } from './hooks/useVisibleTasks';
import { ToastContainer } from './components/ui/Toast';
import './components/ui/Toast.css';
import { ConfirmDialog } from './components/ui/ConfirmDialog';
import { NewTaskChoiceDialog } from './components/ui/NewTaskChoiceDialog';
import { BackupModal } from './components/toolbar/BackupModal';
import { DueReminderModal } from './components/ui/DueReminderModal';
import { StatsCard } from './components/ui/StatsCard';
import { CloseConfirmModal } from './components/ui/CloseConfirmModal';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { listen } from '@tauri-apps/api/event';
import { NotesCenter } from './components/notes';

function App() {
  useAutoBackup(); // 启动自动备份 hook
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
  const [sortDropdownOpen, setSortDropdownOpen] = useState(false);
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);
  const [trashSettingsOpen, setTrashSettingsOpen] = useState(false);
  const [cloudSyncOpen, setCloudSyncOpen] = useState(false);
  const [recurringManagerOpen, setRecurringManagerOpen] = useState(false);
  const [settingsPanelOpen, setSettingsPanelOpen] = useState(false);
  const [notesCenterOpen, setNotesCenterOpen] = useState(false);
  const colorScheme = useAppStore((state) => state.settings.colorScheme);
  const settings = useAppStore((state) => state.settings);
  const undo = useAppStore((state) => state.undo);
  const redo = useAppStore((state) => state.redo);
  const purgeTrash = useAppStore((state) => state.purgeTrash);
  const emptyTrash = useAppStore((state) => state.emptyTrash);
  const setFilters = useAppStore((state) => state.setFilters);
  const sortRules = useAppStore((state) => state.sortRules);
  const setSortRules = useAppStore((state) => state.setSortRules);
  const migrateLegacyRecurringTasks = useAppStore((state) => state.migrateLegacyRecurringTasks);
  const isHydrated = useAppStore((state) => state._hasHydrated);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // 迁移旧版周期任务
  useEffect(() => {
    if (isHydrated) {
      migrateLegacyRecurringTasks();
    }
  }, [isHydrated]);

  // 主题切换
  useEffect(() => {
    const theme = colorScheme || 'blue';
    document.documentElement.setAttribute('data-theme', theme);
  }, [colorScheme]);

  // 窗口关闭事件拦截 - 监听来自 Rust 的 close-requested 事件
  useEffect(() => {
    console.log('[CloseHandler] Setting up close event listener...');
    let unlisten: (() => void) | undefined;

    const setup = async () => {
      const appWindow = getCurrentWindow();
      console.log('[CloseHandler] Listening for close-requested event');

      unlisten = await listen('close-requested', async () => {
        console.log('[CloseHandler] Received close-requested event!');
        // 检查是否有保存的偏好
        const savedChoice = localStorage.getItem('closeAction');
        console.log('[CloseHandler] savedChoice:', savedChoice);

        if (savedChoice === 'minimize') {
          console.log('[CloseHandler] Hiding window');
          await appWindow.hide();
        } else if (savedChoice === 'exit') {
          console.log('[CloseHandler] Destroying window');
          await appWindow.destroy();
        } else {
          console.log('[CloseHandler] Showing modal');
          setCloseConfirmOpen(true);
        }
      });
      console.log('[CloseHandler] Listener registered');
    };

    setup().catch(err => console.error('[CloseHandler] Setup error:', err));

    return () => {
      console.log('[CloseHandler] Cleaning up listener');
      unlisten?.();
    };
  }, []);

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

  // 用于 StatsCard 的任务列表：只按项目筛选，不含状态筛选，这样点击筛选不会影响统计数字
  const projectTasks = useMemo(() => {
    const trashId = projects.find((p) => p.name === '回收站')?.id;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return allTasks.filter((task) => {
      // 排除回收站任务（除非当前选择的就是回收站）
      if (task.projectId === trashId && filters.projectId !== trashId) return false;
      // 排除尚未到显示时间的任务（周期任务延迟显示）
      if (task.extras?.visibleFrom) {
        const visibleFrom = new Date(task.extras.visibleFrom);
        visibleFrom.setHours(0, 0, 0, 0);
        if (today < visibleFrom) return false;
      }
      // 如果选择了具体项目，只显示该项目的任务
      if (filters.projectId && task.projectId !== filters.projectId) return false;
      return true;
    });
  }, [allTasks, projects, filters.projectId]);

  // 统计数据


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
    // 等待数据加载完成
    if (!isHydrated) return;

    const checkStartup = async () => {
      const hasShown = sessionStorage.getItem('sessionReminderShown');

      // 检查是否禁用了提醒
      if (settings.dueReminderEnabled === false) {
        return;
      }

      // 检查是否在暂停期内
      if (settings.dueReminderSnoozeUntil) {
        const snoozeUntil = dayjs(settings.dueReminderSnoozeUntil);
        if (dayjs().isBefore(snoozeUntil)) {
          return;
        }
      }

      if (!reminderShown && !hasShown && allTasks.length > 0) {
        // 1. 显示应用内提醒 Modal
        const timer = setTimeout(() => {
          setReminderOpen(true);
          setReminderShown(true);
          sessionStorage.setItem('sessionReminderShown', 'true');
        }, 500);

        // 2. 发送系统通知 (仅在 Tauri 环境)
        const today = dayjs();
        const dueTasks = allTasks.filter(t => {
          if (t.status === 'done' || !t.dueDate) return false;
          const due = dayjs(t.dueDate);
          return due.isBefore(today, 'day') || due.isSame(today, 'day');
        });

        if (dueTasks.length > 0 && typeof window !== 'undefined' && '__TAURI__' in window) {
          try {
            let permissionGranted = await isPermissionGranted();
            if (!permissionGranted) {
              const permission = await requestPermission();
              permissionGranted = permission === 'granted';
            }

            if (permissionGranted) {
              const count = dueTasks.length;
              const title = `📅 ${count} 个任务待处理`;
              const body = dueTasks.slice(0, 3).map(t => `• ${t.title}`).join('\n') + (count > 3 ? `\n...等 ${count} 个任务` : '');
              sendNotification({ title, body });
            }
          } catch (error) {
            console.error('Tauri notification error:', error);
          }
        }

        return () => clearTimeout(timer);
      }
    };

    checkStartup();
  }, [isHydrated, allTasks, reminderShown, settings.dueReminderEnabled, settings.dueReminderSnoozeUntil]);

  return (
    <div className={`app theme-${colorScheme}${sidebarCollapsed ? ' sidebar-collapsed' : ''}`}>
      <ProjectSidebar
        onProjectSelected={handleProjectSelected}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
      />
      <main className='main'>
        <div className='main-header'>
          <div className='main-title-block'>
            <div className='main-title'>
              <span>任务看板</span>
            </div>
            <div className='sort-dropdown-container'>
              <button
                className='sort-dropdown-trigger'
                onClick={() => setSortDropdownOpen(!sortDropdownOpen)}
                title='点击切换排序方式'
              >
                {(() => {
                  const primary = sortRules[0];
                  if (!primary) return '默认排序';
                  const keyLabels: Record<string, string> = {
                    dueDate: '截止时间',
                    createdAt: '创建时间',
                    priority: '优先级',
                    status: '状态',
                    title: '标题',
                    project: '项目',
                    updatedAt: '更新时间',
                  };
                  const label = keyLabels[primary.key] || primary.key;
                  return `按${label}${primary.direction === 'asc' ? '升序' : '降序'}`;
                })()}
                <span className='sort-dropdown-arrow'>{sortDropdownOpen ? '▲' : '▼'}</span>
              </button>
              {sortDropdownOpen && (
                <div className='sort-dropdown-menu'>
                  <div
                    className='sort-dropdown-item'
                    onClick={() => {
                      setSortRules([{ key: 'dueDate', direction: 'asc' }]);
                      setSortDropdownOpen(false);
                    }}
                  >
                    📅 按截止时间升序
                  </div>
                  <div
                    className='sort-dropdown-item'
                    onClick={() => {
                      setSortRules([{ key: 'dueDate', direction: 'desc' }]);
                      setSortDropdownOpen(false);
                    }}
                  >
                    📅 按截止时间降序
                  </div>
                  <div
                    className='sort-dropdown-item'
                    onClick={() => {
                      setSortRules([{ key: 'createdAt', direction: 'desc' }]);
                      setSortDropdownOpen(false);
                    }}
                  >
                    🕐 按创建时间降序
                  </div>
                  <div
                    className='sort-dropdown-item'
                    onClick={() => {
                      setSortRules([{ key: 'createdAt', direction: 'asc' }]);
                      setSortDropdownOpen(false);
                    }}
                  >
                    🕐 按创建时间升序
                  </div>
                  <div
                    className='sort-dropdown-item'
                    onClick={() => {
                      setSortRules([{ key: 'priority', direction: 'desc' }]);
                      setSortDropdownOpen(false);
                    }}
                  >
                    🔥 按优先级降序
                  </div>
                  <div
                    className='sort-dropdown-item'
                    onClick={() => {
                      setSortRules([{ key: 'status', direction: 'asc' }]);
                      setSortDropdownOpen(false);
                    }}
                  >
                    📊 按状态升序
                  </div>
                  <div
                    className='sort-dropdown-item'
                    onClick={() => {
                      setSortRules([{ key: 'title', direction: 'asc' }]);
                      setSortDropdownOpen(false);
                    }}
                  >
                    🔤 按标题升序
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 搜索框 */}
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
                      const isOpen = el.style.display !== 'none';
                      el.style.display = isOpen ? 'none' : 'flex';
                      setFilterPanelOpen(!isOpen);
                    }
                  }}
                  aria-label='展开/收起筛选'
                  title='展开/收起筛选'
                >
                  🔍 筛选 {filterPanelOpen ? '▲' : '▼'}
                </button>
                <button
                  className='btn btn-light'
                  onClick={() => setSettingsPanelOpen(true)}
                  aria-label='设置'
                  title='设置'
                >
                  ⚙️ 设置
                </button>
                <button
                  className='btn btn-light'
                  onClick={() => setNotesCenterOpen(true)}
                  aria-label='随记中心'
                  title='随记中心 - 记录灵感，AI 生成任务'
                  style={{ marginLeft: 4 }}
                >
                  📝 随记
                </button>

              </>
            )}
          </div>
        </div>

        <PrimaryToolbar />

        {/* 统计仪表盘 */}
        {!isTrashView && (
          <div className='dashboard-row'>
            <StatsCard
              tasks={projectTasks}
              projectMap={projectMap as any}
              activeFilter={filters.status}
              onFilterByStatus={(status: 'doing' | 'done' | 'paused' | 'all' | 'overdue' | 'dueToday') => {
                if (status === 'all') {
                  setFilters({ statuses: [], status: 'all' });
                } else if (status === 'doing' || status === 'paused' || status === 'done') {
                  setFilters({ statuses: [status], status: status });
                } else {
                  setFilters({ statuses: [], status: status });
                }
              }}
            />
          </div>
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
      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} />
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
      <CloseConfirmModal
        open={closeConfirmOpen}
        onClose={() => setCloseConfirmOpen(false)}
      />
      <TrashSettingsModal
        open={trashSettingsOpen}
        onClose={() => setTrashSettingsOpen(false)}
      />
      <CloudSyncModal
        open={cloudSyncOpen}
        onClose={() => setCloudSyncOpen(false)}
      />
      <RecurringTaskManagerModal
        open={recurringManagerOpen}
        onClose={() => setRecurringManagerOpen(false)}
      />
      <SettingsPanel
        open={settingsPanelOpen}
        onClose={() => setSettingsPanelOpen(false)}
        onImport={() => setImportOpen(true)}
        onExport={() => setExportOpen(true)}
        onBackup={() => setBackupOpen(true)}
        onCloudSync={() => setCloudSyncOpen(true)}
        onRecurringTasks={() => setRecurringManagerOpen(true)}
      />
      {notesCenterOpen && (
        <NotesCenter onClose={() => setNotesCenterOpen(false)} />
      )}
    </div>
  );
}

export default App;
