import { useEffect, useRef, useState, type ReactNode } from 'react';
import { type Editor, useEditorState } from '@tiptap/react';
import { ChevronDown, Highlighter, Baseline, IndentIncrease, IndentDecrease, AlignLeft, AlignCenter, AlignRight, AlignJustify, Search, Link, ImagePlus, FolderOpen, ListTodo, type LucideIcon } from 'lucide-react';
import { RichTextBold } from 'reactjs-tiptap-editor/bold';
import { RichTextItalic } from 'reactjs-tiptap-editor/italic';
import { RichTextUnderline } from 'reactjs-tiptap-editor/textunderline';
import { RichTextStrike } from 'reactjs-tiptap-editor/strike';
import { RichTextFormatPainter } from 'reactjs-tiptap-editor/formatpainter';
import { RichTextTable } from 'reactjs-tiptap-editor/table';
import { RichTextClear } from 'reactjs-tiptap-editor/clear';
import { RichTextUndo, RichTextRedo } from 'reactjs-tiptap-editor/history';
import { RichTextBlockquote } from 'reactjs-tiptap-editor/blockquote';
import { RichTextCode } from 'reactjs-tiptap-editor/code';
import { RichTextCodeBlock } from 'reactjs-tiptap-editor/codeblock';
import { RichTextHorizontalRule } from 'reactjs-tiptap-editor/horizontalrule';
import { BULLET_STYLES, NUMBER_STYLES, FONT_FAMILIES } from './extensions/NoteExtensions';
import { EditorSearch } from './EditorSearch';
import { CustomSelect } from '../ui/CustomSelect';
import { EditorInsertDialog } from './EditorInsertDialog';
import { openNoteImageFolder } from '../../utils/noteImages';
import { useToastStore } from '../../state/toastStore';

const COLOR_PALETTE = [
    ['黑色', '#000000'], ['深灰', '#595959'], ['灰色', '#a5a5a5'], ['浅灰', '#d9d9d9'], ['白色', '#ffffff'],
    ['深红', '#c00000'], ['红色', '#ff0000'], ['橙色', '#ed7d31'], ['金色', '#ffc000'], ['黄色', '#fff200'],
    ['深绿', '#008000'], ['绿色', '#70ad47'], ['青色', '#00b0f0'], ['浅蓝', '#5b9bd5'], ['蓝色', '#0070c0'],
    ['深蓝', '#002060'], ['紫色', '#7030a0'], ['品红', '#c000c0'], ['棕色', '#7f6000'], ['米色', '#f4b183'],
] as const;

const COLOR_SHADES = [
    ['灰', '#f3f4f6', '#d1d5db', '#9ca3af', '#4b5563', '#1f2937'],
    ['红', '#fee2e2', '#fca5a5', '#f87171', '#dc2626', '#991b1b'],
    ['橙', '#ffedd5', '#fdba74', '#fb923c', '#ea580c', '#9a3412'],
    ['金', '#fef3c7', '#fcd34d', '#fbbf24', '#d97706', '#92400e'],
    ['黄', '#fef9c3', '#fef08a', '#fde047', '#ca8a04', '#854d0e'],
    ['绿', '#dcfce7', '#86efac', '#4ade80', '#16a34a', '#166534'],
    ['青', '#ccfbf1', '#5eead4', '#2dd4bf', '#0d9488', '#115e59'],
    ['蓝', '#dbeafe', '#93c5fd', '#60a5fa', '#2563eb', '#1e40af'],
    ['紫', '#ede9fe', '#c4b5fd', '#a78bfa', '#7c3aed', '#5b21b6'],
    ['粉', '#fce7f3', '#f9a8d4', '#f472b6', '#db2777', '#9d174d'],
] as const;
const COLOR_GROUPS = [
    { label: '常用颜色', colors: COLOR_PALETTE },
    { label: '浅色与深色', colors: ([1, 2, 3, 4, 5] as const).flatMap(level =>
        COLOR_SHADES.map(shades => [`${shades[0]}色 ${level}`, shades[level]] as const)) },
];

