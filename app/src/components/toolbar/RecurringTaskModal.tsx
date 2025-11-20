import { useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { Modal } from '../common/Modal';
import { useAppStoreShallow } from '../../state/appStore';
import type { Priority, RecurringTemplate, Status } from '../../types';

const WEEK_LABELS = ['日', '一', '二', '三', '四', '五', '六'];

const dueStrategyOptions: Array<{
  value: RecurringTemplate['dueStrategy'];
  label: string;
  hint: string;
}> = [
  { value: 'sameDay', label: '当天', hint: '生成日 = 截止日' },
  { value: 'endOfWeek', label: '周末', hint: '自动顺延到本周日' },
  { value: 'endOfMonth', label: '月底', hint: '对齐当月最后一天' },
  { value: 'none', label: '不设置', hint: '生成后自行补充' },
];

const defaultAnchorDate = () => dayjs().format('YYYY-MM-DD');

type DefaultFieldKey = 'nextStep' | 'notes';

interface RecurringTaskModalProps {
  open: boolean;
  onClose: () => void;
}

export const RecurringTaskModal = ({ open, onClose }: RecurringTaskModalProps) => {
  const { projects, addRecurringTemplate, updateRecurringTemplate, materializeRecurringTasks } =
    useAppStoreShallow((state) => ({
      projects: state.projects,
      addRecurringTemplate: state.addRecurringTemplate,
      updateRecurringTemplate: state.updateRecurringTemplate,
      materializeRecurringTasks: state.materializeRecurringTasks,
    }));

  const [tpl, setTpl] = useState<RecurringTemplate | null>(null);

  const projectName = useMemo(() => {
    if (!tpl) return '';
    return projects.find((p) => p.id === tpl.projectId)?.name ?? '';
  }, [projects, tpl]);

  const scheduleSummary = useMemo(() => {
    if (!tpl) return '';
    const interval = Math.max(tpl.schedule.interval ?? 1, 1);
    const unit = tpl.schedule.type === 'weekly' ? '周' : '月';
    const prefix = interval > 1 ? `每${interval}${unit}` : `每${unit}`;
    const anchorLabel = tpl.schedule.anchorDate
      ? `（自 ${dayjs(tpl.schedule.anchorDate).format('YYYY-MM-DD')} 起）`
      : '';
    if (tpl.schedule.type === 'weekly') {
      const days = (tpl.schedule.daysOfWeek ?? []).sort((a, b) => a - b);
      if (!days.length) return '请选择执行日';
      return `${prefix} · ${days.map((d) => `周${WEEK_LABELS[d]}`).join(' / ')}${anchorLabel}`;
    }
    return `${prefix} · ${tpl.schedule.dayOfMonth ?? 1} 日${anchorLabel}`;
  }, [tpl]);

  useEffect(() => {
    if (!open) return;
    setTpl({
      id: '',
      projectId: projects[0]?.id ?? '',
      title: '',
      status: 'paused' as Status,
      priority: 'medium' as Priority,
      schedule: {
        type: 'weekly',
        daysOfWeek: [1],
        flexible: false,
        interval: 1,
        anchorDate: defaultAnchorDate(),
      },
      dueStrategy: 'endOfWeek',
      defaults: {},
      active: true,
    });
  }, [open, projects]);

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

  const toggleDay = (day: number) => {
    if (!tpl) return;
    const picked = new Set(tpl.schedule.daysOfWeek ?? []);
    if (picked.has(day)) {
      picked.delete(day);
    } else {
      picked.add(day);
    }
    const days = Array.from(picked);
    if (!days.length) days.push(day);
    setTpl({
      ...tpl,
      schedule: {
        ...tpl.schedule,
        daysOfWeek: days.sort((a, b) => a - b),
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
              daysOfWeek: (tpl.schedule.daysOfWeek?.length
                ? [...(tpl.schedule.daysOfWeek ?? [])]
                : [1]),
              flexible: tpl.schedule.flexible,
              interval: tpl.schedule.interval ?? 1,
              anchorDate: tpl.schedule.anchorDate ?? defaultAnchorDate(),
            }
          : {
              type: 'monthly',
              dayOfMonth: tpl.schedule.dayOfMonth ?? 1,
              flexible: tpl.schedule.flexible,
              interval: tpl.schedule.interval ?? 1,
              anchorDate: tpl.schedule.anchorDate ?? defaultAnchorDate(),
            },
    });
  };

  const saveTpl = () => {
    if (!tpl) return;
    if (!tpl.title.trim()) {
      alert('请输入名称');
      return;
    }
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
      title="新建周期任务"
      onClose={onClose}
      width={920}
      footer={
        <div className="modal-actions">
          <button type="button" className="primary-btn" onClick={generateCurrentPeriod}>
            生成本期任务
          </button>
          <button type="button" onClick={saveTpl}>
            保存周期规则
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
              <span className="section-chip">{tpl.active ? '模板启用中' : '模板停用'}</span>
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
                <p>{scheduleSummary || '选择执行频率与到期策略'}</p>
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
                    <span>执行日</span>
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
              <div className="field-control">
                <div className="field-label">
                  <span>重复节奏</span>
                  <span className="field-note">支持双周 / 多月任务</span>
                </div>
                <div className="interval-editor">
                  <span>每</span>
                  <input
                    type="number"
                    min={1}
                    value={tpl.schedule.interval ?? 1}
                    onChange={(event) => {
                      const raw = Number(event.target.value);
                      const safe = Number.isNaN(raw) ? 1 : Math.max(1, raw);
                      setTpl({
                        ...tpl,
                        schedule: { ...tpl.schedule, interval: safe },
                      });
                    }}
                  />
                  <span>{tpl.schedule.type === 'weekly' ? '周' : '个月'}</span>
                </div>
              </div>
              <div className="field-control">
                <div className="field-label">
                  <span>锚点日期</span>
                  <span className="field-note">决定复杂周期的起点</span>
                </div>
                <input
                  type="date"
                  value={tpl.schedule.anchorDate ?? defaultAnchorDate()}
                  onChange={(event) =>
                    setTpl({
                      ...tpl,
                      schedule: { ...tpl.schedule, anchorDate: event.target.value },
                    })
                  }
                />
              </div>
            </div>

            {tpl.schedule.type === 'weekly' && (
              <div className="field-control full">
                <div className="field-label">
                  <span>执行日</span>
                  <span className="field-note">至少选择一个</span>
                </div>
                <div className="day-selector">
                  {WEEK_LABELS.map((label, index) => {
                    const selected = (tpl.schedule.daysOfWeek ?? []).includes(index);
                    return (
                      <button
                        type="button"
                        key={label}
                        className={`day-pill ${selected ? 'selected' : ''}`}
                        onClick={() => toggleDay(index)}
                      >
                        周{label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="field-control full">
              <div className="field-label">
                <span>到期策略</span>
                <span className="field-note">决定生成任务的截止日期</span>
              </div>
              <div className="segmented-control">
                {dueStrategyOptions.map((option) => (
                  <button
                    type="button"
                    key={option.value}
                    className={`segment ${tpl.dueStrategy === option.value ? 'active' : ''}`}
                    onClick={() => setTpl({ ...tpl, dueStrategy: option.value })}
                  >
                    <strong>{option.label}</strong>
                    <span>{option.hint}</span>
                  </button>
                ))}
              </div>
            </div>

            <label className="switch-control">
              <input
                type="checkbox"
                checked={!!tpl.schedule.flexible}
                onChange={(event) =>
                  setTpl({
                    ...tpl,
                    schedule: { ...tpl.schedule, flexible: event.target.checked },
                  })
                }
              />
              <div>
                <div>允许跳过/顺延</div>
                <small>当某周不满足条件时自动跳过或顺延</small>
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
            </div>
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
          </section>
        </div>
      )}
    </Modal>
  );
};
