import { useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { Modal } from '../common/Modal';
import { useAppStoreShallow } from '../../state/appStore';
import type { Attachment, ProgressStatus } from '../../types';

interface ProgressModalProps {
  open: boolean;
  taskId?: string | null;
  onClose: () => void;
}

export const ProgressModal = ({ open, taskId, onClose }: ProgressModalProps) => {
  const { tasks, addProgress, updateProgress } = useAppStoreShallow((state) => ({
    tasks: state.tasks,
    addProgress: state.addProgress,
    updateProgress: state.updateProgress,
  }));

  const task = useMemo(() => tasks.find((t) => t.id === taskId), [tasks, taskId]);

  const [at, setAt] = useState<string>('');
  const [status, setStatus] = useState<ProgressStatus>('doing');
  const [note, setNote] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      const now = new Date();
      const iso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      setAt(iso);
      setStatus('doing');
      setNote('');
      setAttachments([]);
      setError('');
      setEditingId(null);
    }
  }, [open]);

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const acc: Attachment[] = [];
    for (const f of Array.from(files)) {
      if (f.size > 10 * 1024 * 1024) {
        alert(`${f.name} 超过10MB，已跳过`);
        continue;
      }
      const dataUrl = await fileToDataUrl(f);
      acc.push({ id: crypto.randomUUID(), name: f.name, size: f.size, type: f.type, dataUrl, createdAt: Date.now() });
    }
    setAttachments(acc);
  };

  const handleSubmit = async () => {
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
          status,
          note: note.trim(),
          attachments,
        });
        alert('进展已更新');
      } else {
        addProgress(task.id, { status, note: note.trim(), at: atNum, attachments });
        alert('进展已记录');
      }
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={open} title={editingId ? '编辑进展' : '记录进展'} onClose={onClose} width={900}>
      {error && <div className='error-panel'>{error}</div>}
      <label>
        时间戳
        <input type='date' value={at} onChange={(e) => setAt(e.target.value)} />
      </label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div>
          <strong>进展状态</strong>
          <label style={{ marginLeft: 12 }}><input type='radio' name='progress-status' value='doing' checked={status==='doing'} onChange={() => setStatus('doing')} /> 进行中</label>
          <label style={{ marginLeft: 12 }}><input type='radio' name='progress-status' value='blocked' checked={status==='blocked'} onChange={() => setStatus('blocked')} /> 受阻</label>
          <label style={{ marginLeft: 12 }}><input type='radio' name='progress-status' value='done' checked={status==='done'} onChange={() => setStatus('done')} /> 已完成</label>
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <span>添加附件</span>
            <input type='file' multiple onChange={(e) => handleFiles(e.target.files)} />
          </label>
        </div>
      </div>
      <label>
        进展说明
        <textarea rows={8} value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      <div className='modal-actions'>
        <button type='button' onClick={onClose}>取消</button>
        <button type='button' disabled={submitting} onClick={handleSubmit}>提交</button>
      </div>
      <section>
        <h4>全部进展记录</h4>
        <ul className='history-list'>
          {(task?.progress ?? []).map((p) => (
            <li key={p.id}>
              <div>{dayjs(p.at).format('YYYY-MM-DD')}</div>
              <div>{p.status}</div>
              <div style={{ whiteSpace: 'pre-wrap' }}>{p.note}</div>
              {!!p.attachments?.length && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {p.attachments.map((a) => (
                    <a key={a.id} href={a.dataUrl} download={a.name}>{a.name}</a>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                <button type='button' onClick={() => {
                  setEditingId(p.id);
                  setAt(dayjs(p.at).format('YYYY-MM-DD'));
                  setStatus(p.status);
                  setNote(p.note);
                  setAttachments(p.attachments ?? []);
                }}>编辑</button>
              </div>
            </li>
          ))}
          {!task?.progress?.length && <li className='muted'>暂无进展</li>}
        </ul>
      </section>
    </Modal>
  );
};

const fileToDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (error) => reject(error);
    reader.readAsDataURL(file);
  });