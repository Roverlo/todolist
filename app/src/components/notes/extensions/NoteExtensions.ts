import { Extension, type CommandProps, type Editor, type Node as TiptapNode } from '@tiptap/core';
import { AllSelection, Plugin, TextSelection } from '@tiptap/pm/state';
import { canJoin } from '@tiptap/pm/transform';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import StarterKit from '@tiptap/starter-kit';
import { TextStyle } from '@tiptap/extension-text-style';
import Placeholder from '@tiptap/extension-placeholder';
import { Table as TiptapTable, TableRow, TableHeader, TableCell } from '@tiptap/extension-table';
import { Bold } from 'reactjs-tiptap-editor/bold';
import { Italic } from 'reactjs-tiptap-editor/italic';
import { TextUnderline } from 'reactjs-tiptap-editor/textunderline';
import { Strike } from 'reactjs-tiptap-editor/strike';
import { Color } from 'reactjs-tiptap-editor/color';
import { Highlight } from 'reactjs-tiptap-editor/highlight';
import { FontFamily } from 'reactjs-tiptap-editor/fontfamily';
import { FontSize } from 'reactjs-tiptap-editor/fontsize';
import { Heading } from 'reactjs-tiptap-editor/heading';
import { FormatPainter } from 'reactjs-tiptap-editor/formatpainter';
import { TextAlign } from 'reactjs-tiptap-editor/textalign';
import { Indent, type IndentOptions } from 'reactjs-tiptap-editor/indent';
import { LineHeight } from 'reactjs-tiptap-editor/lineheight';
import { TaskList } from 'reactjs-tiptap-editor/tasklist';
import { Link } from 'reactjs-tiptap-editor/link';
import { Image, type IImageOptions } from 'reactjs-tiptap-editor/image';
import { Table } from 'reactjs-tiptap-editor/table';
import { SearchAndReplace } from 'reactjs-tiptap-editor/searchandreplace';
import { Clear } from 'reactjs-tiptap-editor/clear';
import { History } from 'reactjs-tiptap-editor/history';
import { Blockquote } from 'reactjs-tiptap-editor/blockquote';
import { Code } from 'reactjs-tiptap-editor/code';
import { CodeBlock } from 'reactjs-tiptap-editor/codeblock';
import { HorizontalRule } from 'reactjs-tiptap-editor/horizontalrule';
import { useToastStore } from '../../../state/toastStore';
import { readNoteImage, IMAGE_TYPES } from '../../../utils/noteImages';
import { NoteAttachment, NoteFilePaste, insertNoteFiles } from './NoteAttachments';
import { withTaskCompletion } from './taskCompletion';
import { taskNumbersPlugin } from './taskNumbers';

export const BULLET_STYLES = [
    ['disc', '● 实心圆'], ['circle', '○ 空心圆'], ['square', '■ 方块'],
] as const;

export const FONT_FAMILIES = [
    ['', '默认字体'], ['Microsoft YaHei', '微软雅黑'], ['SimSun', '宋体'],
    ['SimHei', '黑体'], ['KaiTi', '楷体'], ['FangSong', '仿宋'], ['DengXian', '等线'],
    ['Arial', 'Arial'], ['Times New Roman', 'Times New Roman'], ['monospace', '等宽字体'],
] as const;

export const NUMBER_STYLES = [
    ['decimal', '1. 2. 3.'], ['decimal-leading-zero', '01. 02. 03.'],
    ['lower-alpha', 'a. b. c.'], ['upper-alpha', 'A. B. C.'],
    ['lower-roman', 'i. ii. iii.'], ['upper-roman', 'I. II. III.'],
    ['cjk-ideographic', '一、二、三、'],
] as const;

