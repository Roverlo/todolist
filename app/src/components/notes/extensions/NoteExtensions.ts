import { Extension, type CommandProps, type Editor } from '@tiptap/core';
import { AllSelection, Plugin, TextSelection } from '@tiptap/pm/state';
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
import { readNoteImage, IMAGE_TYPES, MAX_IMAGE_BYTES } from '../../../utils/noteImages';

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

export async function insertNoteImages(editor: Editor, files: File[]) {
    try {
        const images = await Promise.all(files.map(async file => ({ src: await readNoteImage(file), alt: file.name })));
        if (!editor.isDestroyed) editor.chain().focus().insertContent(images.map(attrs => ({ type: 'imageBlock', attrs }))).run();
    } catch (error) {
        useToastStore.getState().addToast(error instanceof Error ? error.message : '图片插入失败', 'error');
    }
}

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
    TaskList.configure({ taskItem: {
        nested: true,
        HTMLAttributes: { 'data-type': 'taskItem' },
        a11y: { checkboxLabel: node => `${node.attrs.checked ? '标记为未完成' : '标记为已完成'}：${node.firstChild?.textContent || '待办'}` },
    } }),
    Link.configure({ openOnClick: false }),
    Image.extend<IImageOptions & { allowBase64: boolean }>({
        addProseMirrorPlugins() {
            const editor = this.editor;
            return [...(this.parent?.() || []), new Plugin({
                props: {
                    handlePaste: (_view, event) => {
                        if (event.clipboardData?.getData('text/html')) return false;
                        const files = Array.from(event.clipboardData?.files || []).filter(file => file.type.startsWith('image/'));
                        if (!files.length) return false;
                        event.preventDefault();
                        void insertNoteImages(editor, files);
                        return true;
                    },
                    handleDrop: (view, event, _slice, moved) => {
                        if (moved) return false;
                        const files = Array.from(event.dataTransfer?.files || []).filter(file => file.type.startsWith('image/'));
                        if (!files.length) return false;
                        event.preventDefault();
                        const position = view.posAtCoords({ left: event.clientX, top: event.clientY });
                        if (position) editor.commands.setTextSelection(position.pos);
                        void insertNoteImages(editor, files);
                        return true;
                    },
                },
            })];
        },
    }).configure({
        allowBase64: true,
        acceptMimes: IMAGE_TYPES,
        maxSize: MAX_IMAGE_BYTES,
        upload: readNoteImage,
        onError: error => useToastStore.getState().addToast(error.message, 'error'),
    }),
    NoteTable.configure({ resizable: true, HTMLAttributes: { style: 'border: 1px solid #000; border-collapse: collapse;' } }),
    SearchAndReplace.configure({ disableRegex: true }),
    Clear, History, Blockquote, Code, CodeBlock.configure({ enableTabIndentation: true }), HorizontalRule,
];
