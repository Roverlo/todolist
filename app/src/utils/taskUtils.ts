import dayjs from 'dayjs';
import type { Filters, GroupBy, Project, SortRule, Task } from '../types';

export type Comparator = ':' | '<' | '>' | '<=' | '>=';

export interface DslToken {
  key: string;
  comparator: Comparator;
  value: string;
}

export interface ParsedSearch {
  tokens: DslToken[];
  textTerms: string[];
}

const STATUS_ORDER: Record<string, number> = {
  doing: 0,
  paused: 1,
  done: 2,
};

const PRIORITY_ORDER: Record<string, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

const normalize = (value?: string | null) => (value ?? '').toLowerCase();

export const parseSearchInput = (input: string): ParsedSearch => {
  const tokens: DslToken[] = [];
  const textTerms: string[] = [];

  const matches = input.match(/"[^"]+"|\S+/g) ?? [];
  matches.forEach((segment) => {
    let term = segment;
    const quoted = /^".*"$/.test(segment);
    if (quoted) {
      term = segment.slice(1, -1);
    }
    const colonIndex = term.indexOf(':');
    if (colonIndex === -1) {
      textTerms.push(term.toLowerCase());
      return;
    }
    const key = term.slice(0, colonIndex).trim();
    let valuePart = term.slice(colonIndex + 1).trim();
    let comparator: Comparator = ':';
    const comparatorMatch = valuePart.match(/^(<=|>=|<|>)/);
    if (comparatorMatch) {
      comparator = comparatorMatch[0] as Comparator;
      valuePart = valuePart.slice(comparator.length);
    }
    const value = valuePart.replace(/^"(.+)"$/, '$1');
    if (key) {
      tokens.push({ key: key.toLowerCase(), comparator, value });
    }
  });

  return { tokens, textTerms };
};

const compareText = (value: string | undefined, term: string) =>
  normalize(value).includes(term.toLowerCase());

const compareDateToken = (value: string | undefined, comparator: Comparator, target: string) => {
  if (!value) return false;
  const left = dayjs(value);
  const right = dayjs(target);
  if (!left.isValid() || !right.isValid()) return false;
  switch (comparator) {
    case '<':
      return left.isBefore(right, 'day');
    case '>':
      return left.isAfter(right, 'day');
    case '<=':
      return left.isSame(right, 'day') || left.isBefore(right, 'day');
    case '>=':
      return left.isSame(right, 'day') || left.isAfter(right, 'day');
    default:
      return left.isSame(right, 'day');
  }
};

export const matchesDslTokens = (
  task: Task,
  projectMap: Record<string, Project>,
  parsed: ParsedSearch,
) => {
  return parsed.tokens.every((token) => {
    const value = token.value.toLowerCase();
  switch (token.key) {
    case 'project':
      return normalize(projectMap[task.projectId]?.name).includes(value);
    case 'status':
      return normalize(task.status) === value;
      case 'priority':
        return normalize(task.priority) === value;
      case 'onsiteowner':
      case 'onsite':
        return compareText(task.onsiteOwner, value);
      case 'lineowner':
      case 'line':
        return compareText(task.lineOwner, value);
      case 'tag':
      case 'tags':
        return (task.tags ?? []).some((tag) => normalize(tag) === value || normalize(tag).includes(value));
      case 'due':
      case 'dueDate':
        return compareDateToken(task.dueDate, token.comparator, token.value);
      case 'created':
        return compareDateToken(dayjs(task.createdAt).format('YYYY-MM-DD'), token.comparator, token.value);
      default:
        return true;
    }
  });
};

