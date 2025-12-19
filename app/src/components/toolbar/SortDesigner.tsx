import { useEffect, useState } from 'react';
import { Modal } from '../common/Modal';
import type { SortRule, SortScheme } from '../../types';

interface SortDesignerProps {
  open: boolean;
  rules: SortRule[];
  schemes: SortScheme[];
  onClose: () => void;
  onApply: (rules: SortRule[]) => void;
  onSaveScheme: (payload: { id?: string; name: string; rules: SortRule[] }) => void;
  onApplyScheme: (id: string) => void;
  onDeleteScheme: (id: string) => void;
}

const availableKeys: SortRule['key'][] = [
  'status',
  'dueDate',
  'priority',
  'createdAt',
  'owners',
];

export const SortDesigner = ({
  open,
  rules,
  schemes,
  onClose,
  onApply,
  onSaveScheme,
  onApplyScheme,
  onDeleteScheme,
}: SortDesignerProps) => {
  const [draft, setDraft] = useState<SortRule[]>(rules);

  useEffect(() => {
    setDraft(rules);
  }, [rules, open]);

  const updateRule = (index: number, data: Partial<SortRule>) => {
    setDraft((prev) => prev.map((rule, idx) => (idx === index ? { ...rule, ...data } : rule)));
  };

  const addRule = () => {
    setDraft((prev) => [...prev, { key: 'dueDate', direction: 'asc' }]);
  };

  const removeRule = (index: number) => {
    setDraft((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleApply = () => {
    onApply(draft);
    onClose();
  };

  const handleSaveScheme = () => {
    const name = prompt('方案名称');
    if (!name) return;
    onSaveScheme({ name, rules: draft });
  };

  return (
    <Modal
      open={open}
      title="排序方案"
      onClose={onClose}
      footer={
        <div className="modal-actions">
          <button type="button" onClick={handleSaveScheme}>
            保存方案
          </button>
          <button type="button" onClick={handleApply}>
            应用
          </button>
        </div>
      }
    >
      <div className="sort-rule-list">
        {draft.map((rule, index) => (
          <div key={`${rule.key}-${index}`} className="sort-rule">
            <select value={rule.key} onChange={(event) => updateRule(index, { key: event.target.value as SortRule['key'] })}>
              {availableKeys.map((key) => (
                <option key={key} value={key}>
                  {labelForKey(key)}
                </option>
              ))}
            </select>
            <select
              value={rule.direction}
              onChange={(event) => updateRule(index, { direction: event.target.value as SortRule['direction'] })}
            >
              <option value="asc">升序</option>
              <option value="desc">降序</option>
            </select>
            <button type="button" onClick={() => removeRule(index)}>
              删除
            </button>
          </div>
        ))}
        <button type="button" onClick={addRule}>
          添加排序字段
        </button>
      </div>
      <section className="sort-schemes">
        <h4>已保存方案</h4>
        {!schemes.length && <p className="muted">暂无方案</p>}
        <ul>
          {schemes.map((scheme) => (
            <li key={scheme.id} className="scheme-row">
              <span>{scheme.name}</span>
              <div>
                <button type="button" onClick={() => onApplyScheme(scheme.id)}>
                  应用
                </button>
                <button type="button" onClick={() => onSaveScheme({ id: scheme.id, name: scheme.name, rules: draft })}>
                  覆盖
                </button>
                <button type="button" onClick={() => onDeleteScheme(scheme.id)}>
                  删除
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </Modal>
  );
};

const labelForKey = (key: SortRule['key']) => {
  switch (key) {
    case 'status':
      return '状态';
    case 'dueDate':
      return '截止日';
    case 'priority':
      return '优先级';
    case 'createdAt':
      return '创建时间';
    case 'owners':
      return '责任人';
    default:
      return key;
  }
};
