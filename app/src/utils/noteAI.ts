import type { AIGeneratedTask } from '../types';
import { isNoteDate } from './noteDate';

export function noteTextForAI(html: string): string {
    const document = new DOMParser().parseFromString(html, 'text/html');
    document.querySelectorAll('script, style, img').forEach(node => node.remove());
    document.querySelectorAll('br').forEach(node => node.replaceWith('\n'));
    document.querySelectorAll('p, div, li, tr, h1, h2, h3, h4, h5, h6, blockquote').forEach(node => node.append('\n'));
    return (document.body.textContent || '').replace(/\n{3,}/g, '\n\n').trim();
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
