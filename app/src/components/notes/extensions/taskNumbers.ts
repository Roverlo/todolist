import type { Node } from '@tiptap/pm/model';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

// Number the current document view, without changing saved content or undo history.
export function taskNumbersPlugin() {
    const key = new PluginKey<DecorationSet>('noteTaskNumbers');
    const decorate = (doc: Node) => {
        const decorations: Decoration[] = [];
        const visit = (parent: Node, start: number, prefix = '') => {
            let count = 0;
            parent.forEach(node => { if (node.type.name === 'taskList') count += node.childCount; });
            const width = prefix.length + String(count).length;
            let index = 0;
            parent.forEach((node, offset) => {
                const pos = start + offset;
                if (node.type.name === 'taskList') {
                    node.forEach((item, itemOffset) => {
                        const itemPos = pos + 1 + itemOffset;
                        const number = `${prefix}${++index}`;
                        decorations.push(Decoration.node(itemPos, itemPos + item.nodeSize, {
                            'data-task-number': number,
                            style: `--note-task-number-width: ${width}ch`,
                        }));
                        visit(item, itemPos + 1, `${number}.`);
                    });
                } else if (!node.isLeaf) {
                    // Quotes, table cells and ordinary lists have independent numbering scopes.
                    visit(node, pos + 1);
                }
            });
        };
        visit(doc, 0);
        return DecorationSet.create(doc, decorations);
    };
    return new Plugin({
        key,
        state: {
            init: (_, state) => decorate(state.doc),
            apply: (tr, previous) => tr.docChanged ? decorate(tr.doc) : previous,
        },
        props: { decorations: state => key.getState(state) },
    });
}
