import { useEffect, useState } from 'react';
import dayjs from 'dayjs';
import { nanoid } from 'nanoid';
import { useAppStoreShallow } from '../../state/appStore';
import type { Priority, RecurringTemplate, Status, Subtask } from '../../types';
import { CustomSelect } from '../ui/CustomSelect';
import { SubtaskList } from '../ui/SubtaskList';
import { mergeOwners } from '../../utils/taskUtils';

const WEEK_OPTIONS = [
  { value: '1', label: '周一' },
  { value: '2', label: '周二' },
  { value: '3', label: '周三' },
  { value: '4', label: '周四' },
  { value: '5', label: '周五' },
  { value: '6', label: '周六' },
  { value: '0', label: '周日' },
];

const priorityOptions: { value: Priority; label: string }[] = [
  { value: 'medium', label: '中' },
  { value: 'high', label: '高' },
  { value: 'low', label: '低' },
];

const statusOptions: { value: Status; label: string }[] = [
  { value: 'doing', label: '进行中' },
  { value: 'paused', label: '挂起' },
  { value: 'done', label: '已完成' },
];

const frequencyOptions = [
  { value: 'daily', label: '每日' },
  { value: 'weekly', label: '每周' },
  { value: 'monthly', label: '每月' },
];

const MONTH_OPTIONS = Array.from({ length: 31 }, (_, i) => {
  const d = i + 1;
  return { value: String(d), label: d === 31 ? '31日 (或月底)' : `${d}日` };
});

interface RecurringTaskModalProps {
  open: boolean;
  onClose: () => void;
  editingTemplate?: RecurringTemplate;
}

