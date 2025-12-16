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

export type TaskZone = 'urgent' | 'future' | 'nodate' | 'done';

export const getTaskZone = (task: Task): TaskZone => {
  if (task.status === 'done') return 'done';
  if (!task.dueDate) return 'nodate';

  const now = dayjs().startOf('day');
  const dueDate = dayjs(task.dueDate).startOf('day');
  const diff = dueDate.diff(now, 'day');

  if (diff <= 0) return 'urgent'; // 逾期或今天
  return 'future'; // 未来
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
    // 添加进展记录内容到搜索范围
    ...(task.progress ?? []).map((p) => p.note),
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
    // 在汇总视图（projectId 为 undefined）时，排除回收站任务
    if (!filters.projectId) {
      const project = projectMap[task.projectId];
      if (project?.name === '回收站') return false;
    }

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
    // 0. 置顶任务 (Pinned) - 始终最前 (除非已完成)
    // 如果任务已完成 (done)，则不参与置顶逻辑 (或者置顶的已完成任务也排在未完成任务后面)
    // 这里设定：未完成的置顶任务 > 未完成的普通任务 > 已完成任务
    const isPinnedA = a.isPinned && a.status !== 'done';
    const isPinnedB = b.isPinned && b.status !== 'done';
    if (isPinnedA && !isPinnedB) return -1;
    if (!isPinnedA && isPinnedB) return 1;

    // Smart Hybrid Sort: 当首要规则是按截止日期升序时，启用智能分层排序
    // Layer 1 (Urgent): 逾期 & 今天 -> 按优先级降序
    // Layer 2 (Future): 未来 -> 按日期升序
    // Layer 3 (No Date): 无日期 -> 按优先级降序
    if (rules.length > 0 && rules[0].key === 'dueDate' && rules[0].direction === 'asc') {
      const statusA = STATUS_ORDER[a.status] ?? 99;
      const statusB = STATUS_ORDER[b.status] ?? 99;

      // 0. 已完成任务沉底 (Done always at bottom)
      // 如果两个都是已完成，或者其中一个是，先按状态分
      if (a.status === 'done' || b.status === 'done') {
        if (a.status === b.status) {
          // 都是已完成，按完成时间倒序（如果没有 completedAt，用 updatedAt）
          return b.updatedAt - a.updatedAt;
        }
        return statusA - statusB;
      }

      // 1. 获取优先级权重
      const pA = PRIORITY_ORDER[a.priority ?? 'medium'] ?? 1; // 0:high, 1:medium, 2:low
      const pB = PRIORITY_ORDER[b.priority ?? 'medium'] ?? 1;
      // 反转权重以便计算 (High=3, Med=2, Low=1)
      const wA = 3 - pA;
      const wB = 3 - pB;

      // 2. 解析日期
      const now = dayjs().startOf('day');
      const dateA = a.dueDate ? dayjs(a.dueDate).startOf('day') : null;
      const dateB = b.dueDate ? dayjs(b.dueDate).startOf('day') : null;

      // 3. 判断层级
      // Layer 1: Urgent (Overdue or Today)
      const isUrgentA = dateA && dateA.diff(now, 'day') <= 0;
      const isUrgentB = dateB && dateB.diff(now, 'day') <= 0;

      // Layer 3: No Date
      const isNoDateA = !dateA;
      const isNoDateB = !dateB;

      // === 层级比较 ===

      // A 是紧急，B 不是 -> A 前
      if (isUrgentA && !isUrgentB) return -1;
      // B 是紧急，A 不是 -> B 前
      if (!isUrgentA && isUrgentB) return 1;

      // A 无日期，B 有日期 -> B 前 (无日期沉底，但比已完成高)
      if (isNoDateA && !isNoDateB) return 1;
      if (!isNoDateA && isNoDateB) return -1;

      // === 同层级内部比较 ===

      // Case 1: 都在紧急区 (Urgent)
      if (isUrgentA && isUrgentB) {
        // 先比优先级 (权重高的在前)
        if (wA !== wB) return wB - wA;
        // 优先级相同，比逾期程度 (日期越早越前)
        return dateA!.diff(dateB!);
      }

      // Case 2: 都在未来区 (Future)
      if (dateA && dateB && !isUrgentA && !isUrgentB) {
        // 先比日期 (日期近的前)
        const diff = dateA.diff(dateB);
        if (diff !== 0) return diff;
        // 日期相同，比优先级
        return wB - wA;
      }

      // Case 3: 都无日期 (No Date)
      if (isNoDateA && isNoDateB) {
        // 比优先级
        if (wA !== wB) return wB - wA;
        // 优先级相同，按创建时间倒序 (新的在前)
        return b.createdAt - a.createdAt;
      }
    }

    // 默认排序逻辑（保留用于其他规则）
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