const textArea = (task: Task, projectMap: Record<string, Project>) =>
  [
    task.title,
    task.nextStep,
    task.notes,
    task.onsiteOwner,
    task.lineOwner,
    (task.tags ?? []).join(','),
    projectMap[task.projectId]?.name,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

export const filterTasks = (
  tasks: Task[],
  filters: Filters,
  parsed: ParsedSearch,
  projectMap: Record<string, Project>,
) => {
  const terms = parsed.textTerms.filter(Boolean);
  return tasks.filter((task) => {
    if (filters.projectId) {
      if (filters.projectId === ('UNASSIGNED' as unknown as string)) {
        if (task.projectId) return false;
      } else if (task.projectId !== filters.projectId) return false;
    }
    if (filters.statuses && filters.statuses.length) {
      if (!filters.statuses.includes(task.status)) return false;
    } else if (filters.status && filters.status !== 'all' && task.status !== filters.status) {
      return false;
    }
    if (filters.priority && filters.priority !== 'all' && task.priority !== filters.priority)
      return false;
    if (filters.onsiteOwner && task.onsiteOwner !== filters.onsiteOwner) return false;
    if (filters.lineOwner && task.lineOwner !== filters.lineOwner) return false;
    if (filters.tags && filters.tags.length) {
      const tagSet = new Set(task.tags ?? []);
      const hasAll = filters.tags.every((tag) => tagSet.has(tag));
      if (!hasAll) return false;
    }
    if (filters.dueRange?.from) {
      if (!task.dueDate || dayjs(task.dueDate).isBefore(filters.dueRange.from, 'day')) {
        return false;
      }
    }
    if (filters.dueRange?.to) {
      if (!task.dueDate || dayjs(task.dueDate).isAfter(filters.dueRange.to, 'day')) {
        return false;
      }
    }
    if (terms.length) {
      const haystack = textArea(task, projectMap);
      const hasTerms = terms.every((term) => haystack.includes(term));
      if (!hasTerms) return false;
    }
    return matchesDslTokens(task, projectMap, parsed);
  });
};

const toSortable = (task: Task, key: SortRule['key'], projectMap: Record<string, Project>) => {
  switch (key) {
    case 'project':
      return projectMap[task.projectId]?.name ?? '';
    case 'title':
      return task.title;
    case 'status':
      return STATUS_ORDER[task.status] ?? 99;
    case 'priority':
      return PRIORITY_ORDER[task.priority ?? 'medium'] ?? 99;
    case 'dueDate':
      return task.dueDate ? dayjs(task.dueDate).valueOf() : Number.MAX_SAFE_INTEGER;
    case 'createdAt':
      return task.createdAt;
    case 'onsiteOwner':
      return (task.onsiteOwner ?? '').toLowerCase();
    case 'lineOwner':
      return (task.lineOwner ?? '').toLowerCase();
    case 'notes':
      return (task.notes ?? '').toLowerCase();
    case 'nextStep':
      return (task.nextStep ?? '').toLowerCase();
    case 'latestProgress': {
      const last = task.progress?.[task.progress.length - 1];
      return last ? `${last.status}-${last.note}`.toLowerCase() : '';
    }
    default:
      return (task.extras?.[key as string] ?? '').toLowerCase();
  }
};

export const sortTasks = (
  tasks: Task[],
  rules: SortRule[],
  projectMap: Record<string, Project>,
) => {
  const copy = [...tasks];
  copy.sort((a, b) => {
    // 当用户明确选择列排序时，完全按规则排序；仅在没有规则时按更新时间降序作为默认
    if (!rules.length) {
      if (a.updatedAt !== b.updatedAt) {
        return b.updatedAt - a.updatedAt;
      }
    }
    for (const rule of rules) {
      const av = toSortable(a, rule.key, projectMap);
      const bv = toSortable(b, rule.key, projectMap);
      if (av === bv) continue;
      if (typeof av === 'number' && typeof bv === 'number') {
        return rule.direction === 'asc' ? av - bv : bv - av;
      }
      const result = String(av).localeCompare(String(bv), 'zh');
      if (result !== 0) {
        return rule.direction === 'asc' ? result : -result;
      }
    }
    return 0;
  });
  return copy;
};

export interface GroupBucket {
  key: string;
  label: string;
  tasks: Task[];
}

export const groupTasks = (
  tasks: Task[],
  groupBy: GroupBy,
  projectMap: Record<string, Project>,
): GroupBucket[] => {
  if (!groupBy) {
    return [{ key: 'all', label: '全部', tasks }];
  }
  const buckets: Record<string, Task[]> = {};
  tasks.forEach((task) => {
    const key = groupBy === 'project' ? task.projectId : task.status;
    buckets[key] = buckets[key] ?? [];
    buckets[key].push(task);
  });
  return Object.entries(buckets).map(([key, bucket]) => {
    const label =
      groupBy === 'project' ? projectMap[key]?.name ?? '未分配项目' : key.toUpperCase();
    return { key, label, tasks: bucket };
  });
};

export const isOverdue = (task: Task, thresholdDays = 0) => {
  if (!task.dueDate) return false;
  const due = dayjs(task.dueDate).endOf('day');
  return dayjs().diff(due, 'day') > thresholdDays;
};

export const isDueSoon = (task: Task, thresholdDays = 3) => {
  if (!task.dueDate) return false;
  const diff = dayjs(task.dueDate).startOf('day').diff(dayjs().startOf('day'), 'day');
  return diff >= 0 && diff <= thresholdDays;
};