function WordColorPicker({
    icon: PickerIcon,
    label,
    color,
    clearLabel,
    onApply,
    onClear,
}: {
    icon: LucideIcon;
    label: string;
    color: string;
    clearLabel: string;
    onApply: (color: string) => void;
    onClear: () => void;
}) {
    const [open, setOpen] = useState(false);
    const [customColor, setCustomColor] = useState(color);
    const wrapperRef = useRef<HTMLDivElement>(null);
    const menuRef = useRef<HTMLButtonElement>(null);
    const validCustomColor = /^#?[\da-f]{6}$/i.test(customColor.trim());
    const customHex = '#' + customColor.trim().replace(/^#/, '');

    useEffect(() => {
        if (!open) return;

        const swatch = wrapperRef.current?.querySelector<HTMLButtonElement>('.word-color-option[aria-pressed="true"]')
            || wrapperRef.current?.querySelector<HTMLButtonElement>('.word-color-option');
        swatch?.focus();
        const closeOutside = (event: PointerEvent) => {
            if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
        };
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') { setOpen(false); menuRef.current?.focus(); }
        };

        document.addEventListener('pointerdown', closeOutside);
        document.addEventListener('keydown', closeOnEscape);
        return () => {
            document.removeEventListener('pointerdown', closeOutside);
            document.removeEventListener('keydown', closeOnEscape);
        };
    }, [open]);

    const chooseColor = (nextColor: string) => {
        onApply(nextColor);
        setOpen(false);
    };

    return (
        <div className="word-color-picker" ref={wrapperRef}>
            <button
                type="button"
                className="word-color-apply"
                title={`应用${label} ${color}`}
                aria-label={`应用${label}`}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => onApply(color)}
            >
                <PickerIcon size={18} strokeWidth={2} aria-hidden="true" />
                <span className="word-color-current" style={{ backgroundColor: color }} aria-hidden="true" />
            </button>
            <button
                type="button"
                ref={menuRef}
                className="word-color-menu"
                title={`选择${label}`}
                aria-label={`${label}菜单`}
                aria-haspopup="dialog"
                aria-expanded={open}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => { setCustomColor(color); setOpen(value => !value); }}
            >
                <ChevronDown size={12} strokeWidth={2.5} aria-hidden="true" />
            </button>

            {open && (
                <div className="word-color-popover" role="dialog" aria-label={`选择${label}`}
                    onKeyDown={event => {
                        if (!(event.target instanceof Element) || !event.target.matches('.word-color-option')) return;
                        const steps: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -10, ArrowDown: 10 };
                        const swatches = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('.word-color-option'));
                        const index = swatches.indexOf(event.target as HTMLButtonElement);
                        const next = event.key === 'Home' ? 0 : event.key === 'End' ? swatches.length - 1
                            : event.key in steps ? (index + steps[event.key] + swatches.length) % swatches.length : -1;
                        if (next >= 0) { event.preventDefault(); swatches[next].focus(); }
                    }}>
                    {COLOR_GROUPS.map(group => <div className="word-color-section" key={group.label}>
                        <div className="word-color-popover-title">{group.label}</div>
                        <div className="word-color-grid" role="group" aria-label={group.label}>
                            {group.colors.map(([name, value]) => (
                                <button
                                    type="button"
                                    key={value}
                                    tabIndex={-1}
                                    className="word-color-option"
                                    style={{ backgroundColor: value }}
                                    title={`${name} ${value.toUpperCase()}`}
                                    aria-label={`${label}：${name}`}
                                    aria-pressed={value.toLowerCase() === color.toLowerCase()}
                                    onMouseDown={(event) => event.preventDefault()}
                                    onClick={() => chooseColor(value)}
                                />
                            ))}
                        </div>
                    </div>)}
                    <form className="word-color-custom" onSubmit={event => {
                        event.preventDefault();
                        if (validCustomColor) chooseColor(customHex);
                    }}>
                        <label className="word-color-popover-title">
                            自定义颜色
                            <input type="text" value={customColor} maxLength={7} spellCheck={false}
                                aria-label={`${label}色号`} aria-invalid={!validCustomColor}
                                placeholder="#RRGGBB" onChange={event => setCustomColor(event.target.value)} />
                        </label>
                        <input type="color" value={validCustomColor ? customHex : color}
                            aria-label={`${label}其他颜色`} onChange={event => setCustomColor(event.target.value)} />
                        <button type="submit" className="word-color-confirm" disabled={!validCustomColor}>应用</button>
                    </form>
                    <div className="word-color-popover-footer">
                        <button
                            type="button"
                            className="word-color-clear"
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => {
                                onClear();
                                setOpen(false);
                            }}
                        >
                            {clearLabel}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

