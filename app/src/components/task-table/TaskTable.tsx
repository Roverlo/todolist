import React, { useMemo, useCallback } from 'react';
import { useVisibleTasks } from '../../hooks/useVisibleTasks';
import { useAppStoreShallow } from '../../state/appStore';
import { TaskRow } from './TaskRow';

export interface TaskTableProps {
  onTaskFocus: (taskId: string) => void;
}

export const TaskTable = React.memo(({ onTaskFocus }: TaskTableProps) => {
  const { tasks, projectMap } = useVisibleTasks();
  const { deleteTask } = useAppStoreShallow((state) => ({
    deleteTask: state.deleteTask,
  }));

  const handleDeleteTask = useCallback((taskId: string) => {
    deleteTask(taskId);
  }, [deleteTask]);

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
            <TaskRow
              key={task.id}
              task={task}
              project={project}
              latestNote={latestNote}
              onTaskFocus={onTaskFocus}
              onDeleteTask={handleDeleteTask}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
});