// Store each list's style in HTML so nested lists and exported notes retain it.
const ListStyles = Extension.create({
    name: 'noteListStyles',
    addGlobalAttributes() {
        return ['bulletList', 'orderedList'].map(type => {
            const allowed: readonly (readonly [string, string])[] = type === 'bulletList' ? BULLET_STYLES : NUMBER_STYLES;
            const valid = (value: unknown) => allowed.some(([style]) => style === value);
            return {
                types: [type],
                attributes: {
                    listStyle: {
                        default: null,
                        parseHTML: (element: HTMLElement) => {
                            const htmlTypes: Record<string, string> = { '1': 'decimal', a: 'lower-alpha', A: 'upper-alpha', i: 'lower-roman', I: 'upper-roman' };
                            const value = element.style.listStyleType || htmlTypes[element.getAttribute('type') || ''];
                            return valid(value) ? value : null;
                        },
                        renderHTML: (attributes: Record<string, unknown>) => valid(attributes.listStyle)
                            ? { style: `list-style-type: ${attributes.listStyle}` } : {},
                    },
                },
            };
        });
    },
});

const NoteIndent = Indent.extend<IndentOptions>({
    // Let list, table and code-block shortcuts run before the editor fallback.
    priority: 90,
    addCommands() {
        const parent = this.parent?.();
        const listItem = (editor: Editor) => editor.isActive('taskItem') ? 'taskItem'
            : editor.isActive('listItem') ? 'listItem' : null;
        return {
            ...parent,
            indent: () => (props: CommandProps) => {
                const item = listItem(props.editor);
                return item ? props.commands.sinkListItem(item) : parent?.indent?.()(props) ?? false;
            },
            outdent: () => (props: CommandProps) => {
                const item = listItem(props.editor);
                return item ? props.commands.liftListItem(item) : parent?.outdent?.()(props) ?? false;
            },
        };
    },
    addKeyboardShortcuts() {
        const editor = this.editor;
        return {
            Tab: () => {
                if (editor.isActive('table') || editor.isActive('codeBlock')) return true;
                const { empty, $from } = editor.state.selection;
                if (!empty || editor.isActive('listItem') || editor.isActive('taskItem')) editor.commands.indent();
                else if ($from.parent.isTextblock) editor.commands.insertContent('\u00a0'.repeat(4));
                return true;
            },
            'Shift-Tab': () => {
                if (editor.isActive('table') || editor.isActive('codeBlock')) return true;
                const { empty, from, $from } = editor.state.selection;
                const spaces = empty && $from.parent.isTextblock
                    ? editor.state.doc.textBetween(Math.max($from.start(), from - 4), from, '', '\ufffc').match(/[ \u00a0]+$/)?.[0].length || 0 : 0;
                if (spaces) editor.commands.deleteRange({ from: from - spaces, to: from });
                else editor.commands.outdent();
                return true;
            },
            Escape: () => editor.commands.blur(),
        };
    },
});

