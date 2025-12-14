import { useEffect, useMemo, useState, useCallback } from 'react';
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
  const colorScheme = useAppStore((state) => state.settings.colorScheme);
  const undo = useAppStore((state) => state.undo);
  const redo = useAppStore((state) => state.redo);
  const purgeTrash = useAppStore((state) => state.purgeTrash);
  const emptyTrash = useAppStore((state) => state.emptyTrash);

  // 主题切换
  useEffect(() => {
    const theme = colorScheme || 'blue';
    document.documentElement.setAttribute('data-theme', theme);
  }, [colorScheme]);

  const { tasks, projectMap } = useVisibleTasks();
  const projects = useAppStore((state) => state.projects);
  const filters = useAppStore((state) => state.filters);

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
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [undo, redo, activeTaskId]);

  useEffect(() => {
    return () => { };
  }, [drawerOpen]);

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
                  onClick={() => setAddOpen(true)}
                  aria-label='新建单次任务'
                >
                  新建单次任务
                </button>
                <button
                  className='btn btn-primary-bold'
                  onClick={() => setRecurringOpen(true)}
                  aria-label='新建周期任务'
                >
                  新建周期任务
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
              </>
            )}
          </div>
        </div>

        <PrimaryToolbar />

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
        projectMap={projectMap as any}
      />
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <ThemeModal open={themeOpen} onClose={() => setThemeOpen(false)} />
      <FontSizeModal open={fontSizeOpen} onClose={() => setFontSizeOpen(false)} />
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
