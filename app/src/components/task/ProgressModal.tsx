import { useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { Modal } from '../common/Modal';
import { useAppStoreShallow } from '../../state/appStore';

interface ProgressModalProps {
  open: boolean;
  taskId?: string | null;
  onClose: () => void;
}

export const ProgressModal = ({ open, taskId, onClose }: ProgressModalProps) => {
  const { tasks, addProgress, updateProgress, deleteProgress } = useAppStoreShallow((state) => ({
    tasks: state.tasks,
    addProgress: state.addProgress,
    updateProgress: state.updateProgress,
    deleteProgress: state.deleteProgress,
  }));

  const task = useMemo(() => tasks.find((t) => t.id === taskId), [tasks, taskId]);

  const [at, setAt] = useState<string>('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);


  useEffect(() => {
    if (open) {
      const iso = dayjs().format('YYYY-MM-DDTHH:mm');
      setAt(iso);
      setNote('');
      setError('');
      setEditingId(null);
    }
  }, [open]);

  const handleSubmit = async (closeAfter: boolean) => {
    if (!task) return;
    if (!note.trim()) {
      setError('进展说明为必填');
      return;
    }
    setSubmitting(true);
    try {
      const atNum = dayjs(at).valueOf();
      if (editingId) {
        updateProgress(task.id, editingId, {
          at: atNum,
          note: note.trim(),
          attachments: [],
        });
        alert('进展已更新');
      } else {
        addProgress(task.id, { note: note.trim(), at: atNum, attachments: [] });
        alert('进展已记录');
      }
      if (closeAfter) {
        onClose();
      } else {
        setNote('');
        setEditingId(null);
        setAt(dayjs().format('YYYY-MM-DDTHH:mm'));
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setSubmitting(false);
    }
  };

  const sortedProgress = [...(task?.progress ?? [])].sort((a, b) => (b.at - a.at));

  return (
    <Modal open={open} title={editingId ? '编辑进展' : '记录进展'} onClose={onClose} width={980}>
      {error && <div className='error-panel'>{error}</div>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>时间戳</span>
          <input type='datetime-local' value={at} onChange={(e) => setAt(e.target.value)} />
        </label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginLeft: 'auto' }}>
          <button type='button' onClick={() => { setEditingId(null); setNote(''); setAt(dayjs().format('YYYY-MM-DDTHH:mm')); }}>新建一条</button>
          <button type='button' onClick={onClose}>取消</button>
          <button type='button' className='accent-btn' disabled={submitting} onClick={() => handleSubmit(false)}>提交并继续</button>
          <button type='button' className='primary-btn' disabled={submitting} onClick={() => handleSubmit(true)}>提交并关闭</button>
        </div>
      </div>

      <label>
        进展说明
        <textarea rows={10} style={{ width: '100%', minHeight: 180 }} value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => {
          if (e.ctrlKey && e.key === 'Enter') {
            e.preventDefault();
            handleSubmit(false);
          }
        }} />
      </label>


      <section>
        <h4>全部进展记录</h4>
        <div className='timeline-list'>
          {sortedProgress.map((p, idx) => (
            <div key={p.id} className={`timeline-item ${idx === 0 ? 'latest' : ''}`}>
              <div className='timeline-left'>
                <div className='timeline-icon'></div>
                {idx !== sortedProgress.length - 1 && <div className='timeline-line'></div>}
              </div>
              <div className='timeline-content'>
                <div className='timeline-header'>
                  <div className='timeline-time'>{dayjs(p.at).format('YYYY-MM-DD HH:mm')}</div>
                  <div className='timeline-actions'>
                    <button type='button' className='icon-btn' onClick={() => {
                      setEditingId(p.id);
                      setAt(dayjs(p.at).format('YYYY-MM-DDTHH:mm'));
                      setNote(p.note);
                    }}>编辑</button>
                    <button type='button' className='icon-btn danger' onClick={() => {
                      if (confirm('确认删除该进展记录？')) {
                        deleteProgress(task!.id, p.id);
                      }
                    }}>删除</button>
                  </div>
                </div>
                <div className='timeline-body'>
                  {p.note}
                </div>
              </div>
            </div>
          ))}
          {!task?.progress?.length && <div className='muted' style={{ padding: '20px', textAlign: 'center' }}>暂无进展</div>}
        </div>
      </section>
    </Modal>
  );
};

