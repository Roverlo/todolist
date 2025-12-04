import { useEffect, useMemo, useRef, useState, useLayoutEffect } from 'react';
import clsx from 'clsx';
import dayjs from 'dayjs';
import { useAppStoreShallow } from '../../state/appStore';
import type { Priority, ProgressEntry, Status } from '../../types';

interface DetailsDrawerProps {
  open: boolean;
  taskId?: string | null;
  onClose: () => void;
}

const statusOptions: { value: Status; label: string }[] = [
  { value: 'doing', label: '进行中' },
  { value: 'paused', label: '挂起' },
  { value: 'done', label: '已完成' },
];

const priorityOptions: { value: Priority; label: string; tone?: 'danger' }[] = [
  { value: 'high', label: '高', tone: 'danger' },
  { value: 'medium', label: '中' },
  { value: 'low', label: '低' },
];

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

  const [status, setStatus] = useState<Status>('doing');
  const [priority, setPriority] = useState<Priority>('medium');
  const [dueDate, setDueDate] = useState('');
  const [onsiteOwner, setOnsiteOwner] = useState('');
  const [lineOwner, setLineOwner] = useState('');
  const [notes, setNotes] = useState('');
  const [nextStep, setNextStep] = useState('');
  const [progress, setProgress] = useState<ProgressEntry[]>([]);
  const [progressNote, setProgressNote] = useState('');
  const [progressTime, setProgressTime] = useState(() => dayjs().format('YYYY-MM-DDTHH:mm'));
  const [editingProgressId, setEditingProgressId] = useState<string | null>(null);

  const notesRef = useRef<HTMLTextAreaElement | null>(null);
  const nextRef = useRef<HTMLTextAreaElement | null>(null);
  const progressRef = useRef<HTMLTextAreaElement | null>(null);

  const resize = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  };

  useLayoutEffect(() => {
    resize(notesRef.current);
    resize(nextRef.current);
    resize(progressRef.current);
  }, [notes, nextStep, progressNote, open]);

  useEffect(() => {
    if (task) {
      setStatus(task.status);
      setPriority(task.priority ?? 'medium');
      setDueDate(task.dueDate ?? '');
      setOnsiteOwner(task.onsiteOwner ?? '');
      setLineOwner(task.lineOwner ?? '');
      setNotes(task.notes ?? '');
      setNextStep(task.nextStep ?? '');
      const sorted = [...(task.progress ?? [])].sort((a, b) => a.at - b.at);
      setProgress(sorted);
      setProgressNote('');
      setProgressTime(dayjs().format('YYYY-MM-DDTHH:mm'));
      setEditingProgressId(null);
      resize(notesRef.current);
      resize(nextRef.current);
      resize(progressRef.current);
    }
  }, [task]);

  if (!open || !task) return null;

  const dueLabel = () => {
    if (!task.dueDate) return '无截止日期';
    const diff = dayjs(task.dueDate).startOf('day').diff(dayjs().startOf('day'), 'day');
    if (diff === 0) return '今日到期';
    if (diff > 0) return `剩余 ${diff} 天`;
    return `逾期 ${Math.abs(diff)} 天`;
  };

  const handleSaveTask = () => {
    updateTask(task.id, {
      status,
      priority,
      dueDate: dueDate || undefined,
      onsiteOwner: onsiteOwner || undefined,
      lineOwner: lineOwner || undefined,
      notes,
      nextStep,
      progress,
    });
    onClose();
  };

  const handleAddOrUpdateProgress = (_stayEditing: boolean) => {
    if (!progressNote.trim()) return;
    const at = dayjs(progressTime).valueOf();
    const nextList: ProgressEntry[] = editingProgressId
      ? progress
          .map((p): ProgressEntry => (p.id === editingProgressId ? { ...p, note: progressNote.trim(), at } : p))
          .sort((a, b) => a.at - b.at)
      : [...progress, { id: `${Date.now()}`, at, status: 'doing' as const, note: progressNote.trim() }].sort(
          (a, b) => a.at - b.at,
        );

    setProgress(nextList);
    setEditingProgressId(null);
    setProgressNote('');
    setProgressTime(dayjs().format('YYYY-MM-DDTHH:mm'));

    // 立即持久化到 store，但不关闭抽屉，方便继续填写
    updateTask(task!.id, {
      status,
      priority,
      dueDate: dueDate || undefined,
      onsiteOwner: onsiteOwner || undefined,
      lineOwner: lineOwner || undefined,
      notes,
      nextStep,
      progress: nextList,
    });
  };

  const handleDeleteProgress = (id: string) => {
    setProgress((prev) => prev.filter((p) => p.id !== id));
    if (editingProgressId === id) {
      setEditingProgressId(null);
      setProgressNote('');
      setProgressTime(dayjs().format('YYYY-MM-DDTHH:mm'));
    }
  };

  const handleEditProgress = (id: string) => {
    const entry = progress.find((p) => p.id === id);
    if (!entry) return;
    setEditingProgressId(id);
    setProgressNote(entry.note);
    setProgressTime(dayjs(entry.at).format('YYYY-MM-DDTHH:mm'));
  };

  const lastUpdated = dayjs(task.updatedAt).format('YYYY-MM-DD HH:mm');

  return (
    <div className='overlay'>
      <div className='dialog-shell' onClick={(e) => e.stopPropagation()}>
        <header className='dialog-header'>
          <div className='task-title-block'>
            <div className='task-project'>{project?.name ?? '未分类项目'}</div>
            <div className='task-title'>{task.title}</div>
            <div className='task-chips'>
              <span className='chip chip-primary'>{statusOptions.find((s) => s.value === status)?.label}</span>
              <span className='chip chip-danger-soft'>
                {priorityOptions.find((p) => p.value === priority)?.label} · {dueLabel()}
              </span>
            </div>
          </div>
          <button className='btn-icon' aria-label='关闭' type='button' onClick={onClose}>
            ✕
          </button>
        </header>

        <div className='dialog-body'>
          <main className='panel-main'>
            <section className='section'>
              <div className='section-title-row'>
                <div className='section-title'>基本信息</div>
                <div className='section-hint'>调整状态、优先级和截止日期。</div>
              </div>
              <div className='field-grid'>
                <div className='field'>
                  <label className='field-label'>
                    任务状态<span>*</span>
                  </label>
                  <div className='pill-select'>
                    {statusOptions.map((opt) => (
                      <button
                        key={opt.value}
                        type='button'
                        className={clsx('pill-option', { 'is-active': status === opt.value })}
                        onClick={() => setStatus(opt.value)}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className='field'>
                  <label className='field-label'>
                    优先级<span>*</span>
                  </label>
                  <div className='pill-select'>
                    {priorityOptions.map((opt) => (
                      <button
                        key={opt.value}
                        type='button'
                        className={clsx('pill-option', {
                          'is-active': priority === opt.value,
                          'is-danger': opt.value === 'high',
                        })}
                        onClick={() => setPriority(opt.value)}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className='field'>
                  <label className='field-label'>
                    截止日期<span>*</span>
                  </label>
                  <input
                    className='field-input'
                    type='date'
                    value={dueDate}
                    onChange={(event) => setDueDate(event.target.value)}
                  />
                </div>
                <div className='field'>
                  <label className='field-label'>现场责任人</label>
                  <input
                    className='field-input'
                    type='text'
                    value={onsiteOwner}
                    onChange={(event) => setOnsiteOwner(event.target.value)}
                    placeholder='例如：张三'
                  />
                </div>
                <div className='field'>
                  <label className='field-label'>产线责任人</label>
                  <input
                    className='field-input'
                    type='text'
                    value={lineOwner}
                    onChange={(event) => setLineOwner(event.target.value)}
                    placeholder='例如：李四'
                  />
                </div>
              </div>
            </section>

            <section className='section'>
              <div className='section-title-row'>
                <div className='section-title'>详情 &amp; 下一步计划</div>
                <div className='section-hint'>简单写清当前情况，以及下一步要做什么。</div>
              </div>
              <div className='field' style={{ marginBottom: 10 }}>
                <label className='field-label'>
                  详情<span>*</span>
                </label>
                <textarea
                  className='field-textarea'
                  value={notes}
                  ref={notesRef}
                  onChange={(event) => {
                    setNotes(event.target.value);
                    resize(notesRef.current);
                  }}
                  placeholder='例如：当前已经完成了哪些工作，还有哪些待处理…'
                />
              </div>
              <div className='field'>
                <label className='field-label'>下一步计划</label>
                <textarea
                  className='field-textarea'
                  value={nextStep}
                  ref={nextRef}
                  onChange={(event) => {
                    setNextStep(event.target.value);
                    resize(nextRef.current);
                  }}
                  placeholder='例如：下周一前补齐案例，并提交知识库…'
                />
              </div>
            </section>
          </main>

          <aside className='panel-progress'>
            <section className='section'>
              <div className='section-title-row'>
                <div className='section-title'>记录进展</div>
                <div className='section-hint'>一条记录对应一次关键动作。</div>
              </div>
              <div className='field' style={{ marginBottom: 8 }}>
                <label className='field-label'>记录时间</label>
                <input
                  className='field-input'
                  type='datetime-local'
                  value={progressTime}
                  onChange={(event) => setProgressTime(event.target.value)}
                />
              </div>
              <div className='field' style={{ marginBottom: 10 }}>
                <label className='field-label'>
                  进展说明<span>*</span>
                </label>
                <textarea
                  className='field-textarea'
                  value={progressNote}
                  ref={progressRef}
                  onChange={(event) => {
                    setProgressNote(event.target.value);
                    resize(progressRef.current);
                  }}
                  placeholder='例如：已完成环境部署，正在联调接口…'
                />
              </div>
              <div className='footer-actions' style={{ justifyContent: 'flex-end', marginBottom: 10 }}>
                <button className='btn btn-primary-outline' type='button' onClick={() => handleAddOrUpdateProgress(false)}>
                  {editingProgressId ? '更新进展' : '添加该进展到记录'}
                </button>
              </div>
            </section>

            <section className='section'>
              <div className='section-title-row'>
                <div className='section-title'>全部进展记录</div>
                <div className='section-hint'>按时间倒序展示，点击右侧操作可修改或删除。</div>
              </div>
              <div className='timeline'>
                {[...progress].sort((a, b) => b.at - a.at).map((p) => (
                  <div className='timeline-item' key={p.id}>
                    <div className='timeline-item-header'>
                      <div className='timeline-item-label'>{dayjs(p.at).format('YYYY-MM-DD HH:mm')}</div>
                      <div className='timeline-item-actions'>
                        <button className='link-action' type='button' onClick={() => handleEditProgress(p.id)}>
                          编辑
                        </button>
                        <button
                          className='link-action danger'
                          type='button'
                          onClick={() => handleDeleteProgress(p.id)}
                        >
                          删除
                        </button>
                      </div>
                    </div>
                    <div className='timeline-item-text'>{p.note}</div>
                  </div>
                ))}
                {!progress.length && (
                  <div className='timeline-item'>
                    <div className='timeline-item-label'>暂无更多记录</div>
                  </div>
                )}
              </div>
            </section>
          </aside>
        </div>

        <footer className='dialog-footer'>
          <div className='footer-meta'>上次更新：{lastUpdated}</div>
          <div className='footer-actions'>
            <button className='btn btn-ghost' type='button' onClick={onClose}>
              取消
            </button>
            <button className='btn btn-primary-outline' type='button' onClick={handleSaveTask}>
              保存修改
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
};
