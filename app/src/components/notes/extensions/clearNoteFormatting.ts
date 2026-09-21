import type { Command } from '@tiptap/core';
import { closeHistory } from '@tiptap/pm/history';
import { canSplit } from '@tiptap/pm/transform';

// Pasted HTML can mix <br>, literal newlines and paragraphs. Removing marks
// alone leaves those lines with different paragraph spacing.
export const clearNoteFormatting: Command = ({ tr, commands, dispatch }) => {
    if (!dispatch) return true;
    closeHistory(tr);
    commands.clearNodes();
    commands.unsetAllMarks();

    const breaks = new Map<number, number>();
    for (const { $from, $to } of tr.selection.ranges) {
        if ($from.pos === $to.pos) continue;
        tr.doc.nodesBetween($from.pos, $to.pos, (node, pos) => {
            if (node.type.name === 'hardBreak') breaks.set(pos, 1);
            if (node.isText) {
                for (const match of node.text!.matchAll(/\r\n|\r|\n/g)) {
                    const start = pos + match.index;
                    if (start >= $from.pos && start + match[0].length <= $to.pos) breaks.set(start, match[0].length);
                }
            }
        });
    }
    // Work backwards to keep positions valid. Split within the existing parent
    // (including table cells), retaining explicit blank lines and unselected text.
    for (const [pos, length] of [...breaks].sort(([a], [b]) => b - a)) {
        if (canSplit(tr.doc, pos)) {
            tr.delete(pos, pos + length);
            tr.split(pos);
        }
    }
    tr.setStoredMarks([]).scrollIntoView();
    return true;
};
