import dayjs from 'dayjs';
import type { Note } from '../types';

export const getNoteDate = (note: Note): string =>
    note.date || dayjs(note.updatedAt).format('YYYY-MM-DD');

export const isNoteDate = (date: string): boolean =>
    /^\d{4}-\d{2}-\d{2}$/.test(date) && dayjs(date).format('YYYY-MM-DD') === date;
