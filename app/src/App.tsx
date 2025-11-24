import { useEffect, useMemo, useState } from 'react';
import './App.css';
import { ProjectSidebar } from './components/sidebar/ProjectSidebar';
import { PrimaryToolbar } from './components/toolbar/PrimaryToolbar';
import { TaskTable } from './components/task-table/TaskTable';
import { DetailsDrawer } from './components/details/DetailsDrawer';
import { useAppStore } from './state/appStore';
import { SingleTaskModal } from './components/toolbar/SingleTaskModal';
import { RecurringTaskModal } from './components/toolbar/RecurringTaskModal';
import { ExportModal } from './components/toolbar/ExportModal';
import { useVisibleTasks } from './hooks/useVisibleTasks';

function App() {
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [recurringOpen, setRecurringOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const colorScheme = useAppStore((state) => state.settings.colorScheme);
  const undo = useAppStore((state) => state.undo);
  const redo = useAppStore((state) => state.redo);
  const purgeTrash = useAppStore((state) => state.purgeTrash);
  const { tasks, projectMap } = useVisibleTasks();

  const metrics = useMemo(() => {
    const doing = tasks.filter((t) => t.status === 'doing').length;
    return { total: tasks.length, doing };
  }, [tasks]);

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
      if (event.ctrlKey && event.key.toLowerCase() === 'n') {
        event.preventDefault();
        setAddOpen(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [undo, redo]);

  useEffect(() => {
    return () => {};
  }, [drawerOpen]);

  return (
    <div className={`app theme-${colorScheme}`}>
      <ProjectSidebar onProjectSelected={() => setDrawerOpen(false)} />
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
            <button
              className='btn btn-outline'
              onClick={() => setAddOpen(true)}
              aria-label='新建单次任务'
            >
              新建单次任务
            </button>
            <button
              className='btn btn-outline'
              onClick={() => setRecurringOpen(true)}
              aria-label='新建周期任务'
            >
              新建周期任务
            </button>
            <button
              className='btn btn-light'
              onClick={() => setExportOpen(true)}
              aria-label='导出当前筛选'
            >
              导出
            </button>
          </div>
        </div>

        <PrimaryToolbar />

        <section className='content'>
          <div className='content-header'>
            <div className='content-header-left'>
              <div className='content-header-title'>DOING</div>
              <div className='content-header-sub'>共 {tasks.length} 条任务 · 按截止时间升序</div>
            </div>
          
          </div>

          <TaskTable
            onTaskFocus={(taskId) => {
              setActiveTaskId(taskId);
              setDrawerOpen(true);
            }}
          />
        </section>
      </main>

      <DetailsDrawer open={drawerOpen} taskId={activeTaskId} onClose={() => setDrawerOpen(false)} />
      <SingleTaskModal open={addOpen} onClose={() => setAddOpen(false)} />
      <RecurringTaskModal open={recurringOpen} onClose={() => setRecurringOpen(false)} />
      <ExportModal
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        tasks={tasks}
        projectMap={projectMap}
      />
    </div>
  );
}

export default App;
