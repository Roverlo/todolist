import { useMemo } from 'react';
import dayjs from 'dayjs';
import { useVisibleTasks } from '../../hooks/useVisibleTasks';
import { useAppStoreShallow } from '../../state/appStore';
import type { Task } from '../../types';

export interface TaskTableProps {
  onTaskFocus: (taskId: string) => void;
}

const statusLabel: Record<Task['status'], string> = {
  doing: '进行中',
  paused: '挂起',
  done: '已完成',
};

const priorityLabel: Record<NonNullable<Task['priority']>, string> = {
  high: '高优',
  medium: '中优',
  low: '低优',
};

export const TaskTable = ({ onTaskFocus }: TaskTableProps) => {
  const { tasks, projectMap } = useVisibleTasks();
  const { deleteTask } = useAppStoreShallow((state) => ({
    deleteTask: state.deleteTask,
  }));

  const rows = useMemo(
    () =>
      tasks.map((task) => {
        const project = projectMap[task.projectId];
        const latest = task.progress?.length ? task.progress[task.progress.length - 1] : undefined;
        return { task, project, latestNote: latest?.note ?? '' };
      }),
    [tasks, projectMap],
  );

  return (
    <div className='task-table-wrapper'>
      <table className='task-table'>
        <colgroup>
          <col style={{ width: '220px' }} />
          <col style={{ width: 'calc((100% - 440px) / 3)' }} />
          <col style={{ width: 'calc((100% - 440px) / 3)' }} />
          <col style={{ width: 'calc((100% - 440px) / 3)' }} />
          <col style={{ width: '220px' }} />
        </colgroup>
        <thead>
          <tr>
            <th>项目 / 标题</th>
            <th>详情</th>
            <th>最近进展</th>
            <th>下一步计划</th>
            <th style={{ width: 220 }}>状态 / 时间 / 操作</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ task, project, latestNote }) => (
            <tr key={task.id} className='task-row' onClick={() => onTaskFocus(task.id)}>
              <td className='col-main'>
                <div className='project-name'>{project?.name ?? '未分类'}</div>
                <div className='task-title-main'>{task.title}</div>
                <div className='task-tags-row'>
                  <span
                    className={`tag-pill ${
                      task.status === 'done'
                        ? 'tag-status-done'
                        : task.status === 'paused'
                        ? 'tag-status-paused'
                        : 'tag-status-doing'
                    }`}
                  >
                    {statusLabel[task.status]}
                  </span>
                  <span
                    className={`tag-pill ${
                      task.priority === 'high'
                        ? 'tag-priority-high'
                        : task.priority === 'low'
                        ? 'tag-priority-low'
                        : 'tag-priority-medium'
                    }`}
                  >
                    {priorityLabel[task.priority ?? 'medium']}
                  </span>
                </div>
              </td>
              <td className='col-text'>
                <div className='field-label'>详情</div>
                <div className='field-text'>{task.notes ?? '--'}</div>
              </td>
              <td className='col-text'>
                <div className='field-label'>最近进展</div>
                <div className='field-text'>{latestNote || '--'}</div>
              </td>
              <td className='col-text'>
                <div className='field-label'>下一步计划</div>
                <div className='field-text'>{task.nextStep ?? '--'}</div>
              </td>
              <td className='col-meta'>
                <MetaBlock task={task} />
                <div className='meta-actions'>
                  <button className='btn-xs btn-xs-outline' type='button' onClick={() => onTaskFocus(task.id)}>
                    编辑
                  </button>
                  <button
                    className='btn-xs btn-xs-danger'
                    type='button'
                    onClick={() => deleteTask(task.id)}
                  >
                    删除
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const MetaBlock = ({ task }: { task: Task }) => {
  const due = formatDue(task);
  return (
    <>
      <div className='meta-row'>
        <span className='meta-label'>截止</span>
        <span className={due.isSoon ? 'meta-due-soon' : ''}>{due.text}</span>
      </div>
      <div className='meta-row'>
        <span className='meta-label'>现场责任人</span>
        <span>{task.onsiteOwner ?? '--'}</span>
      </div>
      <div className='meta-row'>
        <span className='meta-label'>产线责任人</span>
        <span>{task.lineOwner ?? '--'}</span>
      </div>
      <div className='meta-row'>
        <span className='meta-label'>创建时间</span>
        <span>{dayjs(task.createdAt).format('YYYY-MM-DD')}</span>
      </div>
    </>
  );
};

const formatDue = (task: Task) => {
  if (!task.dueDate) return { text: '--', isSoon: false };
  const txt = dayjs(task.dueDate).format('YYYY-MM-DD');
  const diff = dayjs(task.dueDate).startOf('day').diff(dayjs().startOf('day'), 'day');
  const isSoon = diff >= 0 && diff <= 3;
  if (diff === 0) return { text: `${txt}（今日）`, isSoon: true };
  if (diff > 0) return { text: `${txt}（剩 ${diff} 天）`, isSoon };
  return { text: `${txt}（逾期 ${Math.abs(diff)} 天）`, isSoon: false };
};
