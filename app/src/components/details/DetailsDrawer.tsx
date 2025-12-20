import { useEffect, useMemo, useRef, useState, useLayoutEffect, useCallback } from 'react';
import dayjs from 'dayjs';
import { useAppStoreShallow } from '../../state/appStore';
import type { Priority, ProgressEntry, Status, Subtask } from '../../types';
import { CustomSelect } from '../ui/CustomSelect';
import { SubtaskList } from '../ui/SubtaskList';

import { mergeOwners } from '../../utils/taskUtils';

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
  const { tasks, projects, updateTask, dictionary } = useAppStoreShallow((state) => ({
    tasks: state.tasks,
    projects: state.projects,
    updateTask: state.updateTask,
    dictionary: state.dictionary,
  }));

  const task = useMemo(() => tasks.find((item) => item.id === taskId), [tasks, taskId]);

  const [title, setTitle] = useState('');
  const [projectId, setProjectId] = useState('');
  const [status, setStatus] = useState<Status>('doing');
  const [priority, setPriority] = useState<Priority>('medium');
  const [dueDate, setDueDate] = useState('');
  const [owners, setOwners] = useState('');
  const [notes, setNotes] = useState('');
  const [nextStep, setNextStep] = useState('');
  const [progress, setProgress] = useState<ProgressEntry[]>([]);
  const [subtasks, setSubtasks] = useState<Subtask[]>([]);
  const [progressNote, setProgressNote] = useState('');
  const [progressTime, setProgressTime] = useState(() => dayjs().format('YYYY-MM-DDTHH:mm'));
  const [editingProgressId, setEditingProgressId] = useState<string | null>(null);
  const [isSubtasksExpanded, setIsSubtasksExpanded] = useState(true);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'idle'>('idle');

  const saveTimeoutRef = useRef<number | null>(null);

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
      setTitle(task.title);
      setProjectId(task.projectId);
      setStatus(task.status);
      setPriority(task.priority ?? 'medium');
      setDueDate(task.dueDate ?? '');
      // 迁移兼容：优先使用新的owners字段，否则合并旧字段
      const migratedOwners = task.owners ?? [task.onsiteOwner, task.lineOwner].filter(Boolean).join('/');
      setOwners(migratedOwners);
      setNotes(task.notes ?? '');
      setNextStep(task.nextStep ?? '');
      const sorted = [...(task.progress ?? [])].sort((a, b) => a.at - b.at);
      setProgress(sorted);
      setSubtasks(task.subtasks ?? []);
      setProgressNote('');
      setProgressTime(dayjs().format('YYYY-MM-DDTHH:mm'));
      setEditingProgressId(null);

      resize(notesRef.current);
      resize(nextRef.current);
      resize(progressRef.current);
    }
  }, [task]);

  // 防抖自动保存函数 - 必须在 early return 之前定义
  const debouncedSave = useCallback(() => {
    if (!task || !title.trim()) return;

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    setSaveStatus('saving');
    saveTimeoutRef.current = window.setTimeout(() => {
      updateTask(task.id, {
        title: title.trim(),
        projectId,
        status,
        priority,
        dueDate: dueDate || undefined,
        owners: owners || undefined,
        notes,
        nextStep,
        progress,
        subtasks,
      });
      setSaveStatus('saved');
      // 3秒后重置状态
      setTimeout(() => setSaveStatus('idle'), 3000);
    }, 1000);
  }, [task, title, projectId, status, priority, dueDate, owners, notes, nextStep, progress, subtasks, updateTask]);



  // 监听字段变化自动保存 - 必须在 early return 之前定义
  useEffect(() => {
    if (!task) return;
    // 跳过初始化
    if (title === task.title &&
      projectId === task.projectId &&
      status === task.status &&
      priority === (task.priority ?? 'medium') &&
      dueDate === (task.dueDate ?? '') &&
      notes === (task.notes ?? '') &&
      nextStep === (task.nextStep ?? '')) {
      return;
    }
    debouncedSave();
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [title, projectId, status, priority, dueDate, owners, notes, nextStep, task, debouncedSave]);

  // Early return 必须在所有 hooks 之后
  if (!open || !task) return null;

  const dueLabel = () => {
    if (!task.dueDate) return '无截止日期';
    const diff = dayjs(task.dueDate).startOf('day').diff(dayjs().startOf('day'), 'day');
    if (diff === 0) return '今日到期';
    if (diff > 0) return `剩余 ${diff} 天`;
    return `逾期 ${Math.abs(diff)} 天`;
  };



  const handleSubtasksChange = (newSubtasks: Subtask[]) => {
    setSubtasks(newSubtasks);
    // 合并子任务责任人到主任务
    const mergedOwners = mergeOwners(owners, newSubtasks);
    if (mergedOwners !== owners) {
      setOwners(mergedOwners);
    }
    // 实时保存子任务更改
    updateTask(task.id, { subtasks: newSubtasks, owners: mergedOwners });

    // 子任务联动：当所有子任务都完成时，自动将主任务标记为已完成
    const allCompleted = newSubtasks.length > 0 && newSubtasks.every(s => s.completed);
    if (allCompleted && status !== 'done') {
      setStatus('done');
      updateTask(task.id, { status: 'done', subtasks: newSubtasks, owners: mergedOwners });
    }
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
      owners: owners || undefined,
      notes,
      nextStep,
      progress: nextList,
    });
  };

  const handleDeleteProgress = (id: string) => {
    const updatedProgress = progress.filter((p) => p.id !== id);
    setProgress(updatedProgress);
    if (editingProgressId === id) {
      setEditingProgressId(null);
      setProgressNote('');
      setProgressTime(dayjs().format('YYYY-MM-DDTHH:mm'));
    }
    // 立即持久化删除
    updateTask(task!.id, {
      title: title.trim(),
      projectId,
      status,
      priority,
      dueDate: dueDate || undefined,
      owners: owners || undefined,
      notes,
      nextStep,
      progress: updatedProgress,
    });
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
            <div className='field' style={{ marginBottom: 18 }}>
              <label className='field-label'>
                任务标题<span>*</span>
              </label>
              <input
                className='field-input'
                type='text'
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder='请输入任务标题'
                maxLength={100}
                style={{ fontSize: '15px', fontWeight: 600 }}
              />
            </div>

            <section className='section'>
              <div className='section-title-row'>
                <div className='section-title'>属性</div>
                <div className='section-hint'>管理任务的基本属性。</div>
              </div>
              <div className='field-grid-3'>
                <div className='field'>
                  <label className='field-label'>
                    所属项目<span>*</span>
                  </label>
                  <CustomSelect
                    value={projectId}
                    options={projects.filter(p => p.name !== '回收站').map(p => ({ value: p.id, label: p.name }))}
                    onChange={(val) => setProjectId(val)}
                    placeholder='选择项目'
                  />
                </div>
                <div className='field'>
                  <label className='field-label'>
                    任务状态<span>*</span>
                  </label>
                  <CustomSelect
                    value={status}
                    options={statusOptions}
                    onChange={(val) => setStatus(val as Status)}
                    placeholder='选择状态'
                  />
                </div>
                <div className='field'>
                  <label className='field-label'>
                    优先级<span>*</span>
                  </label>
                  <CustomSelect
                    value={priority}
                    options={priorityOptions}
                    onChange={(val) => setPriority(val as Priority)}
                    placeholder='选择优先级'
                  />
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
                  <label className='field-label'>责任人</label>
                  <input
                    className='field-input'
                    type='text'
                    value={owners}
                    onChange={(event) => setOwners(event.target.value)}
                    placeholder='例如：张三/李四'
                  />
                </div>
              </div>
            </section>

            <section className='section'>
              <div
                className='section-title-row'
                onClick={() => setIsSubtasksExpanded(!isSubtasksExpanded)}
                style={{ cursor: 'pointer', userSelect: 'none' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div className='section-title'>
                    ☑️ 子任务
                    <span style={{
                      marginLeft: '6px',
                      fontSize: '12px',
                      transition: 'transform 0.2s ease',
                      display: 'inline-block',
                      transform: isSubtasksExpanded ? 'rotate(0deg)' : 'rotate(-90deg)',
                      opacity: 0.6
                    }}>
                      ▼
                    </span>
                  </div>
                  {subtasks.length > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }} onClick={(e) => e.stopPropagation()}>
                      <div style={{ width: '80px', height: '5px', background: '#f3f4f6', borderRadius: '3px', overflow: 'hidden', border: '1px solid #e5e7eb' }}>
                        <div style={{
                          width: `${Math.round((subtasks.filter(s => s.completed).length / subtasks.length) * 100)}%`,
                          height: '100%',
                          background: '#10b981',
                          transition: 'width 0.3s ease'
                        }} />
                      </div>
                      <span style={{ fontSize: '11px', color: '#9ca3af', fontWeight: 500 }}>
                        {Math.round((subtasks.filter(s => s.completed).length / subtasks.length) * 100)}%
                      </span>
                    </div>
                  )}
                </div>
                <div className='section-hint'>拆分任务为可执行的小步骤。</div>
              </div>
              {isSubtasksExpanded && (
                <SubtaskList
                  subtasks={subtasks}
                  onChange={handleSubtasksChange}
                  hideProgress={true}
                  owners={[...new Set([...(owners || '').split('/').filter(Boolean), ...dictionary.onsiteOwners, ...dictionary.lineOwners])]}
                />
              )}
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
                <label className='field-label'>
                  下一步计划
                </label>
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
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <label className='field-label' style={{ marginBottom: 0 }}>记录时间</label>
                  <button
                    type='button'
                    onClick={() => setProgressTime(dayjs().format('YYYY-MM-DDTHH:mm'))}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#2563eb',
                      fontSize: '12px',
                      cursor: 'pointer',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = '#eff6ff'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
                    title="重置为当前时间"
                  >
                    <span>🕒</span> 设为当前
                  </button>
                </div>
                <input
                  className='field-input'
                  type='datetime-local'
                  value={progressTime}
                  onChange={(event) => setProgressTime(event.target.value)}
                  style={{ fontFamily: 'inherit' }}
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
              <div className='timeline-list'>
                {(() => {
                  const sorted = [...progress].sort((a, b) => b.at - a.at);
                  return sorted.map((p, idx) => (
                    <div className={`timeline-item ${idx === 0 ? 'latest' : ''}`} key={p.id}>
                      <div className='timeline-left'>
                        <div className='timeline-icon'></div>
                        {idx !== sorted.length - 1 && <div className='timeline-line'></div>}
                      </div>
                      <div className='timeline-content'>
                        <div className='timeline-header'>
                          <div className='timeline-time'>{dayjs(p.at).format('YYYY-MM-DD HH:mm')}</div>
                          <div className='timeline-actions'>
                            <button type='button' className='icon-btn' onClick={() => handleEditProgress(p.id)}>
                              编辑
                            </button>
                            <button type='button' className='icon-btn danger' onClick={() => handleDeleteProgress(p.id)}>
                              删除
                            </button>
                          </div>
                        </div>
                        <div className='timeline-body'>{p.note}</div>
                      </div>
                    </div>
                  ));
                })()}
                {!progress.length && (
                  <div className='muted' style={{ padding: '20px', textAlign: 'center' }}>暂无更多记录</div>
                )}
              </div>
            </section>
          </aside>
        </div>

        <footer className='dialog-footer'>
          <div className='footer-meta'>
            <span>上次更新：{lastUpdated}</span>
            {saveStatus === 'saving' && (
              <span className='save-indicator saving'>正在保存...</span>
            )}
            {saveStatus === 'saved' && (
              <span className='save-indicator saved'>✓ 已自动保存</span>
            )}
          </div>
          <div className='footer-actions'>
            <button className='btn btn-primary-outline' type='button' onClick={onClose}>
              关闭
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
};
