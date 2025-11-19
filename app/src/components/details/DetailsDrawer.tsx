import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import dayjs from 'dayjs';
import { useAppStoreShallow } from '../../state/appStore';
import type { Attachment } from '../../types';

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

  const handleAttachmentChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files?.length) return;
    const attachments = [...(task.attachments ?? [])];
    for (const file of Array.from(files)) {
      if (file.size > 10 * 1024 * 1024) {
        alert(`${file.name} exceeds 10MB, skipped.`);
        continue;
      }
      const dataUrl = await fileToDataUrl(file);
      attachments.push({
        id: crypto.randomUUID(),
        name: file.name,
        size: file.size,
        type: file.type,
        dataUrl,
        createdAt: Date.now(),
      });
    }
    updateTask(task.id, { attachments });
  };

  

  const removeAttachment = (attachment: Attachment) => {
    const filtered = (task.attachments ?? []).filter((item) => item.id !== attachment.id);
    updateTask(task.id, { attachments: filtered });
  };

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
          <h4>Attachments</h4>
          <input type='file' multiple onChange={handleAttachmentChange} />
          <ul className='attachment-list'>
            {(task.attachments ?? []).map((attachment) => (
              <li key={attachment.id}>
                <span>
                  {attachment.name} · {(attachment.size / 1024).toFixed(1)} KB
                </span>
                <div>
                  {attachment.dataUrl && (
                    <a href={attachment.dataUrl} download={attachment.name}>
                      Download
                    </a>
                  )}
                  <button type='button' onClick={() => removeAttachment(attachment)}>
                    Delete
                  </button>
                </div>
              </li>
            ))}
            {!task.attachments?.length && <li className='muted'>No attachments</li>}
          </ul>
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
                {!!p.attachments?.length && (
                  <ul className='attachment-list'>
                    {p.attachments.map((a) => (
                      <li key={a.id}>
                        <a href={a.dataUrl} download={a.name}>{a.name}</a>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
            {!task.progress?.length && <li className='muted'>暂无进展记录</li>}
          </ul>
        </section>
      </div>
    </aside>
  );
};

const fileToDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (error) => reject(error);
    reader.readAsDataURL(file);
  });