const NoteTaskList = TaskList.extend({
    // The default list keymap lifts empty items into paragraphs and splits the list.
    priority: 110,
    onCreate() {
        // Repair legacy adjacent lists on opening without adding an undo step.
        this.editor.view.dispatch(this.editor.state.tr.setMeta('normalizeTaskLists', true).setMeta('addToHistory', false));
    },
    addExtensions() {
        return (this.parent?.() || []).map(extension => extension.name === 'taskItem'
            ? withTaskCompletion(extension as TiptapNode) : extension);
    },
    addProseMirrorPlugins() {
        return [...(this.parent?.() || []), taskNumbersPlugin(), new Plugin({
            appendTransaction: (transactions, _oldState, state) => {
                if (!transactions.some(tr => tr.docChanged || tr.getMeta('normalizeTaskLists'))) return null;
                const boundaries: number[] = [];
                state.doc.descendants((node, pos, parent, index) => {
                    if (node.type.name === 'taskList' && index > 0 && parent?.child(index - 1).sameMarkup(node)) {
                        boundaries.push(pos);
                    }
                });
                const tr = state.tr;
                // Join from the end so earlier positions stay valid, including nested lists.
                // Appending keeps the joins in the originating edit's undo/redo step.
                for (const pos of boundaries.reverse()) if (canJoin(tr.doc, pos)) tr.join(pos);
                return tr.docChanged ? tr : null;
            },
        })];
    },
    addKeyboardShortcuts() {
        const deleteAdjacentEmptyParagraph = (backward: boolean) => {
            const { empty, $from } = this.editor.state.selection;
            if (!empty || $from.parent.type.name !== 'paragraph') return false;
            if (backward) {
                // At the first task's text start, remove the preceding blank block before
                // the normal list keymap lifts the task or deletes an empty task item.
                if ($from.parentOffset || $from.depth < 3 || $from.node(-1).type.name !== 'taskItem'
                    || $from.node(-2).type.name !== 'taskList' || $from.index(-1) || $from.index(-2)) return false;
                const parent = $from.node(-3);
                const index = $from.index(-3);
                const previous = parent.maybeChild(index - 1);
                if (previous?.type.name !== 'paragraph' || previous.content.size
                    || !parent.canReplace(index - 1, index)) return false;
                const to = $from.before(-2);
                return this.editor.commands.deleteRange({ from: to - previous.nodeSize, to });
            }
            // Delete from the blank block itself must keep the following checklist intact.
            // canReplace protects required parent-task paragraphs and schema boundaries.
            if ($from.parent.content.size) return false;
            const parent = $from.node(-1);
            const index = $from.index(-1);
            if (parent.maybeChild(index + 1)?.type.name !== 'taskList'
                || !parent.canReplace(index, index + 1)) return false;
            return this.editor.commands.deleteRange({ from: $from.before(), to: $from.after() });
        };
        const deleteEmptyItem = () => {
            const { empty, $from } = this.editor.state.selection;
            if (!empty || $from.depth < 3 || $from.parent.type.name !== 'paragraph'
                || $from.parent.content.size || $from.node(-1).type.name !== 'taskItem') return false;
            const item = $from.node(-1);
            // Keep nested children and intentional extra paragraphs; the last item can still exit the list.
            if (item.childCount !== 1 || $from.node(-2).childCount === 1) return false;
            return this.editor.commands.deleteRange({ from: $from.before(-1), to: $from.after(-1) });
        };
        return {
            ...this.parent?.(),
            Backspace: () => deleteAdjacentEmptyParagraph(true) || deleteEmptyItem(),
            Delete: () => deleteAdjacentEmptyParagraph(false) || deleteEmptyItem(),
            'Mod-Backspace': () => deleteAdjacentEmptyParagraph(true) || deleteEmptyItem(),
            'Mod-Delete': () => deleteAdjacentEmptyParagraph(false) || deleteEmptyItem(),
        };
    },
});

// Retain toolbar selections without storing them in the note. Dark source highlights
// use a light selection so matching colors remain distinguishable without a border.
const NoteSelection = Extension.create({
    name: 'noteSelection',
    addProseMirrorPlugins() {
        const editor = this.editor;
        const darkColors = new Map<string, boolean>();
        let colorContext: CanvasRenderingContext2D | null | undefined;
        const isDarkHighlight = (color: unknown) => {
            if (typeof color !== 'string' || !CSS.supports('color', color)) return false;
            if (darkColors.has(color)) return darkColors.get(color)!;
            if (colorContext === undefined) {
                // Let the browser parse legacy RGB, named colors and custom HEX values.
                const canvas = document.createElement('canvas');
                canvas.width = canvas.height = 1;
                colorContext = canvas.getContext('2d', { willReadFrequently: true });
            }
            if (!colorContext) return false;
            colorContext.fillStyle = '#fff';
            colorContext.fillRect(0, 0, 1, 1);
            colorContext.fillStyle = color;
            colorContext.fillRect(0, 0, 1, 1);
            const [r, g, b] = Array.from(colorContext.getImageData(0, 0, 1, 1).data).slice(0, 3)
                .map(value => value / 255 <= 0.04045 ? value / 255 / 12.92 : ((value / 255 + 0.055) / 1.055) ** 2.4);
            const dark = 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.35;
            darkColors.set(color, dark);
            return dark;
        };
        return [new Plugin({
            props: {
                attributes({ doc, selection }) {
                    let light = false;
                    if (!selection.empty && (selection instanceof TextSelection || selection instanceof AllSelection)) {
                        doc.nodesBetween(selection.from, selection.to, node => {
                            if (light) return false;
                            light = node.marks.some(mark => mark.type.name === 'highlight' && isDarkHighlight(mark.attrs.color));
                            return !light;
                        });
                    }
                    return { 'data-note-selection-tone': light ? 'light' : 'default' };
                },
                decorations({ doc, selection }) {
                    if (!editor.isEditable || editor.view.dragging || selection.empty
                        || !(selection instanceof TextSelection || selection instanceof AllSelection)) return null;
                    return DecorationSet.create(doc, [Decoration.inline(selection.from, selection.to, { class: 'note-selection' })]);
                },
            },
        })];
    },
});

