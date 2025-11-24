import React, { memo } from 'react';
import dayjs from 'dayjs';
import type { Task, Project } from '../../types';

interface TaskRowProps {
  task: Task;
  project?: Project;
  latestNote?: string;
  onTaskFocus: (taskId: string) => void;
  onDeleteTask: (taskId: string) => void;
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

const MetaBlock = memo(({ task }: { task: Task }) => {
  const dueLabel = () => {
    if (!task.dueDate) return '无截止日期';
    const diff = dayjs(task.dueDate).startOf('day').diff(dayjs().startOf('day'), 'day');
    if (diff === 0) return '今日到期';
    if (diff > 0) return `剩余 ${diff} 天`;
    return `逾期 ${Math.abs(diff)} 天`;
  };

  return (
    <div className='meta-block'>
      <div className='meta-line'>
        <span className='meta-label'>创建</span>
        <span className='meta-value'>{dayjs(task.createdAt).format('MM-DD HH:mm')}</span>
      </div>
      <div className='meta-line'>
        <span className='meta-label'>截止</span>
        <span className={`meta-value ${task.dueDate && dayjs(task.dueDate).isBefore(dayjs(), 'day') ? 'text-danger' : ''}`}>
          {dueLabel()}
        </span>
      </div>
      <div className='meta-line'>
        <span className='meta-label'>现场</span>
        <span className='meta-value'>{task.onsiteOwner || '--'}</span>
      </div>
      <div className='meta-line'>
        <span className='meta-label'>产线</span>
        <span className='meta-value'>{task.lineOwner || '--'}</span>
      </div>
    </div>
  );
});

MetaBlock.displayName = 'MetaBlock';

export const TaskRow = memo(({ 
  task, 
  project, 
  latestNote, 
  onTaskFocus, 
  onDeleteTask 
}: TaskRowProps) => {
  const handleRowClick = (e: React.MouseEvent) => {
    // 如果点击的是按钮，不触发行点击
    if ((e.target as HTMLElement).closest('button')) {
      return;
    }
    onTaskFocus(task.id);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDeleteTask(task.id);
  };

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    onTaskFocus(task.id);
  };

  const priorityClass = {
    high: 'border-l-priority-high',
    medium: 'border-l-priority-medium',
    low: 'border-l-priority-low',
  }[task.priority ?? 'medium'];

  return (
    <tr className='task-row' onClick={handleRowClick}>
      <td className={`col-main ${priorityClass}`}>
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
        <div className='field-text'>{task.notes || '--'}</div>
      </td>
      <td className='col-text'>
        <div className='field-label'>最近进展</div>
        <div className='field-text'>{latestNote || '--'}</div>
      </td>
      <td className='col-text'>
        <div className='field-label'>下一步计划</div>
        <div className='field-text'>{task.nextStep || '--'}</div>
      </td>
      <td className='col-meta'>
        <MetaBlock task={task} />
        <div className='meta-actions'>
          <button 
            className='btn-xs btn-xs-outline' 
            type='button' 
            onClick={handleEdit}
            aria-label={`编辑任务: ${task.title}`}
          >
            编辑
          </button>
          <button
            className='btn-xs btn-xs-danger'
            type='button'
            onClick={handleDelete}
            aria-label={`删除任务: ${task.title}`}
          >
            删除
          </button>
        </div>
      </td>
    </tr>
  );
});

TaskRow.displayName = 'TaskRow';
