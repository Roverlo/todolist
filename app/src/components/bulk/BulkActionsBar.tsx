import { useAppStoreShallow } from '../../state/appStore';
import { CustomSelect } from '../ui/CustomSelect';
import type { Status, Priority } from '../../types';

interface BulkActionsBarProps {
  selectedIds: string[];
  onClear: () => void;
  onBulkDelete: () => void;
}

const statusOptions = [
  { value: 'doing', label: '🔵 进行中' },
  { value: 'paused', label: '🟡 挂起' },
  { value: 'done', label: '🟢 已完成' },
];

const priorityOptions = [
  { value: 'high', label: '🔴 高' },
  { value: 'medium', label: '🟠 中' },
  { value: 'low', label: '🔵 低' },
];

export const BulkActionsBar = ({ selectedIds, onClear, onBulkDelete }: BulkActionsBarProps) => {
  const { bulkUpdateTasks, projects } = useAppStoreShallow((state) => ({
    bulkUpdateTasks: state.bulkUpdateTasks,
    projects: state.projects,
  }));

  if (!selectedIds.length) {
    return null;
  }

  const projectOptions = projects
    .filter((p) => p.name !== '回收站')
    .map((p) => ({ value: p.id, label: p.name }));

  const handleStatusChange = (status: string) => {
    if (status) {
      bulkUpdateTasks(selectedIds, { status: status as Status });
    }
  };

  const handlePriorityChange = (priority: string) => {
    if (priority) {
      bulkUpdateTasks(selectedIds, { priority: priority as Priority });
    }
  };

  const handleMoveProject = (projectId: string) => {
    if (projectId) {
      bulkUpdateTasks(selectedIds, { projectId });
    }
  };

  return (
    <div className='bulk-actions-bar'>
      {/* 左侧：选中计数和取消 */}
      <div className='bulk-actions-left'>
        <span className='bulk-selected-badge'>
          <span className='bulk-check-icon'>✓</span>
          <span className='bulk-count'>{selectedIds.length}</span>
          项已选
        </span>
        <button className='bulk-cancel-btn' type='button' onClick={onClear}>
          ✕
        </button>
      </div>

      {/* 分隔线 */}
      <div className='bulk-divider' />

      {/* 右侧：批量操作 */}
      <div className='bulk-actions-right'>
        {/* 状态修改 */}
        <CustomSelect
          value=""
          options={[{ value: '', label: '📋 状态' }, ...statusOptions]}
          onChange={handleStatusChange}
          placeholder="📋 状态"
        />

        {/* 优先级修改 */}
        <CustomSelect
          value=""
          options={[{ value: '', label: '🔥 优先级' }, ...priorityOptions]}
          onChange={handlePriorityChange}
          placeholder="🔥 优先级"
        />

        {/* 移动项目 */}
        <CustomSelect
          value=""
          options={[{ value: '', label: '📁 移动' }, ...projectOptions]}
          onChange={handleMoveProject}
          placeholder="📁 移动"
        />

        {/* 批量删除 */}
        <button className='bulk-delete-btn' type='button' onClick={onBulkDelete}>
          <span className='bulk-delete-icon'>🗑</span>
          <span className='bulk-delete-text'>删除</span>
        </button>
      </div>
    </div>
  );
};
