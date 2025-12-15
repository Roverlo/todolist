import { useState } from 'react';
import { useAppStoreShallow } from '../../state/appStore';
import { CustomSelect } from '../ui/CustomSelect';
import type { Status, Priority } from '../../types';

interface BulkActionsBarProps {
  selectedIds: string[];
  onClear: () => void;
  onBulkDelete: () => void;
}

const statusOptions = [
  { value: 'doing', label: '进行中' },
  { value: 'paused', label: '挂起' },
  { value: 'done', label: '已完成' },
];

const priorityOptions = [
  { value: 'high', label: '高优先级' },
  { value: 'medium', label: '中优先级' },
  { value: 'low', label: '低优先级' },
];

export const BulkActionsBar = ({ selectedIds, onClear, onBulkDelete }: BulkActionsBarProps) => {
  const { bulkUpdateTasks, projects } = useAppStoreShallow((state) => ({
    bulkUpdateTasks: state.bulkUpdateTasks,
    projects: state.projects,
  }));

  const [showProjectSelect, setShowProjectSelect] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState('');

  if (!selectedIds.length) {
    return null;
  }

  const projectOptions = projects
    .filter((p) => p.name !== '回收站')
    .map((p) => ({ value: p.id, label: p.name }));

  const handleStatusChange = (status: string) => {
    bulkUpdateTasks(selectedIds, { status: status as Status });
  };

  const handlePriorityChange = (priority: string) => {
    bulkUpdateTasks(selectedIds, { priority: priority as Priority });
  };

  const handleMoveProject = () => {
    if (selectedProjectId) {
      bulkUpdateTasks(selectedIds, { projectId: selectedProjectId });
      setShowProjectSelect(false);
      setSelectedProjectId('');
    }
  };

  return (
    <div className='bulk-actions-bar'>
      <div className='bulk-actions-left'>
        <span className='bulk-selected-count'>
          已选择 <strong>{selectedIds.length}</strong> 项任务
        </span>
        <button className='btn btn-ghost bulk-clear-btn' type='button' onClick={onClear}>
          取消选择
        </button>
      </div>

      <div className='bulk-actions-right'>
        {/* 状态修改 */}
        <div className='bulk-action-item'>
          <span className='bulk-action-label'>状态</span>
          <CustomSelect
            value=""
            options={[{ value: '', label: '选择...' }, ...statusOptions]}
            onChange={(val) => val && handleStatusChange(val)}
            placeholder="选择状态"
          />
        </div>

        {/* 优先级修改 */}
        <div className='bulk-action-item'>
          <span className='bulk-action-label'>优先级</span>
          <CustomSelect
            value=""
            options={[{ value: '', label: '选择...' }, ...priorityOptions]}
            onChange={(val) => val && handlePriorityChange(val)}
            placeholder="选择优先级"
          />
        </div>

        {/* 移动项目 */}
        <div className='bulk-action-item'>
          {showProjectSelect ? (
            <div className='bulk-project-select-row'>
              <CustomSelect
                value={selectedProjectId}
                options={projectOptions}
                onChange={setSelectedProjectId}
                placeholder="选择项目"
              />
              <button className='btn btn-primary-outline btn-sm' type='button' onClick={handleMoveProject} disabled={!selectedProjectId}>
                确定
              </button>
              <button className='btn btn-ghost btn-sm' type='button' onClick={() => setShowProjectSelect(false)}>
                取消
              </button>
            </div>
          ) : (
            <button className='btn btn-outline btn-sm' type='button' onClick={() => setShowProjectSelect(true)}>
              移动到...
            </button>
          )}
        </div>

        {/* 批量删除 */}
        <button className='btn btn-danger-outline btn-sm' type='button' onClick={onBulkDelete}>
          批量删除
        </button>
      </div>
    </div>
  );
};
