import { useState } from 'react';
import { useAppStoreShallow } from '../../state/appStore';
import type { Priority } from '../../types';
import { CustomSelect } from '../ui/CustomSelect';

export const PrimaryToolbar = () => {
  const { filters, setFilters, dictionary } = useAppStoreShallow((state) => ({
    filters: state.filters,
    setFilters: state.setFilters,
    dictionary: state.dictionary,
  }));

  const [dueFrom, setDueFrom] = useState(filters.dueRange?.from ?? '');
  const [dueTo, setDueTo] = useState(filters.dueRange?.to ?? '');

  const resetFilters = () => {
    setDueFrom('');
    setDueTo('');
    setFilters({
      statuses: [],
      status: 'all',
      priority: 'all',
      owner: undefined,
      dueRange: undefined,
    });
  };

  const priorityOptions = [
    { value: 'all', label: '全部' },
    { value: 'high', label: '高' },
    { value: 'medium', label: '中' },
    { value: 'low', label: '低' },
  ];

  // 合并后的责任人选项
  const ownerOptions = [
    { value: '', label: '全部' },
    ...[...new Set([...dictionary.onsiteOwners, ...dictionary.lineOwners])]
      .sort()
      .map((o) => ({ value: o, label: o })),
  ];

  return (
    <div className='filters-card' id='filters-panel' style={{ display: 'none' }}>
      <div className='filters-row-top'>
        <div className='section-title' style={{ marginBottom: 0 }}>
          筛选
        </div>
        <button className='btn btn-ghost' type='button' onClick={resetFilters}>
          清空筛选
        </button>
      </div>

      <div className='filters-row-bottom'>
        <div className='filter-item'>
          <span className='filter-label'>优先级</span>
          <CustomSelect
            value={filters.priority ?? 'all'}
            options={priorityOptions}
            onChange={(val) =>
              setFilters({
                priority: val === 'all' ? 'all' : (val as Priority),
              })
            }
          />
        </div>
        <div className='filter-item'>
          <span className='filter-label'>责任人</span>
          <CustomSelect
            value={filters.owner ?? ''}
            options={ownerOptions}
            onChange={(val) => setFilters({ owner: val || undefined })}
          />
        </div>
        <div className='filter-item'>
          <span className='filter-label'>截止日期 起</span>
          <input
            type='date'
            className='filter-control'
            value={dueFrom}
            onChange={(event) => {
              setDueFrom(event.target.value);
              setFilters({ dueRange: { ...filters.dueRange, from: event.target.value || undefined } });
            }}
          />
        </div>
        <div className='filter-item'>
          <span className='filter-label'>截止日期 止</span>
          <input
            type='date'
            className='filter-control'
            value={dueTo}
            onChange={(event) => {
              setDueTo(event.target.value);
              setFilters({ dueRange: { ...filters.dueRange, to: event.target.value || undefined } });
            }}
          />
        </div>
      </div>
    </div>
  );
};