export const insertNoteImages = insertNoteFiles;

// Use the same ProseMirror as the editor: the UI library bundles a second
// DecorationSet in its table implementation, which crashes when highlights overlap.
const NoteTable = TiptapTable.extend({
    addOptions() {
        return { ...TiptapTable.options, button: Table.options.button };
    },
    addExtensions() {
        return [TableRow, TableHeader, TableCell.extend({
            addAttributes() {
                return {
                    ...this.parent?.(),
                    backgroundColor: {
                        default: null,
                        parseHTML: element => element.style.backgroundColor || null,
                        renderHTML: attributes => attributes.backgroundColor ? { style: `background-color: ${attributes.backgroundColor}` } : {},
                    },
                };
            },
        })];
    },
});

export const noteExtensions = [
    StarterKit.configure({
        bold: false, italic: false, underline: false, strike: false, heading: false,
        link: false, blockquote: false, code: false, codeBlock: false, horizontalRule: false, undoRedo: false,
        trailingNode: { notAfter: ['paragraph', 'heading', 'bulletList', 'orderedList', 'taskList', 'blockquote', 'codeBlock'] },
    }),
    TextStyle,
    NoteSelection,
    Placeholder.configure({ placeholder: '在此记录你的想法，支持格式排版、表格和图片。' }),
    Bold, Italic, TextUnderline, Strike, Color,
    Highlight.configure({ multicolor: true }),
    FontFamily,
    FontSize.configure({ fontSizes: ['12px', '14px', '16px', '18px', '20px', '24px', '28px', '32px', '36px', '48px'] }),
    Heading, FormatPainter,
    TextAlign.configure({ types: ['heading', 'paragraph'], alignments: ['left', 'center', 'right', 'justify'] }),
    NoteIndent,
    LineHeight.configure({ lineHeights: ['Default', '1', '1.25', '1.5', '1.75', '2', '2.5', '3'] }),
    ListStyles,
    NoteTaskList.configure({ taskItem: {
        nested: true,
        HTMLAttributes: { 'data-type': 'taskItem' },
        a11y: { checkboxLabel: node => `${node.attrs.checked ? '标记为未完成' : '标记为已完成'}：${node.firstChild?.textContent || '待办'}` },
    } }),
    // Ctrl+V replaces selected text; changing only its href belongs in the link dialog.
    Link.configure({ openOnClick: false, linkOnPaste: false }),
    NoteAttachment, NoteFilePaste,
    Image.configure({
        allowBase64: true,
        acceptMimes: IMAGE_TYPES,
        maxSize: Number.MAX_SAFE_INTEGER,
        upload: readNoteImage,
        onError: error => useToastStore.getState().addToast(error.message, 'error', 8000),
    } as Partial<IImageOptions>),
    NoteTable.configure({ resizable: true, HTMLAttributes: { style: 'border: 1px solid #000; border-collapse: collapse;' } }),
    SearchAndReplace.configure({ disableRegex: true }),
    Clear, History, Blockquote, Code, CodeBlock.configure({ enableTabIndentation: true }), HorizontalRule,
];
