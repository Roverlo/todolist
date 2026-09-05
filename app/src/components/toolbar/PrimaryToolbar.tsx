import { useAppStoreShallow } from '../../state/appStore';
import type { Priority } from '../../types';
import { CustomSelect } from '../ui/CustomSelect';

export const PrimaryToolbar = () => {
  const { filters, setFilters, dictionary } = useAppStoreShallow((state) => ({
    filters: state.filters,
    setFilters: state.setFilters,
    dictionary: state.dictionary,
  }));

  const resetFilters = () => {
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
    <div className='filters-card' id='filters-panel' role='region' aria-label='任务筛选'>
        <div className='filter-item'>
          <span className='filter-label'>优先级</span>
          <CustomSelect
            aria-label='筛选优先级'
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
            aria-label='筛选责任人'
            value={filters.owner ?? ''}
            options={ownerOptions}
            onChange={(val) => setFilters({ owner: val || undefined })}
          />
        </div>
        <div className='filter-item'>
          <span className='filter-label'>截止日期</span>
          <input
            type='date'
            aria-label='截止日期起'
            className='filter-control'
            value={filters.dueRange?.from ?? ''}
            onChange={(event) => {
              setFilters({ dueRange: { ...filters.dueRange, from: event.target.value || undefined } });
            }}
          />
        </div>
        <div className='filter-item'>
          <span className='filter-label'>至</span>
          <input
            type='date'
            aria-label='截止日期止'
            className='filter-control'
            value={filters.dueRange?.to ?? ''}
            onChange={(event) => {
              setFilters({ dueRange: { ...filters.dueRange, to: event.target.value || undefined } });
            }}
          />
        </div>
        <button className='btn btn-ghost' type='button' onClick={resetFilters}>清空筛选</button>
    </div>
  );
};
