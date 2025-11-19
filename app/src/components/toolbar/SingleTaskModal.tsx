import { useEffect, useState } from 'react';
import { Modal } from '../common/Modal';
import { useAppStoreShallow } from '../../state/appStore';
import type { Priority, Status } from '../../types';

interface SingleTaskModalProps {
  open: boolean;
  onClose: () => void;
}

export const SingleTaskModal = ({ open, onClose }: SingleTaskModalProps) => {
  const { projects, addTask, ensureProjectByName, dictionary } = useAppStoreShallow((state) => ({
    projects: state.projects,
    addTask: state.addTask,
    ensureProjectByName: state.ensureProjectByName,
    dictionary: state.dictionary,
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

  useEffect(() => {
    if (open) {
      setProjectId(projects[0]?.id ?? '');
      setTitle(''); setNotes(''); setStatus('doing'); setPriority('medium'); setDueDate('');
      setOnsiteOwner(''); setLineOwner(''); setNextStep(''); setError('');
    }
  }, [open, projects]);

  const handleSubmit = () => {
    const t = title.trim();
    if (!t) { setError('标题为必填'); return; }
    if (t.length > 50) { setError('标题不能超过50字符'); return; }
    const pid = projectId || ensureProjectByName('未分类');
    addTask({ projectId: pid, title: t, notes: notes || undefined, status, priority, dueDate: dueDate || undefined, onsiteOwner: onsiteOwner || undefined, lineOwner: lineOwner || undefined, nextStep: nextStep || undefined });
    onClose();
    alert('新增单次任务成功');
  };

  return (
    <Modal open={open} title="新建" onClose={onClose} width={820} footer={
      <div className="modal-actions">
        <button type="button" className="primary-btn" onClick={handleSubmit}>提交</button>
      </div>
    }>
      {error && <div className="error-panel">{error}</div>}
      <div className="form-grid">
        <div className="form-item full">
          <label>项目</label>
          <select className="select" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            {projects.map((p) => (<option key={p.id} value={p.id}>{p.name}</option>))}
          </select>
        </div>
        <div className="form-item full">
          <label>标题</label>
          <input className="input" type="text" value={title} maxLength={50} placeholder="请输入标题（最多50字符）" onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="form-item full">
          <label>详情</label>
          <textarea className="textarea" rows={6} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <div className="form-item">
          <label>状态</label>
          <select className="select" value={status} onChange={(e) => setStatus(e.target.value as Status)}>
            <option value="doing">进行中</option>
            <option value="done">已完成</option>
            <option value="paused">挂起</option>
          </select>
        </div>
        <div className="form-item">
          <label>优先级</label>
          <select className="select" value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
            <option value="high">高</option>
            <option value="medium">中</option>
            <option value="low">低</option>
          </select>
        </div>
        <div className="form-item">
          <label>截止日期</label>
          <input className="input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </div>
        <div className="form-item">
          <label>现场责任人</label>
          <input className="input" list="onsite-owner-list" value={onsiteOwner} onChange={(e) => setOnsiteOwner(e.target.value)} />
          <datalist id="onsite-owner-list">
            {dictionary.onsiteOwners.map((o) => (<option key={o} value={o} />))}
          </datalist>
        </div>
        <div className="form-item full">
          <label>产线责任人</label>
          <input className="input" list="line-owner-list" value={lineOwner} onChange={(e) => setLineOwner(e.target.value)} />
          <datalist id="line-owner-list">
            {dictionary.lineOwners.map((o) => (<option key={o} value={o} />))}
          </datalist>
        </div>
        <div className="form-item full">
          <label>下一步</label>
          <textarea className="textarea" rows={4} value={nextStep} onChange={(e) => setNextStep(e.target.value)} />
        </div>
      </div>
    </Modal>
  );
};