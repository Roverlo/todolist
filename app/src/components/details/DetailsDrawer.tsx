import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import dayjs from 'dayjs';
import { useAppStoreShallow } from '../../state/appStore';

interface DetailsDrawerProps {
  open: boolean;
  taskId?: string | null;
  onClose: () => void;
}

export const DetailsDrawer = ({ open, taskId, onClose }: DetailsDrawerProps) => {
  const { tasks, projects, updateTask } = useAppStoreShallow((state) => ({
    tasks: state.tasks,
    projects: state.projects,
    updateTask: state.updateTask,
  }));

  const task = useMemo(() => tasks.find((item) => item.id === taskId), [tasks, taskId]);
  const project = useMemo(
    () => projects.find((item) => item.id === task?.projectId),
    [projects, task?.projectId],
  );

  const [notes, setNotes] = useState(task?.notes ?? '');
  const [nextStep, setNextStep] = useState(task?.nextStep ?? '');

  useEffect(() => {
    setNotes(task?.notes ?? '');
    setNextStep(task?.nextStep ?? '');
  }, [task]);

  if (!task) {
    return (
      <aside className={clsx('details-drawer', { open })}>
        <header>
          <h3>Details</h3>
          <button type='button' onClick={onClose}>
            ×
          </button>
        </header>
        <div className='drawer-body'>Select a task to see more information.</div>
      </aside>
    );
  }

  

  const saveNotes = () => {
    updateTask(task.id, { notes, nextStep });
  };

  return (
    <aside className={clsx('details-drawer', { open })}>
      <header>
        <div>
          <h3>{task.title}</h3>
          <p className='muted'>{project?.name ?? 'Unassigned project'}</p>
        </div>
        <button type='button' onClick={onClose}>
          ×
        </button>
      </header>
      <div className='drawer-body'>
        <section>
          <h4>Summary</h4>
          <div className='meta-grid'>
            <label>
              Status
              <span>{task.status}</span>
            </label>
            <label>
              Priority
              <span>{task.priority ?? '-'}</span>
            </label>
            <label>
              Due
              <span>
                {task.dueDate ?? '--'}
              </span>
            </label>
          </div>
        </section>
        <section>
          <h4>Next Step & Notes</h4>
          <textarea
            rows={3}
            value={nextStep}
            placeholder='Next step'
            onChange={(event) => setNextStep(event.target.value)}
          />
          <textarea
            rows={5}
            value={notes}
            placeholder='Notes'
            onChange={(event) => setNotes(event.target.value)}
          />
          <button type='button' onClick={saveNotes}>
            Save
          </button>
        </section>
        
        <section>
          
        </section>
        <section>
          <h4>History</h4>
          <ul className='history-list'>
            {(task.history ?? []).slice(-10).map((log) => (
              <li key={log.id}>
                <div>{dayjs(log.at).format('YYYY-MM-DD HH:mm')}</div>
                <ul>
                  {log.changes.map((change, idx) => (
                    <li key={idx}>
                      {change.field}: {String(change.from ?? '')} → {String(change.to ?? '')}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
            {!task.history?.length && <li className='muted'>No history</li>}
          </ul>
        </section>
        <section>
          <h4>进度时间轴</h4>
          <ul className='history-list'>
            {(task.progress ?? []).map((p) => (
              <li key={p.id}>
                <div>{dayjs(p.at).format('YYYY-MM-DD')}</div>
                <div>{p.status}</div>
                <div>{p.note}</div>
                
              </li>
            ))}
            {!task.progress?.length && <li className='muted'>暂无进展记录</li>}
          </ul>
        </section>
      </div>
    </aside>
  );
};

