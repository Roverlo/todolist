import type { Command } from '@tiptap/core';
import { Fragment, type Node } from '@tiptap/pm/model';
import { NodeSelection, TextSelection } from '@tiptap/pm/state';
import { closeHistory } from '@tiptap/pm/history';

// Sort sibling lists together, leaving intervening blocks in their document slots.
// Whole task nodes travel together, including formatting, timestamps and children.
export const sortNoteTasks = (completedFirst: boolean): Command => ({ tr, dispatch }) => {
    const { selection } = tr;
    const { $from, $to } = selection;
    let depth = $from.depth;
    while (depth > 0 && ($from.node(depth).type.name !== 'taskList'
        || $to.depth < depth - 1 || $from.start(depth - 1) !== $to.start(depth - 1))) depth--;
    let scopeDepth = depth ? depth - 1 : $from.sharedDepth($to.pos);
    // From ordinary text, sort its document/quote/cell without requiring a task click.
    if (!depth) {
        while (scopeDepth > 0 && !['blockquote', 'tableCell', 'tableHeader'].includes($from.node(scopeDepth).type.name)) scopeDepth--;
    }
    const parent = $from.node(scopeDepth);
    const start = $from.start(scopeDepth);
    const items: { node: Node; position: number }[] = [];
    parent.forEach((node, offset) => {
        if (node.type.name === 'taskList') {
            node.forEach((item, itemOffset) => items.push({ node: item, position: start + offset + 1 + itemOffset }));
        }
    });
    if (!items.length) return false;
    const sorted = [...items].sort((a, b) => (Number(a.node.attrs.checked) - Number(b.node.attrs.checked))
        * (completedFirst ? -1 : 1));
    if (sorted.every((item, index) => item === items[index])) return true;
    if (!dispatch) return true;

    const blocks: Node[] = [];
    const positions: { from: number; to: number; moved: number }[] = [];
    let nextItem = 0;
    let nextPosition = start;
    parent.forEach((node, offset) => {
        if (node.type.name === 'taskList') {
            const replacements = sorted.slice(nextItem, nextItem + node.childCount);
            nextItem += node.childCount;
            let itemPosition = nextPosition + 1;
            for (const item of replacements) {
                positions.push({ from: item.position, to: item.position + item.node.nodeSize, moved: itemPosition });
                itemPosition += item.node.nodeSize;
            }
            // Keep each list's attributes and item count; only the task order changes.
            node = node.copy(Fragment.fromArray(replacements.map(item => item.node)));
        } else {
            positions.push({ from: start + offset, to: start + offset + node.nodeSize, moved: nextPosition });
        }
        blocks.push(node);
        nextPosition += node.nodeSize;
    });
    const movePosition = (position: number) => {
        const range = positions.find(({ from, to }) => position >= from && position < to);
        return range ? range.moved + position - range.from : tr.mapping.map(position);
    };
    tr.replaceWith(start, start + parent.content.size, blocks);
    tr.setSelection(selection instanceof NodeSelection
        ? NodeSelection.create(tr.doc, movePosition(selection.anchor))
        : TextSelection.create(tr.doc, movePosition(selection.anchor), movePosition(selection.head)));
    closeHistory(tr).scrollIntoView();
    return true;
};
