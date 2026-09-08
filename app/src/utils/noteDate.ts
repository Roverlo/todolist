import dayjs from 'dayjs';
import type { Note } from '../types';

export const getNoteDate = (note: Note): string =>
    note.date || dayjs(note.createdAt).format('YYYY-MM-DD');

export const compareNotes = (a: Note, b: Note): number =>
    getNoteDate(b).localeCompare(getNoteDate(a)) || b.createdAt - a.createdAt || a.id.localeCompare(b.id);

export const isNoteDate = (date: string): boolean =>
    /^\d{4}-\d{2}-\d{2}$/.test(date) && dayjs(date).format('YYYY-MM-DD') === date;
