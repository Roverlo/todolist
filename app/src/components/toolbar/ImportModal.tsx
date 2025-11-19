import { useState } from 'react';
import type { ChangeEvent } from 'react';
import Papa from 'papaparse';
import type { ParseResult } from 'papaparse';
import dayjs from 'dayjs';
import { Modal } from '../common/Modal';
import type { Task } from '../../types';

const TARGET_FIELDS = [
  'project',
  'title',
  'status',
  'priority',
  'dueDate',
  'createdAt',
  'onsiteOwner',
  'lineOwner',
  'nextStep',
  'tags',
] as const;

type TargetField = (typeof TARGET_FIELDS)[number];

interface ImportModalProps {
  open: boolean;
  onClose: () => void;
  onImport: (tasks: (Partial<Task> & { projectId: string; title: string })[]) => void;
  ensureProject: (name: string) => string;
}

type CsvRow = Record<string, string>;

export const ImportModal = ({ open, onClose, onImport, ensureProject }: ImportModalProps) => {
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<CsvRow[]>([]);
  const [mapping, setMapping] = useState<Record<TargetField, string>>(() =>
    Object.fromEntries(TARGET_FIELDS.map((field) => [field, field])) as Record<TargetField, string>,
  );
  const [errors, setErrors] = useState<string[]>([]);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    Papa.parse<CsvRow>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result: ParseResult<CsvRow>) => {
        const data = result.data.filter((row) => Object.keys(row).length > 0);
        if (!data.length) {
          setErrors(['CSV file has no data']);
          return;
        }
        const headerList = Object.keys(data[0]);
        setHeaders(headerList);
        setRows(data);
        const defaultMapping = { ...mapping };
        TARGET_FIELDS.forEach((field) => {
          if (headerList.includes(field)) {
            defaultMapping[field] = field;
          }
        });
        setMapping(defaultMapping);
      },
    });
  };

  const convertRows = () => {
    const result: (Partial<Task> & { projectId: string; title: string })[] = [];
    const newErrors: string[] = [];
    rows.forEach((row, index) => {
      const rowNumber = index + 2; // header = 1
      const getValue = (field: TargetField) => row[mapping[field]];
      const projectName = getValue('project');
      const title = getValue('title');
      if (!projectName || !title) {
        newErrors.push(`Missing project or title at row ${rowNumber}`);
        return;
      }
      const status = normalizeStatus(getValue('status'));
      const priority = normalizePriority(getValue('priority'));
      const dueDate = normalizeDate(getValue('dueDate'));
      const createdAtValue = normalizeDate(getValue('createdAt'), true);
      result.push({
        projectId: ensureProject(projectName),
        title: title.trim(),
        status,
        priority,
        dueDate,
        createdAt: createdAtValue ? dayjs(createdAtValue).valueOf() : undefined,
        onsiteOwner: getValue('onsiteOwner') || undefined,
        lineOwner: getValue('lineOwner') || undefined,
        nextStep: getValue('nextStep') || undefined,
        tags: splitTags(getValue('tags')),
      });
    });
    setErrors(newErrors);
    return newErrors.length ? [] : result;
  };

  const handleImport = () => {
    const mapped = convertRows();
    if (!mapped.length) return;
    onImport(mapped);
    onClose();
  };

  return (
    <Modal
      open={open}
      title="Import CSV"
      onClose={onClose}
      footer={
        <button type="button" onClick={handleImport} disabled={!rows.length}>
          Import
        </button>
      }
    >
      <div className="import-section">
        <input type="file" accept=".csv,text/csv" onChange={handleFileChange} />
        {!rows.length && <p className="muted">上传 CSV 以配置字段映射</p>}
      </div>
      {!!rows.length && (
        <>
          <section className="mapping-section">
            <h4>字段映射</h4>
            {TARGET_FIELDS.map((field) => (
              <label key={field}>
                {field}
                <select
                  value={mapping[field] || ''}
                  onChange={(event) =>
                    setMapping((prev) => ({ ...prev, [field]: event.target.value }))
                  }
                >
                  <option value="">Unmapped</option>
                  {headers.map((header) => (
                    <option key={header} value={header}>
                      {header}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </section>
          <section className="preview-section">
            <h4>预览</h4>
            <table>
              <thead>
                <tr>
                  {headers.map((header) => (
                    <th key={header}>{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 5).map((row, idx) => (
                  <tr key={idx}>
                    {headers.map((header) => (
                      <td key={header}>{row[header]}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
      {!!errors.length && (
        <div className="error-panel">
          {errors.map((error) => (
            <p key={error}>{error}</p>
          ))}
        </div>
      )}
    </Modal>
  );
};

const splitTags = (value?: string) =>
  value
    ? value
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean)
    : [];

const normalizeStatus = (value?: string): Task['status'] => {
  switch ((value ?? '').toLowerCase()) {
    case 'doing':
    case 'in-progress':
    case '进行中':
      return 'doing';
    case 'done':
    case '完成':
      return 'done';
    case 'paused':
    case '挂起':
      return 'paused';
    default:
      return 'paused';
  }
};

const normalizePriority = (value?: string): Task['priority'] => {
  switch ((value ?? '').toLowerCase()) {
    case 'high':
    case '高':
      return 'high';
    case 'low':
    case '低':
      return 'low';
    default:
      return 'medium';
  }
};

const normalizeDate = (value?: string, allowTimestamp = false) => {
  if (!value) return undefined;
  if (allowTimestamp && /^\d+$/.test(value)) {
    const timestamp = Number(value);
    return dayjs(timestamp).format('YYYY-MM-DD');
  }
  const parsed = dayjs(value);
  return parsed.isValid() ? parsed.format('YYYY-MM-DD') : undefined;
};