function Tool({ label, children }: { label: string; children: ReactNode }) {
    return <label className="editor-tool" data-tool={label}><span className="editor-sr-only">{label}</span>{children}</label>;
}

export function EditorToolbar({ editor, actions }: { editor: Editor; actions?: ReactNode }) {
    const [searchOpen, setSearchOpen] = useState(false);
    const [insertDialog, setInsertDialog] = useState<'link' | 'image' | null>(null);
    const [textColor, setTextColor] = useState('#000000');
    const [highlightColor, setHighlightColor] = useState('#fff200');
    const lists = useEditorState({
        editor,
        selector: ({ editor }) => ({
            bullet: editor.isActive('bulletList') ? editor.getAttributes('bulletList').listStyle || 'disc' : '',
            ordered: editor.isActive('orderedList') ? editor.getAttributes('orderedList').listStyle || 'decimal' : '',
            task: editor.isActive('taskList'),
            table: editor.isActive('table'),
            canMerge: editor.can().mergeCells(),
            canSplit: editor.can().splitCell(),
            image: editor.isActive('imageBlock') || editor.isActive('image'),
            font: editor.getAttributes('textStyle').fontFamily || '',
            size: editor.getAttributes('textStyle').fontSize || '',
            heading: editor.getAttributes('heading').level || 0,
            lineHeight: editor.getAttributes(editor.isActive('heading') ? 'heading' : 'paragraph').lineHeight || '',
            align: ['left', 'center', 'right', 'justify'].find(value => editor.isActive({ textAlign: value })),
        }),
    });

    const setListStyle = (type: 'bulletList' | 'orderedList', value: string) => {
        const chain = editor.chain().focus();
        if (value === 'none' || !editor.isActive(type)) {
            if (type === 'bulletList') chain.toggleBulletList();
            else chain.toggleOrderedList();
        }
        if (value !== 'none') chain.updateAttributes(type, { listStyle: value });
        chain.run();
    };

    const tableActions = [
        ['上方插入行', () => editor.chain().focus().addRowBefore().run()],
        ['下方插入行', () => editor.chain().focus().addRowAfter().run()],
        ['删除当前行', () => editor.chain().focus().deleteRow().run()],
        ['左侧插入列', () => editor.chain().focus().addColumnBefore().run()],
        ['右侧插入列', () => editor.chain().focus().addColumnAfter().run()],
        ['删除当前列', () => editor.chain().focus().deleteColumn().run()],
        ['合并单元格', () => editor.chain().focus().mergeCells().run(), !lists.canMerge],
        ['拆分单元格', () => editor.chain().focus().splitCell().run(), !lists.canSplit],
        ['切换表头行', () => editor.chain().focus().toggleHeaderRow().run()],
        ['删除表格', () => editor.chain().focus().deleteTable().run()],
    ] as const;

    return (<>
        <div className="editor-toolbar reactjs-tiptap-editor" role="toolbar" aria-label="随记编辑工具"
            onMouseDown={event => {
                if (event.target instanceof Element && event.target.closest('button') && !event.target.closest('[role="combobox"]')) event.preventDefault();
            }}>
            <div className="editor-toolbar-row">
                <div className="editor-toolbar-group" role="group" aria-label="字体">
                    <CustomSelect className="editor-heading-select" aria-label="段落标题" value={lists.heading}
                        options={[{ value: '0', label: '段落' }, ...[1, 2, 3, 4, 5, 6].map(level => ({ value: String(level), label: `标题 ${level}` }))]}
                        onChange={value => value === '0' ? editor.chain().focus().setParagraph().run()
                            : editor.chain().focus().setHeading({ level: Number(value) as 1 | 2 | 3 | 4 | 5 | 6 }).run()} />
                    <CustomSelect className="editor-font-select" aria-label="正文字体" value={lists.font}
                        options={[...FONT_FAMILIES.map(([value, label]) => ({ value, label })),
                            ...(!FONT_FAMILIES.some(([value]) => value === lists.font) ? [{ value: lists.font, label: lists.font }] : [])]}
                        onChange={value => value ? editor.chain().focus().setFontFamily(value).run() : editor.chain().focus().unsetFontFamily().run()} />
                    <CustomSelect className="editor-size-select" aria-label="字号" value={lists.size}
                        options={[{ value: '', label: '默认' }, ...['12px', '14px', '16px', '18px', '20px', '24px', '28px', '32px', '36px', '48px'].map(value => ({ value, label: value }))]}
                        onChange={value => value ? editor.chain().focus().setFontSize(value).run() : editor.chain().focus().unsetFontSize().run()} />
                </div>
                <div className="editor-toolbar-group" role="group" aria-label="文字样式">
                    <Tool label="加粗"><RichTextBold /></Tool>
                    <Tool label="斜体"><RichTextItalic /></Tool>
                    <Tool label="下划线"><RichTextUnderline /></Tool>
                    <Tool label="删除线"><RichTextStrike /></Tool>
                    <WordColorPicker icon={Baseline} label="字体颜色" color={textColor} clearLabel="自动颜色"
                        onApply={color => { setTextColor(color); editor.chain().focus().setColor(color).run(); }}
                        onClear={() => editor.chain().focus().unsetColor().run()} />
                    <WordColorPicker icon={Highlighter} label="背景颜色" color={highlightColor} clearLabel="无颜色"
                        onApply={color => { setHighlightColor(color); editor.chain().focus().setHighlight({ color }).run(); }}
                        onClear={() => editor.chain().focus().unsetHighlight().run()} />
                </div>
                <div className="editor-toolbar-group" role="group" aria-label="编辑">
                    <Tool label="撤销"><RichTextUndo /></Tool>
                    <Tool label="重做"><RichTextRedo /></Tool>
                    <Tool label="格式刷"><RichTextFormatPainter /></Tool>
                    <Tool label="清除格式"><RichTextClear /></Tool>
                    <Tool label="查找替换"><button type="button" className="editor-toolbar-btn" aria-label="查找替换" title="查找替换"
                        data-state={searchOpen ? 'on' : 'off'} aria-pressed={searchOpen}
                        onClick={() => setSearchOpen(value => !value)}><Search size={18} /></button></Tool>
                </div>
                {lists.image && <div className="editor-toolbar-group editor-image-tools" role="group" aria-label="图片工具" title="拖动图片四角可调整大小">
                    <CustomSelect className="editor-list-select" aria-label="图片宽度" value="" placeholder="图片宽度"
                        options={[{ value: 'auto', label: '原始宽度' }, ...['25%', '50%', '75%', '100%'].map(value => ({ value, label: `${value} 正文宽度` }))]}
                        onChange={value => editor.chain().focus().updateImage({ width: value === 'auto' ? null
                            : Math.round(editor.view.dom.clientWidth * Number.parseInt(value) / 100) }).run()} />
                    <button type="button" className="editor-toolbar-btn" aria-label="打开图片文件夹" title="打开图片文件夹"
                        onClick={() => void openNoteImageFolder(editor.getAttributes('imageBlock').src || editor.getAttributes('image').src)
                            .catch(error => useToastStore.getState().addToast(error instanceof Error ? error.message : String(error), 'error'))}><FolderOpen size={17} /></button>
                </div>}
                {actions}
            </div>
            <div className="editor-toolbar-row">
                <div className="editor-toolbar-group" role="group" aria-label="段落">
                    {([['left', '左对齐', AlignLeft], ['center', '居中对齐', AlignCenter], ['right', '右对齐', AlignRight], ['justify', '两端对齐', AlignJustify]] as const)
                        .map(([value, label, AlignIcon]) => <button key={value} type="button" className="editor-toolbar-btn"
                            aria-label={label} title={label} data-state={lists.align === value ? 'on' : 'off'} aria-pressed={lists.align === value}
                            onClick={() => editor.chain().focus().setTextAlign(value).run()}><AlignIcon size={18} /></button>)}
                    <CustomSelect className="editor-line-select" aria-label="行距" value={lists.lineHeight}
                        options={[{ value: '', label: '行距' }, ...['1', '1.25', '1.5', '1.75', '2', '2.5', '3'].map(value => ({ value, label: `${value} 倍` }))]}
                        onChange={value => value ? editor.chain().focus().setLineHeight(value).run() : editor.chain().focus().unsetLineHeight().run()} />
                    <button type="button" className="editor-toolbar-btn" aria-label="增加缩进" title="增加缩进（列表中可用 Tab）"
                        onClick={() => editor.chain().focus().indent().run()}><IndentIncrease size={18} /></button>
                    <button type="button" className="editor-toolbar-btn" aria-label="减少缩进" title="减少缩进（列表中可用 Shift+Tab）"
                        onClick={() => editor.chain().focus().outdent().run()}><IndentDecrease size={18} /></button>
                </div>
                <div className="editor-toolbar-group" role="group" aria-label="列表">
                    <CustomSelect className="editor-list-select" aria-label="项目符号样式" value={lists.bullet} placeholder="项目符号"
                        options={[...BULLET_STYLES.map(([value, label]) => ({ value, label })), ...(lists.bullet ? [{ value: 'none', label: '取消项目符号' }] : [])]}
                        onChange={value => setListStyle('bulletList', value)} />
                    <CustomSelect className="editor-list-select" aria-label="编号样式" value={lists.ordered} placeholder="编号样式"
                        options={[...NUMBER_STYLES.map(([value, label]) => ({ value, label })), ...(lists.ordered ? [{ value: 'none', label: '取消编号' }] : [])]}
                        onChange={value => setListStyle('orderedList', value)} />
                    <button type="button" className="editor-toolbar-btn editor-todo-btn" aria-label="待办列表"
                        title="待办：回车新增一项，空行回车结束" data-state={lists.task ? 'on' : 'off'} aria-pressed={lists.task}
                        onClick={() => editor.chain().focus().toggleTaskList().run()}><ListTodo size={17} aria-hidden="true" /><span>待办</span></button>
                </div>
                <div className="editor-toolbar-group" role="group" aria-label="插入">
                    <button type="button" className="editor-toolbar-btn" aria-label="插入链接" title="插入链接" onClick={() => setInsertDialog('link')}><Link size={18} /></button>
                    <button type="button" className="editor-toolbar-btn" aria-label="插入图片" title="插入图片" onClick={() => setInsertDialog('image')}><ImagePlus size={18} /></button>
                    <span onKeyDownCapture={event => {
                        if ((event.key === 'Enter' || event.key === ' ') && event.target instanceof HTMLButtonElement) {
                            event.preventDefault();
                            event.stopPropagation();
                            editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
                        }
                    }} title="选择表格大小；键盘 Enter 可插入 3×3 表格">
                        <Tool label="插入表格"><RichTextTable /></Tool>
                    </span>
                    <Tool label="引用"><RichTextBlockquote /></Tool>
                    <Tool label="行内代码"><RichTextCode /></Tool>
                    <Tool label="代码块"><RichTextCodeBlock /></Tool>
                    <Tool label="分隔线"><RichTextHorizontalRule /></Tool>
                </div>
                {lists.table && <div className="editor-toolbar-group editor-context-tools" role="group" aria-label="表格工具" title="拖选多个单元格后可合并">
                    <CustomSelect className="editor-list-select" aria-label="表格操作" value="" placeholder="表格操作"
                        options={tableActions.map(([label, , disabled], index) => ({ value: String(index), label, disabled }))}
                        onChange={value => tableActions[Number(value)][1]()} />
                </div>}
            </div>
        </div>
        {searchOpen && <EditorSearch editor={editor} onClose={() => setSearchOpen(false)} />}
        {insertDialog && <EditorInsertDialog editor={editor} kind={insertDialog} onClose={() => setInsertDialog(null)} />}
    </>);
}
