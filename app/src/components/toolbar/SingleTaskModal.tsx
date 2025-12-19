import { useEffect, useState } from 'react';
import { useAppStoreShallow } from '../../state/appStore';
import type { Priority, Status, Subtask } from '../../types';
import { CustomSelect } from '../ui/CustomSelect';
import { SubtaskList } from '../ui/SubtaskList';

interface SingleTaskModalProps {
  open: boolean;
  onClose: () => void;
}

const statusOptions: { value: Status; label: string }[] = [
  { value: 'doing', label: '进行中' },
  { value: 'paused', label: '挂起' },
  { value: 'done', label: '已完成' },
];

const priorityOptions: { value: Priority; label: string }[] = [
  { value: 'medium', label: '中' },
  { value: 'high', label: '高' },
  { value: 'low', label: '低' },
];

export const SingleTaskModal = ({ open, onClose }: SingleTaskModalProps) => {
  const { projects, addTask, ensureProjectByName, dictionary, filters } = useAppStoreShallow((state) => ({
    projects: state.projects,
    addTask: state.addTask,
    ensureProjectByName: state.ensureProjectByName,
    dictionary: state.dictionary,
    filters: state.filters,
  }));

  const [projectId, setProjectId] = useState(projects[0]?.id ?? '');
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<Status>('doing');
  const [priority, setPriority] = useState<Priority>('medium');
  const [dueDate, setDueDate] = useState('');
  const [owners, setOwners] = useState('');
  const [nextStep, setNextStep] = useState('');
  const [subtasks, setSubtasks] = useState<Subtask[]>([]);
  const [isSubtasksExpanded, setIsSubtasksExpanded] = useState(true);
  const [error, setError] = useState('');

  // Project options for CustomSelect
  const projectOptions = projects.map((p) => ({ value: p.id, label: p.name }));

  useEffect(() => {
    if (open) {
      const selected = projects.find((p) => p.id === filters.projectId);
      const isTrash = selected?.name === '回收站';
      const defaultId = !isTrash && selected ? selected.id : projects[0]?.id ?? '';
      setProjectId(defaultId);
      setTitle('');
      setNotes('');
      setStatus('doing');
      setPriority('medium');
      setDueDate('');
      setOwners('');
      setNextStep('');
      setSubtasks([]);
      setIsSubtasksExpanded(true);
      setError('');
    }
  }, [open, projects, filters.projectId]);

  // Handle Esc key
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (open && e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [open, onClose]);

  if (!open) return null;

  const handleSubmit = () => {
    const t = title.trim();
    if (!t) {
      setError('标题为必填项');
      return;
    }
    if (t.length > 50) {
      setError('标题不能超过50字符');
      return;
    }
    const pid = projectId || ensureProjectByName('未分类');
    addTask({
      projectId: pid,
      title: t,
      notes: notes || undefined,
      status,
      priority,
      dueDate: dueDate || undefined,
      owners: owners || undefined,
      nextStep: nextStep || undefined,
      subtasks: subtasks.length > 0 ? subtasks : undefined,
    });
    onClose();
  };

  return (
    <div className='create-overlay'>
      <div className='create-dialog' onClick={(e) => e.stopPropagation()}>
        <header className='create-dialog-header'>
          <div className='create-dialog-title-block'>
            <div className='create-dialog-title'>新建单次任务</div>
            <div className='create-dialog-subtitle'>选择所属项目，补充关键信息，创建后会出现在当前项目的任务列表中。</div>
          </div>
          <button className='create-btn-icon' aria-label='关闭' type='button' onClick={onClose}>
            ✕
          </button>
        </header>

        <div className='create-dialog-body'>
          {error && <div className='error-panel' style={{ marginBottom: 12 }}>{error}</div>}

          {/* 标题字段 - 全宽，置顶 */}
          <div className='field' style={{ marginBottom: 18 }}>
            <label className='field-label'>
              任务标题<span>*</span>
            </label>
            <input
              className='field-input'
              type='text'
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder='请输入任务标题，建议 10~50 字，突出动词和对象'
              maxLength={100}
              style={{ fontSize: '15px', fontWeight: 600 }}
            />
          </div>

          <section className='create-section'>
            <div className='create-section-title-row'>
              <div className='create-section-title'>属性</div>
              <div className='create-section-hint'>管理任务的基本属性。</div>
            </div>
            <div className='field-grid-3'>
              <div className='field'>
                <label className='field-label'>
                  所属项目<span>*</span>
                </label>
                <CustomSelect
                  value={projectId}
                  options={projectOptions}
                  onChange={(val) => setProjectId(val)}
                  placeholder="选择项目"
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
                  placeholder="选择状态"
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
                  placeholder="选择优先级"
                />
              </div>
              <div className='field'>
                <label className='field-label'>截止日期</label>
                <input
                  className='field-input'
                  type='date'
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              </div>
              <div className='field'>
                <label className='field-label'>责任人</label>
                <input
                  className='field-input'
                  type='text'
                  value={owners}
                  onChange={(e) => setOwners(e.target.value)}
                  placeholder='例如：张三/李四'
                  list='owners-list'
                />
                <datalist id='owners-list'>
                  {[...new Set([...dictionary.onsiteOwners, ...dictionary.lineOwners])].map((o) => (
                    <option key={o} value={o} />
                  ))}
                </datalist>
              </div>
            </div>
          </section>

          <section className='create-section'>
            <div
              className='create-section-title-row'
              onClick={() => setIsSubtasksExpanded(!isSubtasksExpanded)}
              style={{ cursor: 'pointer', userSelect: 'none' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div className='create-section-title'>
                  子任务
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
              <div className='create-section-hint'>拆分任务步骤，便于跟踪进度。</div>
            </div>
            {isSubtasksExpanded && (
              <div className='create-field create-field-span-2'>
                <SubtaskList
                  subtasks={subtasks}
                  onChange={setSubtasks}
                  hideProgress={true}
                />
              </div>
            )}
          </section>

          <section className='create-section'>
            <div className='create-section-title-row'>
              <div className='create-section-title'>详情</div>
              <div className='create-section-hint'>简单说明要做什么、涉及哪些环境或人员。</div>
            </div>
            <div className='create-field create-field-span-2'>
              <textarea
                className='create-field-textarea'
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder='例如：整理本月现场支持过程中遇到的典型问题，并输出一篇维护经验文档。'
              />
            </div>
          </section>

          <section className='create-section'>
            <div className='create-section-title-row'>
              <div className='create-section-title'>下一步计划</div>
              <div className='create-section-hint'>可以先写一个最近要推进的动作，后续在任务详情里再补充。</div>
            </div>
            <div className='create-field create-field-span-2'>
              <textarea
                className='create-field-textarea'
                value={nextStep}
                onChange={(e) => setNextStep(e.target.value)}
                placeholder='例如：本周五前完成需求确认，下周一前输出初版文档。'
              />
            </div>
          </section>
        </div>

        <footer className='create-dialog-footer'>
          <div className='create-footer-meta'>带星号为必填字段，创建后可在任务详情中继续完善。</div>
          <div className='create-footer-actions'>
            <button className='btn btn-ghost' type='button' onClick={onClose}>
              取消
            </button>
            <button className='btn btn-primary' type='button' onClick={handleSubmit}>
              提交
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
};
