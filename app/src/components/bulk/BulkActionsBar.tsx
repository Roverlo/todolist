import { useState } from 'react';
import { useAppStoreShallow } from '../../state/appStore';

interface BulkActionsBarProps {
  selectedIds: string[];
  onClear: () => void;
}

export const BulkActionsBar = ({ selectedIds, onClear }: BulkActionsBarProps) => {
  const { bulkUpdateTasks, ensureProjectByName } = useAppStoreShallow((state) => ({
    bulkUpdateTasks: state.bulkUpdateTasks,
    ensureProjectByName: state.ensureProjectByName,
  }));

  const [dueDate, setDueDate] = useState('');
  const [onsiteOwner, setOnsiteOwner] = useState('');
  const [lineOwner, setLineOwner] = useState('');

  if (!selectedIds.length) {
    return null;
  }

  const handleMoveProject = () => {
    const name = prompt('Target project name');
    if (!name) return;
    const projectId = ensureProjectByName(name);
    bulkUpdateTasks(selectedIds, { projectId });
  };

  const handleClearTags = () => {
    bulkUpdateTasks(selectedIds, { tags: [] });
  };

  const handleStatusChange = (status: string) => {
    bulkUpdateTasks(selectedIds, { status: status as 'doing' | 'done' | 'paused' });
  };

  const handlePriorityChange = (priority: string) => {
    bulkUpdateTasks(selectedIds, { priority: priority as 'high' | 'medium' | 'low' });
  };

  const applyOwners = () => {
    bulkUpdateTasks(selectedIds, {
      onsiteOwner: onsiteOwner || undefined,
      lineOwner: lineOwner || undefined,
    });
    setOnsiteOwner('');
    setLineOwner('');
  };

  const applyDueDate = () => {
    bulkUpdateTasks(selectedIds, {
      dueDate: dueDate || undefined,
    });
  };

  return (
    <div className='bulk-actions-bar'>
      <div>
        Selected {selectedIds.length} items
        <button type='button' onClick={onClear}>
          Cancel
        </button>
      </div>
      <div className='bulk-actions-group'>
        <button type='button' onClick={handleMoveProject}>
          Move to Project
        </button>
        <label>
          Status
          <select
            value=''
            onChange={(event) => {
              handleStatusChange(event.target.value);
              event.target.selectedIndex = 0;
            }}
          >
            <option value='' disabled>
              Choose…
            </option>
            <option value='doing'>进行中</option>
            <option value='done'>已完成</option>
            <option value='paused'>挂起</option>
          </select>
        </label>
        <label>
          Priority
          <select
            value=''
            onChange={(event) => {
              handlePriorityChange(event.target.value);
              event.target.selectedIndex = 0;
            }}
          >
            <option value='' disabled>
              Choose…
            </option>
            <option value='high'>High</option>
            <option value='medium'>Medium</option>
            <option value='low'>Low</option>
          </select>
        </label>
        <label>
          Due
          <input
            type='date'
            value={dueDate}
            onChange={(event) => setDueDate(event.target.value)}
            onBlur={applyDueDate}
          />
        </label>
        <button type='button' onClick={applyDueDate}>
          Apply Due
        </button>
        <label>
          Onsite Owner
          <input
            type='text'
            value={onsiteOwner}
            onChange={(event) => setOnsiteOwner(event.target.value)}
            onBlur={applyOwners}
          />
        </label>
        <label>
          Line Owner
          <input
            type='text'
            value={lineOwner}
            onChange={(event) => setLineOwner(event.target.value)}
            onBlur={applyOwners}
          />
        </label>
        <button type='button' onClick={applyOwners}>
          Apply Owners
        </button>
        <button type='button' onClick={handleClearTags}>
          Clear tags
        </button>
      </div>
    </div>
  );
};
