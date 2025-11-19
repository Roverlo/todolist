import { useEffect, useState } from 'react';
import './App.css';
import { ProjectSidebar } from './components/sidebar/ProjectSidebar';
import { PrimaryToolbar } from './components/toolbar/PrimaryToolbar';
import { TaskTable } from './components/task-table/TaskTable';
import { BulkActionsBar } from './components/bulk/BulkActionsBar';
import { DetailsDrawer } from './components/details/DetailsDrawer';
import { useAppStore } from './state/appStore';
import { SingleTaskModal } from './components/toolbar/SingleTaskModal';
import { ProgressModal } from './components/task/ProgressModal';

function App() {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [progressOpen, setProgressOpen] = useState(false);
  const colorScheme = useAppStore((state) => state.settings.colorScheme);
  const undo = useAppStore((state) => state.undo);
  const redo = useAppStore((state) => state.redo);

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

  return (
    <div className={`app-shell theme-${colorScheme} theme-high-contrast`}>
      <ProjectSidebar onProjectSelected={() => setSelectedIds([])} />
      <main>
        <PrimaryToolbar />
        <TaskTable
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
          onTaskFocus={(taskId) => {
            setActiveTaskId(taskId);
          }}
          onOpenProgress={(taskId) => {
            setActiveTaskId(taskId);
            setProgressOpen(true);
          }}
        />
        <BulkActionsBar selectedIds={selectedIds} onClear={() => setSelectedIds([])} />
        
      </main>
      <DetailsDrawer open={drawerOpen} taskId={activeTaskId} onClose={() => setDrawerOpen(false)} />
      <SingleTaskModal open={addOpen} onClose={() => setAddOpen(false)} />
      <ProgressModal open={progressOpen} taskId={activeTaskId} onClose={() => setProgressOpen(false)} />
    </div>
  );
}

export default App;
