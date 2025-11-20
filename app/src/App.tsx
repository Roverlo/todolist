import { useEffect, useState } from 'react';
import './App.css';
import { ProjectSidebar } from './components/sidebar/ProjectSidebar';
import { PrimaryToolbar } from './components/toolbar/PrimaryToolbar';
import { TaskTable } from './components/task-table/TaskTable';
import { DetailsDrawer } from './components/details/DetailsDrawer';
import { useAppStore } from './state/appStore';
import { SingleTaskModal } from './components/toolbar/SingleTaskModal';
import { ProgressModal } from './components/task/ProgressModal';

function App() {
  
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [progressOpen, setProgressOpen] = useState(false);
  const colorScheme = useAppStore((state) => state.settings.colorScheme);
  const undo = useAppStore((state) => state.undo);
  const redo = useAppStore((state) => state.redo);
  const updateRightGutter = () => {
    const el = document.createElement('div');
    el.style.width = '100px';
    el.style.height = '100px';
    el.style.overflow = 'scroll';
    el.style.position = 'absolute';
    el.style.top = '-9999px';
    document.body.appendChild(el);
    const sw = el.offsetWidth - el.clientWidth;
    document.body.removeChild(el);
    const base = Math.max(sw, 16) + 32;
    const val = drawerOpen ? base + 360 : base;
    document.body.style.setProperty('--right-gutter', `${val}px`);
  };

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
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
    updateRightGutter();
    const onResize = () => updateRightGutter();
    window.addEventListener('resize', onResize);
    const dpiObserver = setInterval(() => updateRightGutter(), 500);
    return () => {
      window.removeEventListener('resize', onResize);
      clearInterval(dpiObserver);
    };
  }, [drawerOpen]);

  return (
    <div className={`app-shell theme-${colorScheme} theme-high-contrast ${drawerOpen ? 'drawer-open' : ''}`}>
      <ProjectSidebar onProjectSelected={() => {}} />
      <main>
        <PrimaryToolbar />
        <TaskTable
          onTaskFocus={(taskId) => {
            setActiveTaskId(taskId);
          }}
          onOpenProgress={(taskId) => {
            setActiveTaskId(taskId);
            setProgressOpen(true);
          }}
        />
        
      </main>
      <DetailsDrawer open={drawerOpen} taskId={activeTaskId} onClose={() => setDrawerOpen(false)} />
      <SingleTaskModal open={addOpen} onClose={() => setAddOpen(false)} />
      <ProgressModal open={progressOpen} taskId={activeTaskId} onClose={() => setProgressOpen(false)} />
    </div>
  );
}

export default App;
