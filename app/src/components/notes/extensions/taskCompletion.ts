import type { Node as TiptapNode } from '@tiptap/core';
import type { Node } from '@tiptap/pm/model';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { closeHistory } from '@tiptap/pm/history';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import dayjs from 'dayjs';

const completionTime = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : null;

export function withTaskCompletion(taskItem: TiptapNode) {
    return taskItem.extend({
        addAttributes() {
            return {
                ...this.parent?.(),
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
                doc.descendants((node, pos) => {
                    const completedAt = completionTime(node.attrs.completedAt);
                    if (node.type.name !== 'taskItem' || !node.attrs.checked || !completedAt || !node.firstChild) return;
                    widgets.push(Decoration.widget(pos + 1 + node.firstChild.nodeSize, () => {
                        const time = document.createElement('time');
                        time.className = 'note-task-completed-at';
                        time.dateTime = completedAt;
                        time.textContent = `完成于 ${dayjs(completedAt).format('YYYY-MM-DD HH:mm:ss')}`;
                        time.contentEditable = 'false';
                        return time;
                    }, { key: `${pos}:${completedAt}`, side: -1 }));
                });
                return DecorationSet.create(doc, widgets);
            };
            return [...(this.parent?.() || []), new Plugin({
                key,
                state: {
                    init: (_, state) => decorate(state.doc),
                    apply: (tr, previous) => tr.docChanged ? decorate(tr.doc) : previous,
                },
                props: { decorations: state => key.getState(state) },
            })];
        },
    });
}
