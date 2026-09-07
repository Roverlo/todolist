import type { AIGeneratedTask } from '../types';
import { isNoteDate } from './noteDate';

export function noteContentForAI(html: string): { text: string; imageCount: number } {
    const document = new DOMParser().parseFromString(html, 'text/html');
    const imageCount = document.querySelectorAll('img').length;
    document.querySelectorAll('script, style, img').forEach(node => node.remove());
    document.querySelectorAll('a[href]').forEach(node => {
        const href = node.getAttribute('href') || '';
        if (/^https?:\/\//i.test(href) && href !== node.textContent?.trim()) node.append(` (${href})`);
    });
    document.querySelectorAll('li').forEach(node => {
        if (!node.textContent?.trim()) return;
        const checkbox = Array.from(node.querySelectorAll('input[type="checkbox"]')).find(input => input.closest('li') === node);
        const isTask = node.hasAttribute('data-checked') || node.getAttribute('data-type') === 'taskItem' || checkbox;
        const checked = node.hasAttribute('data-checked') ? node.getAttribute('data-checked') === 'true' : checkbox?.hasAttribute('checked');
        const parent = node.parentElement;
        const marker = isTask ? `- [${checked ? 'x' : ' '}] ` : parent?.tagName === 'OL'
            ? `${(parent as HTMLOListElement).start + Array.from(parent.children).indexOf(node)}. ` : '- ';
        node.prepend(marker);
    });
    document.querySelectorAll('br').forEach(node => node.replaceWith('\n'));
    document.querySelectorAll('p, div, li, tr, h1, h2, h3, h4, h5, h6, blockquote').forEach(node => node.append('\n'));
    // Convert inner tables first, preserving empty columns and explicit merged-cell spans.
    Array.from(document.querySelectorAll('table')).reverse().forEach(table => {
        if (!table.textContent?.trim()) { table.remove(); return; }
        const rows = Array.from(table.rows).map(row => '| ' + Array.from(row.cells).map(cell => {
            const span = (cell.colSpan > 1 ? `[跨${cell.colSpan}列]` : '') + (cell.rowSpan > 1 ? `[跨${cell.rowSpan}行]` : '');
            return (cell.textContent || '').replace(/\s+/g, ' ').trim().replace(/\|/g, '\\|') + span;
        }).join(' | ') + ' |');
        table.replaceWith('\n[表格]\n' + rows.join('\n') + '\n[/表格]\n');
    });
    return { text: (document.body.textContent || '').replace(/\n{3,}/g, '\n\n').trim(), imageCount };
}

export function parseGeneratedTasks(response: unknown): AIGeneratedTask[] {
    if (!response || typeof response !== 'object' || !('tasks' in response) || !Array.isArray(response.tasks)) {
        throw new Error('AI 返回的任务格式不正确，请重试');
    }
    const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
    const date = (value: unknown) => isNoteDate(text(value)) ? text(value) : undefined;
    return response.tasks.map((task: Record<string, unknown>) => {
        if (!task || typeof task !== 'object' || !text(task.title)) throw new Error('AI 返回了没有标题的任务，请重试');
        return {
            title: text(task.title), notes: text(task.notes), nextStep: text(task.nextStep), owner: text(task.owner),
            priority: task.priority === 'high' || task.priority === 'low' ? task.priority : 'medium',
            dueDate: date(task.dueDate), suggestedProject: text(task.suggestedProject),
            isRecurring: task.isRecurring === true, recurringHint: text(task.recurringHint),
            subtasks: Array.isArray(task.subtasks) ? task.subtasks.filter(subtask => subtask && text(subtask.title)).map(subtask => ({
                title: text(subtask.title), owner: text(subtask.owner), dueDate: date(subtask.dueDate),
            })) : [],
        };
    });
}
