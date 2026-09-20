import type { Command } from '@tiptap/core';
import type { Node } from '@tiptap/pm/model';
import { NodeSelection, TextSelection } from '@tiptap/pm/state';
import { closeHistory } from '@tiptap/pm/history';

// Reorder whole sibling nodes so their formatting and child lists travel together.
export const sortNoteTasks = (completedFirst: boolean): Command => ({ tr, dispatch }) => {
    const { selection } = tr;
    const { $from, $to } = selection;
    let depth = $from.depth;
    while (depth > 0 && ($from.node(depth).type.name !== 'taskList'
        || $to.depth < depth || $from.start(depth) !== $to.start(depth))) depth--;
    if (!depth) return false;

    const list = $from.node(depth);
    const start = $from.start(depth);
    const items: { node: Node; offset: number }[] = [];
    list.forEach((node, offset) => items.push({ node, offset }));
    const sorted = [...items].sort((a, b) => (Number(a.node.attrs.checked) - Number(b.node.attrs.checked))
        * (completedFirst ? -1 : 1));
    if (sorted.every((item, index) => item === items[index])) return false;
    if (!dispatch) return true;

    const movePosition = (position: number) => {
        let offset = start;
        for (const item of sorted) {
            const original = start + item.offset;
            if (position >= original && position < original + item.node.nodeSize) return offset + position - original;
            offset += item.node.nodeSize;
        }
        return position;
    };
    tr.replaceWith(start, start + list.content.size, sorted.map(item => item.node));
    tr.setSelection(selection instanceof NodeSelection
        ? NodeSelection.create(tr.doc, movePosition(selection.anchor))
        : TextSelection.create(tr.doc, movePosition(selection.anchor), movePosition(selection.head)));
    closeHistory(tr).scrollIntoView();
    return true;
};
