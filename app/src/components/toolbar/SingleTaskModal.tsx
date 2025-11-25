import { useEffect, useState } from 'react';
import { useAppStoreShallow } from '../../state/appStore';
import type { Priority, Status } from '../../types';
import { CustomSelect } from '../ui/CustomSelect';

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
  const [onsiteOwner, setOnsiteOwner] = useState('');
  const [lineOwner, setLineOwner] = useState('');
  const [nextStep, setNextStep] = useState('');
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
      setOnsiteOwner('');
      setLineOwner('');
      setNextStep('');
      setError('');
    }
  }, [open, projects, filters.projectId]);

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
      onsiteOwner: onsiteOwner || undefined,
      lineOwner: lineOwner || undefined,
      nextStep: nextStep || undefined,
    });
    onClose();
  };

  return (
    <div className='create-overlay' onClick={onClose}>
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

          <section className='create-section'>
            <div className='create-section-title-row'>
              <div className='create-section-title'>基本信息</div>
              <div className='create-section-hint'>先把任务的“标签”补全，后续筛选、排序会更好用。</div>
            </div>
            <div className='create-form-grid'>
              <div className='create-field'>
                <label className='create-field-label'>
                  项目<span>*</span>
                </label>
                <CustomSelect
                  value={projectId}
                  options={projectOptions}
                  onChange={(val) => setProjectId(val)}
                  placeholder="选择项目"
                />
              </div>
              <div className='create-field'>
                <label className='create-field-label'>
                  状态<span>*</span>
                </label>
                <CustomSelect
                  value={status}
                  options={statusOptions}
                  onChange={(val) => setStatus(val as Status)}
                />
              </div>
              <div className='create-field create-field-span-2'>
                <label className='create-field-label'>
                  标题<span>*</span>
                </label>
                <input
                  className='create-field-input'
                  type='text'
                  value={title}
                  maxLength={50}
                  placeholder='请填写任务标题，建议 10~50 字，突出动词和对象'
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>
              <div className='create-field'>
                <label className='create-field-label'>
                  优先级<span>*</span>
                </label>
                <CustomSelect
                  value={priority}
                  options={priorityOptions}
                  onChange={(val) => setPriority(val as Priority)}
                />
              </div>
              <div className='create-field'>
                <label className='create-field-label'>截止日期</label>
                <input
                  className='create-field-input'
                  type='date'
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              </div>
              <div className='create-field'>
                <label className='create-field-label'>现场责任人</label>
                <input
                  className='create-field-input'
                  type='text'
                  value={onsiteOwner}
                  onChange={(e) => setOnsiteOwner(e.target.value)}
                  placeholder='例如：张三'
                  list='onsite-owner-list'
                />
                <datalist id='onsite-owner-list'>
                  {dictionary.onsiteOwners.map((o) => (
                    <option key={o} value={o} />
                  ))}
                </datalist>
              </div>
              <div className='create-field'>
                <label className='create-field-label'>产线责任人</label>
                <input
                  className='create-field-input'
                  type='text'
                  value={lineOwner}
                  onChange={(e) => setLineOwner(e.target.value)}
                  placeholder='例如：李四'
                  list='line-owner-list'
                />
                <datalist id='line-owner-list'>
                  {dictionary.lineOwners.map((o) => (
                    <option key={o} value={o} />
                  ))}
                </datalist>
              </div>
            </div>
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
