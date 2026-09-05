import React, { useMemo, useCallback, useState } from 'react';
import type { Task } from '../../types';
import { useVisibleTasks } from '../../hooks/useVisibleTasks';
import { useAppStoreShallow } from '../../state/appStore';
import { TaskRow } from './TaskRow';
import { confirm } from '@tauri-apps/plugin-dialog';
import { DeleteChoiceDialog } from '../ui/DeleteChoiceDialog';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { BulkActionsBar } from '../bulk/BulkActionsBar';
import { getTaskZone, type TaskZone } from '../../utils/taskUtils';

export interface TaskTableProps {
  onTaskFocus: (taskId: string) => void;
  activeTaskId?: string | null;
}

export const TaskTable = React.memo(({ onTaskFocus, activeTaskId }: TaskTableProps) => {
  const { tasks, projectMap } = useVisibleTasks();
  const [deleteCandidateId, setDeleteCandidateId] = React.useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);

  const { deleteTask, moveToUncategorized, restoreTask, hardDeleteTask, updateTask, addTask, settings, bulkDeleteTasks, togglePin } = useAppStoreShallow((state) => ({
    deleteTask: state.deleteTask,
    moveToUncategorized: state.moveToUncategorized,
    restoreTask: state.restoreTask,
    hardDeleteTask: state.hardDeleteTask,
    updateTask: state.updateTask,
    addTask: state.addTask,
    settings: state.settings,
    bulkDeleteTasks: state.bulkDeleteTasks,
    togglePin: state.togglePin,
  }));

  // 判断是否为回收站视图
  const isTrashView = useMemo(() => {
    return tasks.length > 0 && tasks.every(t => projectMap[t.projectId]?.name === '回收站');
  }, [tasks, projectMap]);

  // 可选任务（非回收站任务）
  const selectableTasks = useMemo(() => {
    return tasks.filter(t => projectMap[t.projectId]?.name !== '回收站');
  }, [tasks, projectMap]);

  const handleSelectTask = useCallback((taskId: string, selected: boolean) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (selected) {
        next.add(taskId);
      } else {
        next.delete(taskId);
      }
      return next;
    });
  }, []);

  const handleSelectAll = useCallback((selected: boolean) => {
    if (selected) {
      setSelectedIds(new Set(selectableTasks.map(t => t.id)));
    } else {
      setSelectedIds(new Set());
    }
  }, [selectableTasks]);

  const handleClearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const handleBulkDelete = useCallback(() => {
    setShowBulkDeleteConfirm(true);
  }, []);

  const confirmBulkDelete = useCallback(() => {
    const ids = Array.from(selectedIds);
    if (bulkDeleteTasks) {
      bulkDeleteTasks(ids);
    } else {
      ids.forEach(id => deleteTask(id));
    }
    setSelectedIds(new Set());
    setShowBulkDeleteConfirm(false);
  }, [selectedIds, bulkDeleteTasks, deleteTask]);

  const handleDeleteTask = useCallback((taskId: string) => {
    setDeleteCandidateId(taskId);
  }, []);

  const handleRestoreTask = useCallback((taskId: string) => {
    restoreTask(taskId);
  }, [restoreTask]);

  const handleHardDeleteTask = useCallback(async (taskId: string) => {
    const confirmed = await confirm('确认彻底删除？此操作无法撤销。', {
      title: 'ProjectTodo',
      kind: 'warning'
    });
    if (confirmed) {
      hardDeleteTask(taskId);
    }
  }, [hardDeleteTask]);

  const handleQuickStatusChange = useCallback((taskId: string, newStatus: 'doing' | 'done' | 'paused') => {
    updateTask(taskId, { status: newStatus });
  }, [updateTask]);

  const handleQuickPriorityChange = useCallback((taskId: string, newPriority: Task['priority']) => {
    updateTask(taskId, { priority: newPriority });
  }, [updateTask]);

  const handleTogglePin = useCallback((taskId: string) => {
    togglePin(taskId);
  }, [togglePin]);

  const handleCopyTask = useCallback((taskId: string) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;
    addTask({
      projectId: task.projectId,
      title: `${task.title} (副本)`,
      status: 'doing',
      priority: task.priority,
      dueDate: task.dueDate,
      owners: task.owners,
      onsiteOwner: task.onsiteOwner,
      lineOwner: task.lineOwner,
      nextStep: task.nextStep,
      notes: task.notes,
      tags: task.tags,
    });
  }, [tasks, addTask]);

  const rows = useMemo(
    () =>
      tasks.map((task) => {
        const project = projectMap[task.projectId];
        const latest = task.progress?.length ? task.progress[task.progress.length - 1] : undefined;
        const zone = getTaskZone(task);
        return {
          task,
          project,
          latestNote: latest?.note ?? '',
          latestProgressAt: latest?.at,
          zone
        };
      }),
    [tasks, projectMap],
  );

  const zoneLabels: Record<TaskZone, { emoji: string; label: string }> = {
    urgent: { emoji: '🔴', label: '紧急区 (逾期/今日)' },
    future: { emoji: '📅', label: '规划区 (未来)' },
    nodate: { emoji: '⚪', label: '待定区 (无截止日期)' },
    done: { emoji: '✅', label: '已完成' },
  };

  const showCheckbox = !isTrashView && selectableTasks.length > 0;
  const allSelected = showCheckbox && selectableTasks.length > 0 && selectableTasks.every(t => selectedIds.has(t.id));
  const someSelected = selectedIds.size > 0;

  return (
    <div className='task-table-wrapper'>
      {/* 批量操作工具栏 */}
      {someSelected && (
        <BulkActionsBar
          selectedIds={Array.from(selectedIds)}
          onClear={handleClearSelection}
          onBulkDelete={handleBulkDelete}
        />
      )}

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
            <th>
              {showCheckbox && (
                <label className='task-checkbox-wrapper header-checkbox' onClick={(e) => e.stopPropagation()} title='全选/取消全选'>
                  <input
                    type='checkbox'
                    className='task-checkbox'
                    checked={allSelected}
                    onChange={(e) => handleSelectAll(e.target.checked)}
                  />
                  <span className='task-checkbox-custom' />
                </label>
              )}
              项目 / 标题
            </th>
            <th>详情</th>
            <th>最近进展</th>
            <th>下一步计划</th>
            <th style={{ width: 220 }}>状态 / 时间 / 操作</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={5}>
                <div className='empty-state'>
                  <div className='empty-state-icon'>📋</div>
                  <div className='empty-state-title'>暂无任务</div>
                  <div className='empty-state-desc'>
                    点击页面右上角的「新建任务」按钮创建第一个任务
                  </div>
                  <div className='empty-state-tips'>
                    💡 提示：使用快捷键 <kbd>N</kbd> 可快速新建任务
                  </div>
                </div>
              </td>
            </tr>
          ) : (
            rows.map(({ task, project, latestNote, zone }, index) => {
              const prevZone = index > 0 ? rows[index - 1].zone : null;
              const showZoneHeader = zone !== prevZone;

              return (
                <React.Fragment key={task.id}>
                  {showZoneHeader && (
                    <tr className='zone-header'>
                      <td colSpan={5}>
                        <span className='zone-emoji'>{zoneLabels[zone].emoji}</span>
                        <span className='zone-label'>{zoneLabels[zone].label}</span>
                      </td>
                    </tr>
                  )}
                  <TaskRow
                    task={task}
                    project={project}
                    latestNote={latestNote}
                    latestProgressAt={rows[index].latestProgressAt}
                    onTaskFocus={onTaskFocus}
                    onDeleteTask={handleDeleteTask}
                    onRestoreTask={handleRestoreTask}
                    onHardDeleteTask={handleHardDeleteTask}
                    onQuickStatusChange={handleQuickStatusChange}
                    onQuickPriorityChange={handleQuickPriorityChange}
                    onTogglePin={handleTogglePin}
                    onCopyTask={handleCopyTask}
                    trashRetentionDays={settings.trashRetentionDays ?? 60}
                    highlightRows={settings.highlightRows}
                    isActive={activeTaskId === task.id}
                    fontSize={settings.listFontSize}
                    showCheckbox={showCheckbox}
                    isSelected={selectedIds.has(task.id)}
                    onSelect={handleSelectTask}
                  />
                </React.Fragment>
              );
            })
          )}
        </tbody>
      </table>


      <DeleteChoiceDialog
        open={!!deleteCandidateId}
        title="删除任务"
        message="请选择删除方式："
        onMoveToTrash={() => {
          if (deleteCandidateId) {
            deleteTask(deleteCandidateId);
            setDeleteCandidateId(null);
          }
        }}
        onMoveToUncategorized={() => {
          if (deleteCandidateId) {
            moveToUncategorized(deleteCandidateId);
            setDeleteCandidateId(null);
          }
        }}
        onCancel={() => setDeleteCandidateId(null)}
      />

      <ConfirmDialog
        open={showBulkDeleteConfirm}
        title="批量删除"
        message={`确定要删除选中的 ${selectedIds.size} 项任务吗？任务将被移到回收站。`}
        confirmLabel="确定删除"
        cancelLabel="取消"
        variant="danger"
        onConfirm={confirmBulkDelete}
        onCancel={() => setShowBulkDeleteConfirm(false)}
      />
    </div>
  );
});
