import { useEffect, useState } from 'react';
import { Modal } from '../common/Modal';
import { useAppStoreShallow } from '../../state/appStore';
import type { Priority, RecurringTemplate, Status } from '../../types';

interface RecurringTaskModalProps {
  open: boolean;
  onClose: () => void;
}

export const RecurringTaskModal = ({ open, onClose }: RecurringTaskModalProps) => {
  const { projects, addRecurringTemplate, updateRecurringTemplate, materializeRecurringTasks } = useAppStoreShallow((s) => ({
    projects: s.projects,
    addRecurringTemplate: s.addRecurringTemplate,
    updateRecurringTemplate: s.updateRecurringTemplate,
    materializeRecurringTasks: s.materializeRecurringTasks,
  }));

  const [tpl, setTpl] = useState<RecurringTemplate | null>(null);

  useEffect(() => {
    if (open) {
      setTpl({
        id: '',
        projectId: projects[0]?.id ?? '',
        title: '',
        status: 'paused' as Status,
        priority: 'medium' as Priority,
        schedule: { type: 'weekly', daysOfWeek: [1], flexible: false },
        dueStrategy: 'endOfWeek',
        defaults: {},
        active: true,
      });
    }
  }, [open, projects]);

  const saveTpl = () => {
    if (!tpl) return;
    if (!tpl.title.trim()) { alert('请输入名称'); return; }
    if (!tpl.id) {
      const saved = addRecurringTemplate(tpl);
      setTpl(saved);
      alert('周期规则已保存');
    } else {
      updateRecurringTemplate(tpl.id, tpl);
      alert('周期规则已更新');
    }
  };

  const generateCurrentPeriod = () => {
    saveTpl();
    materializeRecurringTasks();
    onClose();
    alert('已生成本期任务');
  };

  return (
    <Modal
      open={open}
      title="新建"
      onClose={onClose}
      width={820}
      footer={
        <div className="modal-actions">
          <button type="button" className="primary-btn" onClick={generateCurrentPeriod}>生成本期任务</button>
          <button type="button" onClick={saveTpl}>保存周期规则</button>
        </div>
      }
    >
      {tpl && (
        <div className="form-grid">
          <div className="form-item">
            <label>项目</label>
            <select value={tpl.projectId} onChange={(e) => setTpl({ ...tpl, projectId: e.target.value })}>
              {projects.map((p) => (<option key={p.id} value={p.id}>{p.name}</option>))}
            </select>
          </div>
          <div className="form-item">
            <label>名称</label>
            <input value={tpl.title} onChange={(e) => setTpl({ ...tpl, title: e.target.value })} />
          </div>
          <div className="form-item">
            <label>状态</label>
            <select value={tpl.status} onChange={(e) => setTpl({ ...tpl, status: e.target.value as Status })}>
              <option value="doing">进行中</option>
              <option value="done">已完成</option>
              <option value="paused">挂起</option>
            </select>
          </div>
          <div className="form-item">
            <label>优先级</label>
            <select value={tpl.priority ?? 'medium'} onChange={(e) => setTpl({ ...tpl, priority: e.target.value as Priority })}>
              <option value="high">高</option>
              <option value="medium">中</option>
              <option value="low">低</option>
            </select>
          </div>
          <div className="form-item">
            <label>频率</label>
            <select value={tpl.schedule.type} onChange={(e) => setTpl({ ...tpl, schedule: { ...tpl.schedule, type: e.target.value as 'weekly' | 'monthly' } })}>
              <option value="weekly">每周</option>
              <option value="monthly">每月</option>
            </select>
          </div>
          {tpl.schedule.type === 'weekly' ? (
            <div className="form-item full">
              <label>周几</label>
              <div className="tag-list">
                {[0,1,2,3,4,5,6].map((d) => (
                  <label key={d}>
                    <input type="checkbox" checked={(tpl.schedule.daysOfWeek ?? []).includes(d)} onChange={(e) => {
                      const set = new Set(tpl.schedule.daysOfWeek ?? []);
                      if (e.target.checked) set.add(d); else set.delete(d);
                      setTpl({ ...tpl, schedule: { ...tpl.schedule, daysOfWeek: Array.from(set) } });
                    }} />{['日','一','二','三','四','五','六'][d]}
                  </label>
                ))}
              </div>
            </div>
          ) : (
            <div className="form-item">
              <label>几号</label>
              <input type="number" min={1} max={31} value={tpl.schedule.dayOfMonth ?? 1} onChange={(e) => setTpl({ ...tpl, schedule: { ...tpl.schedule, dayOfMonth: Number(e.target.value) } })} />
            </div>
          )}
          <div className="form-item">
            <label>是否不固定</label>
            <input type="checkbox" checked={!!tpl.schedule.flexible} onChange={(e) => setTpl({ ...tpl, schedule: { ...tpl.schedule, flexible: e.target.checked } })} />
          </div>
          <div className="form-item">
            <label>到期策略</label>
            <select value={tpl.dueStrategy} onChange={(e) => setTpl({ ...tpl, dueStrategy: e.target.value as RecurringTemplate['dueStrategy'] })}>
              <option value="sameDay">当天</option>
              <option value="endOfWeek">周末</option>
              <option value="endOfMonth">月底</option>
              <option value="none">不设置</option>
            </select>
          </div>
          <div className="form-item full">
            <label>默认字段</label>
            <div className="row-bottom">
              <div className="field">
                <div className="label">现场责任人</div>
                <input value={tpl.defaults?.onsiteOwner ?? ''} onChange={(e) => setTpl({ ...tpl, defaults: { ...(tpl.defaults ?? {}), onsiteOwner: e.target.value } })} />
              </div>
              <div className="field">
                <div className="label">产线责任人</div>
                <input value={tpl.defaults?.lineOwner ?? ''} onChange={(e) => setTpl({ ...tpl, defaults: { ...(tpl.defaults ?? {}), lineOwner: e.target.value } })} />
              </div>
              <div className="field">
                <div className="label">下一步</div>
                <input value={tpl.defaults?.nextStep ?? ''} onChange={(e) => setTpl({ ...tpl, defaults: { ...(tpl.defaults ?? {}), nextStep: e.target.value } })} />
              </div>
            </div>
          </div>
          <div className="form-item full">
            <label>详情</label>
            <textarea rows={4} value={tpl.defaults?.notes ?? ''} onChange={(e) => setTpl({ ...tpl, defaults: { ...(tpl.defaults ?? {}), notes: e.target.value } })} />
          </div>
        </div>
      )}
    </Modal>
  );
};