import type { NoteTaskTimeSettings } from '../types';

export const DEFAULT_NOTE_TASK_TIME: NoteTaskTimeSettings = {
    showCreated: true,
    showCompleted: true,
    createdColor: '#6b7280',
    completedColor: '#6b7280',
};

export function noteTaskTimeSettings(value?: Partial<NoteTaskTimeSettings>): NoteTaskTimeSettings {
    const color = (value: unknown) => typeof value === 'string' && /^#[\da-f]{6}$/i.test(value) ? value : '#6b7280';
    return {
        showCreated: value?.showCreated !== false,
        showCompleted: value?.showCompleted !== false,
        createdColor: color(value?.createdColor),
        completedColor: color(value?.completedColor),
    };
}
