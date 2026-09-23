import { Node } from '@tiptap/core';
import dayjs from 'dayjs';
import { isNoteDate } from '../../../utils/noteDate';

export const NOTE_DATE_EDIT_EVENT = 'note-date-edit';
export const dateWeekday = (date: string) => isNoteDate(date) ? `周${'日一二三四五六'[dayjs(date).day()]}` : '';

// Keep the saved date readable by older clients, exports and the AI text parser.
export const NoteDate = Node.create({
    name: 'noteDate', group: 'inline', inline: true, atom: true,
    addAttributes() {
        return { date: { default: '', rendered: false, parseHTML: element => element.getAttribute('datetime') } };
    },
    parseHTML() {
        return [{ tag: 'time[data-type="noteDate"]', getAttrs: element => isNoteDate(element.getAttribute('datetime') || '') ? {} : false }];
    },
    renderHTML({ node }) {
        return ['time', { 'data-type': 'noteDate', datetime: node.attrs.date }, node.attrs.date];
    },
    renderText({ node }) { return node.attrs.date; },
    addNodeView() {
        return ({ node, editor, getPos }) => {
            const dom = document.createElement('time');
            dom.className = 'note-date-chip';
            dom.dataset.type = 'noteDate';
            dom.dateTime = node.attrs.date;
            dom.dataset.weekday = dateWeekday(node.attrs.date);
            dom.textContent = node.attrs.date;
            dom.contentEditable = 'false';
            dom.tabIndex = 0;
            dom.setAttribute('role', 'button');
            dom.setAttribute('aria-haspopup', 'dialog');
            dom.setAttribute('aria-label', `修改日期 ${node.attrs.date} ${dom.dataset.weekday}`);
            dom.title = '点击修改日期';
            const edit = () => {
                const position = getPos();
                if (!editor.isEditable || typeof position !== 'number') return;
                editor.chain().focus().setNodeSelection(position).run();
                dom.dispatchEvent(new CustomEvent(NOTE_DATE_EDIT_EVENT, { bubbles: true }));
            };
            dom.onclick = edit;
            dom.onkeydown = event => {
                if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); edit(); }
            };
            return { dom, stopEvent: event => event.type === 'click' || (event instanceof KeyboardEvent && ['Enter', ' '].includes(event.key)) };
        };
    },
});