export const RecurringTaskModal = ({ open, onClose, editingTemplate }: RecurringTaskModalProps) => {
  const { projects, addTask, filters, setFilters, updateRecurringTemplate, addRecurringTemplate } = useAppStoreShallow((state) => ({
    projects: state.projects,
    addTask: state.addTask,
    filters: state.filters,
    setFilters: state.setFilters,
    updateRecurringTemplate: state.updateRecurringTemplate,
    addRecurringTemplate: state.addRecurringTemplate,
  }));

  const [tpl, setTpl] = useState<RecurringTemplate | null>(null);
  const [autoRenew, setAutoRenew] = useState(true);
  const [subtasks, setSubtasks] = useState<Subtask[]>([]);
  const [isSubtasksExpanded, setIsSubtasksExpanded] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    // 编辑模式：加载现有模板
    if (editingTemplate) {
      setTpl({ ...editingTemplate });
      setAutoRenew(true);
      setSubtasks(editingTemplate.subtasks ?? []);
      setIsSubtasksExpanded(true);
      setError('');
      return;
    }
    // 新建模式：初始化空模板
    const selected = projects.find((p) => p.id === filters.projectId);
    const isTrash = selected?.name === '回收站';
    const defaultId = !isTrash && selected ? selected.id : projects[0]?.id ?? '';
    setTpl({
      id: '',
      projectId: defaultId,
      title: '',
      status: 'doing',
      priority: 'medium',
      schedule: { type: 'weekly', daysOfWeek: [1] },
      defaults: { notes: '', nextStep: '' },
      dueStrategy: 'sameDay', // default strategy
      active: true,
    });
    setAutoRenew(true);
    setSubtasks([]);
    setIsSubtasksExpanded(true);
    setError('');
  }, [open, projects, filters.projectId, editingTemplate]);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (open && e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [open, onClose]);

  if (!open || !tpl) return null;

  const updateDefaults = (key: 'nextStep' | 'notes', value: string) => {
    setTpl({ ...tpl, defaults: { ...(tpl.defaults ?? {}), [key]: value } });
  };

  const switchFrequency = (type: 'daily' | 'weekly' | 'monthly') => {
    if (!tpl) return;
    if (type === 'daily') {
      setTpl({ ...tpl, schedule: { type: 'daily' } });
    } else if (type === 'weekly') {
      setTpl({ ...tpl, schedule: { type: 'weekly', daysOfWeek: tpl.schedule.type === 'weekly' ? tpl.schedule.daysOfWeek ?? [1] : [1] } });
    } else {
      setTpl({ ...tpl, schedule: { type: 'monthly', dayOfMonth: tpl.schedule.type === 'monthly' ? tpl.schedule.dayOfMonth ?? 1 : 1 } });
    }
  };

  const generateCurrentPeriod = () => {
    if (!tpl.title.trim()) {
      setError('名称为必填项');
      return;
    }

    // 编辑模式：更新模板
    if (editingTemplate) {
      const finalOwners = subtasks.length > 0 ? mergeOwners(tpl.owners, subtasks) : tpl.owners;
      updateRecurringTemplate(editingTemplate.id, {
        ...tpl,
        owners: finalOwners,
        subtasks: subtasks.length > 0 ? subtasks : undefined,
      });
      onClose();
      return;
    }

    // 新建模式：创建任务和模板
    const now = dayjs();
    const startOfWeek = now.subtract((now.day() + 6) % 7, 'day');
    const startOfMonth = now.startOf('month');
    const endOfMonth = now.endOf('month');
    let dateStr = '';

    if (tpl.schedule.type === 'daily') {
      // 每日任务：截止日期就是今天
      dateStr = now.format('YYYY-MM-DD');
    } else if (tpl.schedule.type === 'weekly') {
      const weekday = (tpl.schedule.daysOfWeek ?? [1])[0];
      let target = startOfWeek.add((weekday + 7) % 7, 'day');
      if (target.isBefore(now.startOf('day'))) target = target.add(7, 'day');
      dateStr = target.format('YYYY-MM-DD');
    } else {
      const dom = tpl.schedule.dayOfMonth ?? 1;
      let target = startOfMonth.date(Math.min(dom, endOfMonth.date()));
      if (target.isBefore(now.startOf('day'))) {
        const nextStart = startOfMonth.add(1, 'month');
        const nextEnd = nextStart.endOf('month');
        target = nextStart.date(Math.min(dom, nextEnd.date()));
      }
      dateStr = target.format('YYYY-MM-DD');
    }

    // 在生成任务时合并子任务责任人
    const finalOwners = subtasks.length > 0 ? mergeOwners(tpl.owners, subtasks) : tpl.owners;

    // 生成模板 ID 并保存模板
    const templateId = nanoid(12);
    const periodKey = tpl.schedule.type === 'weekly'
      ? startOfWeek.format('YYYY-MM-DD')
      : startOfMonth.format('YYYY-MM');

    // 保存周期任务模板
    addRecurringTemplate({
      ...tpl,
      id: templateId,
      owners: finalOwners,
      subtasks: subtasks.length > 0 ? subtasks : undefined,
    });

    // 创建当前周期的任务实例
    addTask({
      projectId: tpl.projectId,
      title: tpl.title,
      status: tpl.status,
      priority: tpl.priority ?? 'medium',
      dueDate: dateStr,
      owners: finalOwners,
      nextStep: tpl.defaults?.nextStep,
      notes: tpl.defaults?.notes,
      subtasks: subtasks.length > 0 ? subtasks.map(st => ({ ...st, id: nanoid(8), createdAt: Date.now(), completed: false })) : undefined,
      extras: {
        recurrenceId: templateId,
        periodKey,
      },
    });
    setFilters({ projectId: tpl.projectId, statuses: [], status: 'all' });
    onClose();
  };

  return (
    <div className='create-overlay' style={{ zIndex: 200 }}>
      <div className='create-dialog' style={{ width: 960 }} onClick={(e) => e.stopPropagation()}>
        <header className='create-dialog-header'>
          <div className='create-dialog-title-block'>
            <div className='create-dialog-title'>{editingTemplate ? '编辑周期任务' : '新建周期任务'}</div>
            <div className='create-dialog-subtitle'>
              {editingTemplate
                ? '修改周期任务模板，不影响已生成的任务实例。'
                : '适合每周例会、月度报表等固定节奏的工作，系统会按规则自动生成后续任务。'
              }
            </div>
          </div>
          <button className='create-btn-icon' aria-label='关闭' type='button' onClick={onClose}>
            ✕
          </button>
        </header>

        <div className='create-dialog-body'>
          {error && <div className='error-panel' style={{ marginBottom: 12 }}>{error}</div>}

          {/* 标题字段 - 全宽，置顶 */}
          <div className='field' style={{ marginBottom: 18 }}>
            <label className='field-label'>名称（用于列表展示）<span>*</span></label>
            <input
              className='field-input'
              type='text'
              value={tpl.title}
              placeholder='例如：周例会检查清单'
              onChange={(e) => setTpl({ ...tpl, title: e.target.value })}
              style={{ fontSize: '15px', fontWeight: 600 }}
            />
          </div>

          <section className='create-section'>
            <div className='create-section-title-row'>
              <div className='create-section-title'>属性</div>
              <div className='create-section-hint'>先把任务的标签补全，后续筛选、排序会更好用。</div>
            </div>
            <div className='field-grid-3'>
              <div className='field'>
                <label className='field-label'>所属项目<span>*</span></label>
                <CustomSelect
                  value={tpl.projectId}
                  options={projects.filter(p => p.name !== '回收站').map(p => ({ value: p.id, label: p.name }))}
                  onChange={(val) => setTpl({ ...tpl, projectId: val })}
                  placeholder="选择项目"
                />
              </div>
              <div className='field'>
                <label className='field-label'>状态<span>*</span></label>
                <CustomSelect
                  value={tpl.status}
                  options={statusOptions}
                  onChange={(val) => setTpl({ ...tpl, status: val as Status })}
                  placeholder="选择状态"
                />
              </div>
              <div className='field'>
                <label className='field-label'>优先级<span>*</span></label>
                <CustomSelect
                  value={tpl.priority ?? 'medium'}
                  options={priorityOptions}
                  onChange={(val) => setTpl({ ...tpl, priority: val as Priority })}
                  placeholder="选择优先级"
                />
              </div>
              <div className='field'>
                <label className='field-label'>责任人</label>
                <input
                  className='field-input'
                  type='text'
                  value={tpl.owners ?? ''}
                  placeholder='例如：张三/李四'
                  onChange={(e) => setTpl({ ...tpl, owners: e.target.value })}
                />
              </div>
            </div>
          </section>

          <section className='create-section'>
            <div className='create-section-title-row'>
              <div className='create-section-title'>计划周期</div>
              <div className='create-section-hint'>设置生成新任务的频率和截止日期规则。</div>
            </div>
            <div className='create-form-grid'>
              <div className='create-field'>
                <label className='create-field-label'>频率<span>*</span></label>
                <CustomSelect
                  value={tpl.schedule.type}
                  options={frequencyOptions}
                  onChange={(val) => switchFrequency(val as 'daily' | 'weekly' | 'monthly')}
                />
              </div>
              {tpl.schedule.type !== 'daily' && (
                <div className='create-field'>
                  <label className='create-field-label'>截止日期</label>
                  {tpl.schedule.type === 'weekly' ? (
                    <CustomSelect
                      value={String((tpl.schedule.daysOfWeek ?? [1])[0])}
                      options={WEEK_OPTIONS}
                      onChange={(val) =>
                        setTpl({ ...tpl, schedule: { type: 'weekly', daysOfWeek: [Number(val)] } })
                      }
                    />
                  ) : (
                    <CustomSelect
                      value={String(tpl.schedule.dayOfMonth ?? 1)}
                      options={MONTH_OPTIONS}
                      onChange={(val) =>
                        setTpl({
                          ...tpl,
                          schedule: { type: 'monthly', dayOfMonth: Number(val) },
                        })
                      }
                    />
                  )}
                </div>
              )}
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, fontSize: 13, color: 'var(--text-main)' }}>
              <input
                type='checkbox'
                checked={autoRenew}
                onChange={(e) => setAutoRenew(e.target.checked)}
              />
              <span>完成后自动续期</span>
              <span style={{ color: 'var(--text-subtle)', fontSize: 12 }}>本期任务完成后，系统自动生成下一周期任务。</span>
            </label>
          </section>

          <section className='create-section'>
            <div className='create-section-title-row'>
              <div className='create-section-title'>默认任务内容</div>
              <div className='create-section-hint'>为每次生成的任务预填常用信息，可在单条任务中微调。</div>
            </div>
            <div className='create-field create-field-span-2'>
              <div
                className='create-section-title-row'
                onClick={() => setIsSubtasksExpanded(!isSubtasksExpanded)}
                style={{ cursor: 'pointer', userSelect: 'none', marginBottom: 8 }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <label className='create-field-label' style={{ marginBottom: 0 }}>
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
                  </label>
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
              </div>
              {isSubtasksExpanded && (
                <SubtaskList
                  subtasks={subtasks}
                  onChange={setSubtasks}
                  hideProgress={true}
                />
              )}
            </div>
            <div className='create-field create-field-span-2'>
              <label className='create-field-label'>详情</label>
              <textarea
                className='create-field-textarea'
                value={tpl.defaults?.notes ?? ''}
                onChange={(e) => updateDefaults('notes', e.target.value)}
                placeholder='例如：本周例检查机房云桌面运行状态，汇总异常并反馈。'
              />
            </div>
            <div className='create-field create-field-span-2'>
              <label className='create-field-label'>下一步计划</label>
              <textarea
                className='create-field-textarea'
                value={tpl.defaults?.nextStep ?? ''}
                onChange={(e) => updateDefaults('nextStep', e.target.value)}
                placeholder='例如：完成检查后，在小组群内同步结果，并约定整改截止时间。'
              />
            </div>
          </section>
        </div>

        <footer className='create-dialog-footer'>
          <div className='create-footer-meta'>创建后会生成当前周期任务，后续任务会按规则自动生成，可在任务详情调整。</div>
          <div className='create-footer-actions'>
            <button className='btn btn-ghost' type='button' onClick={onClose}>
              取消
            </button>
            <button className='btn btn-primary' type='button' onClick={generateCurrentPeriod}>
              {editingTemplate ? '保存修改' : '生成周期任务'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
};
