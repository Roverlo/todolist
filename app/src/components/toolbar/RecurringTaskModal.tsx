import { useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { Modal } from '../common/Modal';
import { useAppStoreShallow } from '../../state/appStore';
import type { Priority, RecurringTemplate, Status } from '../../types';

const WEEK_LABELS = ['日', '一', '二', '三', '四', '五', '六'];



type DefaultFieldKey = 'nextStep' | 'notes';

interface RecurringTaskModalProps {
  open: boolean;
  onClose: () => void;
}

export const RecurringTaskModal = ({ open, onClose }: RecurringTaskModalProps) => {
  const { projects, addTask, filters, setFilters } =
    useAppStoreShallow((state) => ({
      projects: state.projects,
      addTask: state.addTask,
      filters: state.filters,
      setFilters: state.setFilters,
    }));

  const [tpl, setTpl] = useState<RecurringTemplate | null>(null);
  const [autoRenew, setAutoRenew] = useState<boolean>(true);

  const projectName = useMemo(() => {
    if (!tpl) return '';
    return projects.find((p) => p.id === tpl.projectId)?.name ?? '';
  }, [projects, tpl]);


  useEffect(() => {
    if (!open) return;
    const selected = projects.find((p) => p.id === filters.projectId);
    const isTrash = selected?.name === '回收站';
    const defaultId = !isTrash && selected ? selected.id : (projects[0]?.id ?? '');
    setTpl({
      id: '',
      projectId: defaultId,
      title: '',
      status: 'paused' as Status,
      priority: 'medium' as Priority,
      schedule: { type: 'weekly', daysOfWeek: [5] },
      dueStrategy: 'none',
      defaults: {},
      active: true,
    });
  }, [open, projects, filters.projectId]);

  const updateDefaults = (key: DefaultFieldKey, value: string) => {
    if (!tpl) return;
    setTpl({
      ...tpl,
      defaults: {
        ...(tpl.defaults ?? {}),
        [key]: value,
      },
    });
  };


  const switchFrequency = (type: 'weekly' | 'monthly') => {
    if (!tpl) return;
    setTpl({
      ...tpl,
      schedule:
        type === 'weekly'
          ? {
              type: 'weekly',
              daysOfWeek: (tpl.schedule.daysOfWeek?.length ? [...(tpl.schedule.daysOfWeek ?? [])] : [1]),
            }
          : {
              type: 'monthly',
              dayOfMonth: tpl.schedule.dayOfMonth ?? 1,
            },
    });
  };

  const generateCurrentPeriod = () => {
    if (!tpl) return;
    if (!tpl.title.trim()) {
      alert('请输入名称');
      return;
    }
    const now = dayjs();
    const startOfWeek = now.subtract((now.day() + 6) % 7, 'day');
    // removed endOfWeek usage; due date即为选定截止日
    const startOfMonth = now.startOf('month');
    const endOfMonth = now.endOf('month');
    const dates: string[] = [];
    if (tpl.schedule.type === 'weekly') {
      const d = (tpl.schedule.daysOfWeek ?? [5])[0];
      let target = startOfWeek.add(((d + 7) % 7), 'day');
      if (target.isBefore(now.startOf('day'))) {
        target = target.add(7, 'day');
      }
      dates.push(target.format('YYYY-MM-DD'));
    } else {
      const dom = tpl.schedule.dayOfMonth ?? 15;
      let target = startOfMonth.date(Math.min(dom, endOfMonth.date()));
      if (target.isBefore(now.startOf('day'))) {
        const nextStart = startOfMonth.add(1, 'month');
        const nextEnd = nextStart.endOf('month');
        target = nextStart.date(Math.min(dom, nextEnd.date()));
      }
      dates.push(target.format('YYYY-MM-DD'));
    }
    const dueFor = (dateStr: string) => dateStr;
    dates.forEach((dateStr) => {
      addTask({
        projectId: tpl!.projectId,
        title: tpl!.title,
        status: tpl!.status,
        priority: tpl!.priority ?? 'medium',
        dueDate: dueFor(dateStr),
        onsiteOwner: tpl!.onsiteOwner,
        lineOwner: tpl!.lineOwner,
        nextStep: tpl!.defaults?.nextStep,
        notes: tpl!.defaults?.notes,
        tags: tpl!.defaults?.tags ?? [],
        extras: { recurring: JSON.stringify({ type: tpl!.schedule.type, dueWeekday: tpl!.schedule.type==='weekly' ? (tpl!.schedule.daysOfWeek ?? [5])[0] : undefined, dueDom: tpl!.schedule.type==='monthly' ? (tpl!.schedule.dayOfMonth ?? 15) : undefined, autoRenew }) },
      });
    });
    setFilters({ projectId: tpl.projectId, statuses: [], status: 'all' });
    onClose();
    alert('已生成本期任务');
  };

  return (
    <Modal
      open={open}
      title="新建周期任务"
      onClose={onClose}
      width={920}
      footer={
        <div className="modal-actions">
          <button type="button" className="primary-btn" onClick={generateCurrentPeriod}>
            生成周期任务
          </button>
        </div>
      }
    >
      {tpl && (
        <div className="recurring-modal">
          <section className="section-card">
            <div className="section-header">
              <div>
                <h3>基本信息</h3>
                <p>明确周期任务的归属与展示文案</p>
              </div>
              
            </div>
            <div className="section-grid">
              <div className="field-control">
                <div className="field-label">
                  <span>项目</span>
                  <span className="field-note">{projectName || '请选择项目'}</span>
                </div>
                <select
                  value={tpl.projectId}
                  onChange={(event) => setTpl({ ...tpl, projectId: event.target.value })}
                >
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field-control">
                <div className="field-label">
                  <span>名称</span>
                  <span className="field-note">用于列表展示</span>
                </div>
                <input
                  value={tpl.title}
                  onChange={(event) => setTpl({ ...tpl, title: event.target.value })}
                  placeholder="例如：周例会检查清单"
                />
              </div>
              <div className="field-control">
                <div className="field-label">
                  <span>状态</span>
                </div>
                <select
                  value={tpl.status}
                  onChange={(event) => setTpl({ ...tpl, status: event.target.value as Status })}
                >
                  <option value="doing">进行中</option>
                  <option value="done">已完成</option>
                  <option value="paused">挂起</option>
                </select>
              </div>
              <div className="field-control">
                <div className="field-label">
                  <span>优先级</span>
                </div>
                <select
                  value={tpl.priority ?? 'medium'}
                  onChange={(event) =>
                    setTpl({ ...tpl, priority: event.target.value as Priority })
                  }
                >
                  <option value="high">高</option>
                  <option value="medium">中</option>
                  <option value="low">低</option>
                </select>
              </div>
              <div className="field-control">
                <div className="field-label">
                  <span>现场责任人</span>
                  <span className="field-note">任务生成时自动带入</span>
                </div>
                <input
                  value={tpl.onsiteOwner ?? ''}
                  onChange={(event) => setTpl({ ...tpl, onsiteOwner: event.target.value })}
                  placeholder="可选"
                />
              </div>
              <div className="field-control">
                <div className="field-label">
                  <span>产线责任人</span>
                  <span className="field-note">方便跨班组协作</span>
                </div>
                <input
                  value={tpl.lineOwner ?? ''}
                  onChange={(event) => setTpl({ ...tpl, lineOwner: event.target.value })}
                  placeholder="可选"
                />
              </div>
            </div>
          </section>

          <section className="section-card">
            <div className="section-header">
              <div>
                <h3>计划周期</h3>
                <p>只配置“截止日”，无需执行日</p>
              </div>
            </div>
            <div className="section-grid">
              <div className="field-control">
                <div className="field-label">
                  <span>频率</span>
                </div>
                <select
                  value={tpl.schedule.type}
                  onChange={(event) => switchFrequency(event.target.value as 'weekly' | 'monthly')}
                >
                  <option value="weekly">每周</option>
                  <option value="monthly">每月</option>
                </select>
              </div>
              {tpl.schedule.type === 'monthly' && (
                <div className="field-control">
                  <div className="field-label">
                    <span>截止日</span>
                    <span className="field-note">1 - 31</span>
                  </div>
                  <input
                    type="number"
                    min={1}
                    max={31}
                    value={tpl.schedule.dayOfMonth ?? 1}
                    onChange={(event) => {
                      const raw = Number(event.target.value);
                      const safe = Number.isNaN(raw) ? 1 : raw;
                      setTpl({
                        ...tpl,
                        schedule: {
                          ...tpl.schedule,
                          dayOfMonth: Math.max(1, Math.min(31, safe)),
                        },
                      });
                    }}
                  />
                </div>
              )}
              
            </div>
            {tpl.schedule.type === 'weekly' && (
              <div className="field-control full">
                <div className="field-label">
                  <span>截止日</span>
                  <span className="field-note">选择每周的截止星期</span>
                </div>
                <div className="day-selector">
                  {WEEK_LABELS.map((label, index) => {
                    const selected = (tpl.schedule.daysOfWeek ?? [5])[0] === index;
                    return (
                      <button
                        type="button"
                        key={label}
                        className={`day-pill ${selected ? 'selected' : ''}`}
                        onClick={() => setTpl({ ...tpl!, schedule: { type: 'weekly', daysOfWeek: [index] } })}
                      >
                        周{label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            
            <label className="switch-control">
              <input type="checkbox" checked={autoRenew} onChange={(e) => setAutoRenew(e.target.checked)} />
              <div>
                <div>完成后自动续期</div>
                <small>本周/本月完成后自动生成下一期任务</small>
              </div>
            </label>
          </section>

          <section className="section-card">
            <div className="section-header">
              <div>
                <h3>默认字段</h3>
                <p>为每次生成的任务预填常用信息</p>
              </div>
            </div>
            <div className="defaults-grid">
              <div className="field-control full">
                <div className="field-label">
                  <span>详情</span>
                  <span className="field-note">补充背景或固定注意事项</span>
                </div>
                <textarea
                  rows={4}
                  value={tpl.defaults?.notes ?? ''}
                  onChange={(event) => updateDefaults('notes', event.target.value)}
                />
              </div>
            </div>
            <div className="field-control full">
              <div className="field-label">
                <span>下一步</span>
                <span className="field-note">提示协作者的下一行动</span>
              </div>
              <textarea
                className="next-step-textarea"
                rows={3}
                value={tpl.defaults?.nextStep ?? ''}
                onChange={(event) => updateDefaults('nextStep', event.target.value)}
                placeholder="把下一阶段的计划写清楚（支持多行）"
              />
            </div>
          </section>
        </div>
      )}
    </Modal>
  );
};
