import type { Node as TiptapNode } from '@tiptap/core';
import type { Node } from '@tiptap/pm/model';
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';
import { closeHistory } from '@tiptap/pm/history';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import dayjs from 'dayjs';

const completionTime = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : null;
const newTaskTime = 'new';

export function withTaskCompletion(taskItem: TiptapNode) {
    return taskItem.extend({
        addAttributes() {
            return {
                ...this.parent?.(),
                createdAt: {
                    // New schema nodes get a timestamp in the originating transaction;
                    // Empty string overrides the schema default when parsing legacy HTML
                    // (Tiptap drops null parse results), so opening never invents history.
                    default: newTaskTime,
                    keepOnSplit: false,
                    parseHTML: element => completionTime(element.getAttribute('data-created-at')) || '',
                    renderHTML: attributes => completionTime(attributes.createdAt)
                        ? { 'data-created-at': attributes.createdAt } : {},
                },
                completedAt: {
                    default: null,
                    keepOnSplit: false,
                    parseHTML: element => element.getAttribute('data-checked') === 'true'
                        ? completionTime(element.getAttribute('data-completed-at')) : null,
                    renderHTML: attributes => attributes.checked && completionTime(attributes.completedAt)
                        ? { 'data-completed-at': attributes.completedAt } : {},
                },
            };
        },
        addNodeView() {
            const render = this.parent?.();
            if (!render) return null;
            return props => {
                const view = render(props);
                const checkbox = (view.dom as HTMLElement).querySelector<HTMLInputElement>(':scope > label input[type="checkbox"]');
                const change = (event: Event) => {
                    // Capture this item's checkbox before the library's single-item handler.
                    // Nested checkbox events also pass through this DOM: leave those to their own item.
                    if (!checkbox || event.target !== checkbox || !props.editor.isEditable) return;
                    event.stopImmediatePropagation();
                    const pos = props.getPos();
                    if (typeof pos !== 'number') return;
                    const { editor } = props;
                    const { tr } = editor.state;
                    const node = tr.doc.nodeAt(pos);
                    if (!node || node.type.name !== 'taskItem') return;
                    const checked = checkbox.checked;
                    const now = new Date().toISOString();
                    tr.setNodeMarkup(pos, undefined, { ...node.attrs, checked, completedAt: checked ? now : null });
                    if (checked) node.descendants((child, offset) => {
                        if (child.type.name === 'taskItem' && !child.attrs.checked) {
                            tr.setNodeMarkup(pos + 1 + offset, undefined, { ...child.attrs, checked: true, completedAt: now });
                        }
                    });
                    // The next toolbar action belongs to the clicked item, not a stale
                    // caret in another task's child list, quote or table cell.
                    tr.setSelection(TextSelection.near(tr.doc.resolve(pos + 1)));
                    // Completion and its descendants are one undo step, separate from typing and later clicks.
                    editor.view.dispatch(closeHistory(tr));
                    editor.view.dispatch(closeHistory(editor.state.tr));
                    editor.commands.focus(undefined, { scrollIntoView: false });
                };
                view.dom.addEventListener('change', change, true);
                return {
                    ...view,
                    destroy() {
                        view.dom.removeEventListener('change', change, true);
                        view.destroy?.();
                    },
                };
            };
        },
        addProseMirrorPlugins() {
            const key = new PluginKey<DecorationSet>('noteTaskCompletionTime');
            const decorate = (doc: Node) => {
                const widgets: Decoration[] = [];
                const today = dayjs();
                doc.descendants((node, pos) => {
                    if (node.type.name !== 'taskItem' || !node.firstChild) return;
                    const createdAt = completionTime(node.attrs.createdAt);
                    const completedAt = node.attrs.checked ? completionTime(node.attrs.completedAt) : null;
                    for (const [kind, value, prefix, side] of [
                        ['created', createdAt, '创建', 1], ['completed', completedAt, '完成', 2],
                    ] as const) {
                        // Keep the typing placeholder on a newly inserted empty task row.
                        if (!value || (!completedAt && !node.firstChild.content.size)) continue;
                        const date = dayjs(value);
                        const label = `${prefix} ${date.format(date.isSame(today, 'day') ? 'HH:mm'
                            : date.isSame(today, 'year') ? 'MM-DD HH:mm' : 'YYYY-MM-DD HH:mm')}`;
                        const title = `${prefix}于 ${date.format('YYYY-MM-DD HH:mm:ss')}`;
                        // Two independent widgets keep both dates outside editable text and marks.
                        widgets.push(Decoration.widget(pos + node.firstChild.nodeSize, () => {
                            const time = document.createElement('time');
                            time.className = `note-task-${kind}-at`;
                            time.dateTime = value;
                            time.textContent = label;
                            time.title = title;
                            time.setAttribute('aria-label', title);
                            time.contentEditable = 'false';
                            return time;
                        }, { key: `${pos}:${kind}:${value}:${label}`, side, marks: [] }));
                    }
                });
                return DecorationSet.create(doc, widgets);
            };
            return [...(this.parent?.() || []), new Plugin({
                key,
                appendTransaction: (transactions, _oldState, state) => {
                    if (!transactions.some(tr => tr.docChanged)) return null;
                    const tr = state.tr;
                    const now = new Date().toISOString();
                    state.doc.descendants((node, pos) => {
                        if (node.type.name === 'taskItem' && node.attrs.createdAt === newTaskTime) {
                            tr.setNodeMarkup(pos, undefined, { ...node.attrs, createdAt: now });
                        }
                    });
                    return tr.docChanged ? tr : null;
                },
                state: {
                    init: (_, state) => decorate(state.doc),
                    apply: (tr, previous) => tr.docChanged || tr.getMeta(key) ? decorate(tr.doc) : previous,
                },
                props: { decorations: state => key.getState(state) },
                view: view => {
                    let day = dayjs().format('YYYY-MM-DD');
                    const refreshDay = () => {
                        const currentDay = dayjs().format('YYYY-MM-DD');
                        if (currentDay === day) return;
                        day = currentDay;
                        view.dispatch(view.state.tr.setMeta(key, true));
                    };
                    const timer = window.setInterval(refreshDay, 60_000);
                    window.addEventListener('focus', refreshDay);
                    return { destroy() {
                        window.clearInterval(timer);
                        window.removeEventListener('focus', refreshDay);
                    } };
                },
            })];
        },
    });
}
