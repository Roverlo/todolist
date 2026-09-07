import dayjs, { type Dayjs } from 'dayjs';
import { nanoid } from 'nanoid';
import type { RecurringTemplate, Task } from '../types';

type Schedule = RecurringTemplate['schedule'];

export const recurringPeriodStart = (date: Dayjs, type: Schedule['type']) => type === 'weekly'
  ? date.startOf('day').subtract((date.day() + 6) % 7, 'day')
  : date.startOf(type === 'monthly' ? 'month' : 'day');

export function upcomingRecurringDate(schedule: Schedule, from = dayjs()): Dayjs {
  const today = from.startOf('day');
  if (schedule.type === 'daily') return today;
  if (schedule.type === 'weekly') {
    const target = recurringPeriodStart(today, 'weekly').add(((schedule.daysOfWeek?.[0] ?? 1) + 6) % 7, 'day');
    return target.isBefore(today) ? target.add(7, 'day') : target;
  }
  const dom = Math.max(1, Math.min(31, schedule.dayOfMonth ?? 1));
  const start = today.startOf('month');
  const target = start.date(Math.min(dom, start.daysInMonth()));
  const next = start.add(1, 'month');
  return target.isBefore(today) ? next.date(Math.min(dom, next.daysInMonth())) : target;
}

export function nextRecurringTask(task: Task, templates: RecurringTemplate[], tasks: Task[], now = dayjs()): Task | undefined {
  const template = templates.find(t => t.id === task.extras?.recurrenceId);
  if (!template?.active) return;
  const { schedule } = template;
  const due = dayjs(task.dueDate || task.extras?.periodKey || task.createdAt);
  const reference = due.isAfter(now) ? due : now;
  const unit = schedule.type === 'daily' ? 'day' : schedule.type === 'weekly' ? 'week' : 'month';
  const start = recurringPeriodStart(reference, schedule.type).add(Math.max(1, schedule.interval ?? 1), unit);
  const date = upcomingRecurringDate(schedule, start);
  const periodKey = recurringPeriodStart(date, schedule.type).format(schedule.type === 'monthly' ? 'YYYY-MM' : 'YYYY-MM-DD');
  if (tasks.some(t => t.extras?.recurrenceId === template.id && t.extras?.periodKey === periodKey)) return;
  const deadline = template.dueStrategy === 'endOfWeek' ? recurringPeriodStart(date, 'weekly').add(6, 'day')
    : template.dueStrategy === 'endOfMonth' ? date.endOf('month') : date;
  return {
    id: nanoid(12), projectId: template.projectId, title: template.title, status: 'doing',
    priority: template.priority ?? 'medium', owners: template.owners,
    dueDate: template.dueStrategy === 'none' ? undefined : deadline.format('YYYY-MM-DD'),
    createdAt: now.valueOf(), updatedAt: now.valueOf(),
    notes: template.defaults?.notes, nextStep: template.defaults?.nextStep, tags: template.defaults?.tags ?? [],
    subtasks: (template.subtasks ?? []).map(t => ({ ...t, id: nanoid(8), completed: false, createdAt: now.valueOf() })),
    progress: [], history: [], extras: { recurrenceId: template.id, periodKey, visibleFrom: start.format('YYYY-MM-DD') },
  };
}
