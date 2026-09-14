import { useEffect, useRef, useState, type ReactNode } from 'react';
import { type Editor, useEditorState } from '@tiptap/react';
import { Bold, Italic, Underline, Strikethrough, Undo2, Redo2, PaintRoller, Eraser, Quote, Code, CodeXml, Minus, ChevronDown, Highlighter, Baseline, IndentIncrease, IndentDecrease, AlignLeft, AlignCenter, AlignRight, AlignJustify, Search, Link, ImagePlus, FolderOpen, CalendarDays, ListTodo, type LucideIcon } from 'lucide-react';
import { formatPainterPluginKey } from 'reactjs-tiptap-editor/formatpainter';
import { BULLET_STYLES, NUMBER_STYLES, FONT_FAMILIES } from './extensions/NoteExtensions';
import { EditorSearch } from './EditorSearch';
import { EditorPopover, EditorSelect, EditorToolButton, EditorTooltip } from './EditorToolbarControls';
import { EditorTablePicker } from './EditorTablePicker';
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
    const menuRef = useRef<HTMLButtonElement>(null);
    const validCustomColor = /^#?[\da-f]{6}$/i.test(customColor.trim());
    const customHex = '#' + customColor.trim().replace(/^#/, '');

    const chooseColor = (nextColor: string) => {
        onApply(nextColor);
        setOpen(false);
    };

    return (
        <div className="word-color-picker editor-popover-anchor">
            <EditorToolButton icon={PickerIcon} label={`应用${label}`} description={`将所选文字的${label}设为 ${color.toUpperCase()}。`}
                className="word-color-apply" onClick={() => onApply(color)}>
                <span className="word-color-current" style={{ backgroundColor: color }} aria-hidden="true" />
            </EditorToolButton>
            <EditorToolButton ref={menuRef} icon={ChevronDown} label={`${label}菜单`} description="选择常用颜色，或输入自定义色号。"
                className="word-color-menu editor-color-menu"
                aria-haspopup="dialog"
                aria-expanded={open}
                onClick={() => { setCustomColor(color); setOpen(value => !value); }}
            />

            {open && (
                <EditorPopover className="word-color-popover" label={`选择${label}`} triggerRef={menuRef} setOpen={setOpen}
                    initialFocus=".word-color-option[aria-pressed='true']"
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
                                <EditorTooltip key={value} label={name} description={`${label}：${value.toUpperCase()}`}><button
                                    type="button"
                                    tabIndex={-1}
                                    className="word-color-option"
                                    style={{ backgroundColor: value }}
                                    aria-label={`${label}：${name}`}
                                    aria-pressed={value.toLowerCase() === color.toLowerCase()}
                                    onMouseDown={(event) => event.preventDefault()}
                                    onClick={() => chooseColor(value)}
                                /></EditorTooltip>
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
                </EditorPopover>
            )}
        </div>
    );
}

export function EditorToolbar({ editor, actions }: { editor: Editor; actions?: ReactNode }) {
    const toolbarRef = useRef<HTMLDivElement>(null);
    const [searchOpen, setSearchOpen] = useState(false);
    const [insertDialog, setInsertDialog] = useState<'link' | 'image' | 'date' | null>(null);
    const [textColor, setTextColor] = useState('#000000');
    const [highlightColor, setHighlightColor] = useState('#fff200');
    const lists = useEditorState({
        editor,
        selector: ({ editor }) => ({
            bold: editor.isActive('bold'), italic: editor.isActive('italic'), underline: editor.isActive('underline'), strike: editor.isActive('strike'),
            canBold: editor.can().toggleBold(), canItalic: editor.can().toggleItalic(), canUnderline: editor.can().toggleUnderline(), canStrike: editor.can().toggleStrike(),
            canUndo: editor.can().undo(), canRedo: editor.can().redo(), canPaint: editor.can().setPainter(),
            painter: Boolean(formatPainterPluginKey.getState(editor.state)?.length),
            blockquote: editor.isActive('blockquote'), code: editor.isActive('code'), codeBlock: editor.isActive('codeBlock'),
            canCode: editor.can().toggleCode(),
            bullet: editor.isActive('bulletList') ? editor.getAttributes('bulletList').listStyle || 'disc' : '',
            ordered: editor.isActive('orderedList') ? editor.getAttributes('orderedList').listStyle || 'decimal' : '',
            task: editor.isActive('taskList'),
            canIndent: editor.can().indent(),
            canOutdent: editor.can().outdent(),
            taskDepth: Array.from({ length: editor.state.selection.$from.depth }, (_, index) =>
                editor.state.selection.$from.node(index + 1).type.name).filter(name => name === 'taskItem').length,
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

    useEffect(() => {
        const shortcuts = (event: KeyboardEvent) => {
            if (!(event.target instanceof Element) || !event.target.closest('.note-editor, .editor-toolbar, .editor-search')) return;
            if (event.altKey && event.key === 'F10') {
                event.preventDefault(); toolbarRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
            } else if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'f') {
                event.preventDefault(); setSearchOpen(true);
            }
        };
        document.addEventListener('keydown', shortcuts);
        return () => document.removeEventListener('keydown', shortcuts);
    }, []);

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
        <div ref={toolbarRef} className="editor-toolbar" role="toolbar" aria-label="随记编辑工具" aria-description="Alt+F10 进入工具栏；左右方向键切换工具，Escape 返回正文。"
            onKeyDown={event => {
                const target = event.target;
                if (event.defaultPrevented || !(target instanceof HTMLButtonElement) || target.closest('.editor-popover') || target.getAttribute('aria-expanded') === 'true') return;
                if (event.key === 'Escape') { event.preventDefault(); editor.commands.focus(); return; }
                if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
                const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')).filter(button => !button.closest('.editor-popover'));
                const index = buttons.indexOf(target);
                const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
                    : (index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
                event.preventDefault(); buttons[next]?.focus();
            }}>
            <div className="editor-toolbar-row">
                <div className="editor-toolbar-group" role="group" aria-label="字体">
                    <EditorSelect className="editor-heading-select" aria-label="段落标题" description="设置段落或标题层级。" value={lists.heading}
                        options={[{ value: '0', label: '段落' }, ...[1, 2, 3, 4, 5, 6].map(level => ({ value: String(level), label: `标题 ${level}` }))]}
                        onChange={value => value === '0' ? editor.chain().focus().setParagraph().run()
                            : editor.chain().focus().setHeading({ level: Number(value) as 1 | 2 | 3 | 4 | 5 | 6 }).run()} />
                    <EditorSelect className="editor-font-select" aria-label="正文字体" description="更改选中文字的字体。" value={lists.font}
                        options={[...FONT_FAMILIES.map(([value, label]) => ({ value, label })),
                            ...(!FONT_FAMILIES.some(([value]) => value === lists.font) ? [{ value: lists.font, label: lists.font }] : [])]}
                        onChange={value => value ? editor.chain().focus().setFontFamily(value).run() : editor.chain().focus().unsetFontFamily().run()} />
                    <EditorSelect className="editor-size-select" aria-label="字号" description="更改选中文字的大小。" value={lists.size}
                        options={[{ value: '', label: '默认' }, ...['12px', '14px', '16px', '18px', '20px', '24px', '28px', '32px', '36px', '48px'].map(value => ({ value, label: value }))]}
                        onChange={value => value ? editor.chain().focus().setFontSize(value).run() : editor.chain().focus().unsetFontSize().run()} />
                </div>
                <div className="editor-toolbar-group" role="group" aria-label="文字样式">
                    <EditorToolButton label="加粗" icon={Bold} shortcut="Ctrl+B" active={lists.bold} disabled={!lists.canBold}
                        onClick={() => editor.chain().focus().toggleBold().run()} />
                    <EditorToolButton label="斜体" icon={Italic} shortcut="Ctrl+I" active={lists.italic} disabled={!lists.canItalic}
                        onClick={() => editor.chain().focus().toggleItalic().run()} />
                    <EditorToolButton label="下划线" icon={Underline} shortcut="Ctrl+U" active={lists.underline} disabled={!lists.canUnderline}
                        onClick={() => editor.chain().focus().toggleUnderline().run()} />
                    <EditorToolButton label="删除线" icon={Strikethrough} shortcut="Ctrl+Shift+S" active={lists.strike} disabled={!lists.canStrike}
                        onClick={() => editor.chain().focus().toggleStrike().run()} />
                    <WordColorPicker icon={Baseline} label="字体颜色" color={textColor} clearLabel="自动颜色"
                        onApply={color => { setTextColor(color); editor.chain().focus().setColor(color).run(); }}
                        onClear={() => editor.chain().focus().unsetColor().run()} />
                    <WordColorPicker icon={Highlighter} label="背景颜色" color={highlightColor} clearLabel="无颜色"
                        onApply={color => { setHighlightColor(color); editor.chain().focus().setHighlight({ color }).run(); }}
                        onClear={() => editor.chain().focus().unsetHighlight().run()} />
                </div>
                <div className="editor-toolbar-group" role="group" aria-label="编辑">
                    <EditorToolButton label="撤销" icon={Undo2} shortcut="Ctrl+Z" description="撤回上一步编辑。" disabled={!lists.canUndo}
                        onClick={() => editor.chain().focus().undo().run()} />
                    <EditorToolButton label="重做" icon={Redo2} shortcut="Ctrl+Shift+Z" description="恢复刚刚撤销的编辑。" disabled={!lists.canRedo}
                        onClick={() => editor.chain().focus().redo().run()} />
                    <EditorToolButton label="格式刷" icon={PaintRoller} active={lists.painter} disabled={!lists.painter && !lists.canPaint}
                        description="从带格式的文字中取样，再选择目标文字；再次点击可取消。"
                        onClick={() => lists.painter ? editor.commands.unsetPainter() : editor.chain().focus().setPainter().run()} />
                    <EditorToolButton label="清除格式" icon={Eraser} description="清除选中文字和段落的格式。"
                        onClick={() => editor.chain().focus().clearNodes().unsetAllMarks().run()} />
                    <EditorToolButton label="查找替换" icon={Search} shortcut="Ctrl+F" active={searchOpen}
                        onClick={() => { if (searchOpen) editor.commands.focus(); setSearchOpen(value => !value); }} />
                </div>
                {lists.image && <div className="editor-toolbar-group editor-image-tools" role="group" aria-label="图片工具">
                    <EditorSelect className="editor-list-select" aria-label="图片宽度" description="按正文宽度缩放图片，也可拖动图片四角调整。" value="" placeholder="图片宽度"
                        options={[{ value: 'auto', label: '原始宽度' }, ...['25%', '50%', '75%', '100%'].map(value => ({ value, label: `${value} 正文宽度` }))]}
                        onChange={value => editor.chain().focus().updateImage({ width: value === 'auto' ? null
                            : Math.round(editor.view.dom.clientWidth * Number.parseInt(value) / 100) }).run()} />
                    <EditorToolButton label="打开图片文件夹" icon={FolderOpen}
                        onClick={() => void openNoteImageFolder(editor.getAttributes('imageBlock').src || editor.getAttributes('image').src)
                            .catch(error => useToastStore.getState().addToast(error instanceof Error ? error.message : String(error), 'error'))} />
                </div>}
                {actions}
            </div>
            <div className="editor-toolbar-row">
                <div className="editor-toolbar-group" role="group" aria-label="段落">
                    {([['left', '左对齐', AlignLeft], ['center', '居中对齐', AlignCenter], ['right', '右对齐', AlignRight], ['justify', '两端对齐', AlignJustify]] as const)
                        .map(([value, label, AlignIcon]) => <EditorToolButton key={value} label={label} icon={AlignIcon} active={lists.align === value}
                            onClick={() => editor.chain().focus().setTextAlign(value).run()} />)}
                    <EditorSelect className="editor-line-select" aria-label="行距" description="调整当前段落的行间距。" value={lists.lineHeight}
                        options={[{ value: '', label: '行距' }, ...['1', '1.25', '1.5', '1.75', '2', '2.5', '3'].map(value => ({ value, label: `${value} 倍` }))]}
                        onChange={value => value ? editor.chain().focus().setLineHeight(value).run() : editor.chain().focus().unsetLineHeight().run()} />
                    <EditorToolButton label={lists.task ? '设为子待办' : '增加缩进'} icon={IndentIncrease} disabled={!lists.canIndent}
                        shortcut={lists.task ? 'Tab' : undefined}
                        description={lists.task ? lists.canIndent ? '移入上一个同级待办下面，成为它的子项；已有子项一起移动。' : '前面需要有同级待办，才能将当前项设为它的子项。' : '增加段落缩进；列表中也可按 Tab。'}
                        onClick={() => editor.chain().focus().indent().run()} />
                    <EditorToolButton label={lists.task ? lists.taskDepth > 1 ? '提升一级' : '退出待办列表' : '减少缩进'} icon={IndentDecrease} disabled={!lists.canOutdent}
                        shortcut={lists.task ? 'Shift+Tab' : undefined}
                        description={lists.task ? lists.taskDepth > 1 ? '将当前子待办提升一级，已有子项一起移动。' : '当前已在最外层，继续减少缩进会转为普通段落。' : '减少段落缩进；列表中也可按 Shift+Tab。'}
                        onClick={() => editor.chain().focus().outdent().run()} />
                </div>
                <div className="editor-toolbar-group" role="group" aria-label="列表">
                    <EditorSelect className="editor-list-select" aria-label="项目符号样式" description="选择项目符号，或取消当前列表。" value={lists.bullet} placeholder="项目符号"
                        options={[...BULLET_STYLES.map(([value, label]) => ({ value, label })), ...(lists.bullet ? [{ value: 'none', label: '取消项目符号' }] : [])]}
                        onChange={value => setListStyle('bulletList', value)} />
                    <EditorSelect className="editor-list-select" aria-label="编号样式" description="选择数字、字母或罗马数字编号。" value={lists.ordered} placeholder="编号样式"
                        options={[...NUMBER_STYLES.map(([value, label]) => ({ value, label })), ...(lists.ordered ? [{ value: 'none', label: '取消编号' }] : [])]}
                        onChange={value => setListStyle('orderedList', value)} />
                    <EditorToolButton label="待办列表" icon={ListTodo} active={lists.task} className="editor-toolbar-text-button editor-todo-btn"
                        description="回车新增一项，空行回车结束列表。"
                        onClick={() => editor.chain().focus().toggleTaskList().run()}><span>待办</span></EditorToolButton>
                </div>
                <div className="editor-toolbar-group" role="group" aria-label="插入">
                    <EditorToolButton label="插入链接" icon={Link} description="为选中文字添加链接。" aria-haspopup="dialog" onClick={() => setInsertDialog('link')} />
                    <EditorToolButton label="插入图片" icon={ImagePlus} description="从本机或图片地址插入图片。" aria-haspopup="dialog" onClick={() => setInsertDialog('image')} />
                    <EditorTablePicker editor={editor} />
                    <EditorToolButton label="插入日期" icon={CalendarDays} className="editor-toolbar-text-button editor-todo-btn"
                        description="选择任意日期，或快速插入昨天、今天、明天。" aria-haspopup="dialog"
                        onClick={() => setInsertDialog('date')}><span>日期</span></EditorToolButton>
                    <EditorToolButton label="引用" icon={Quote} active={lists.blockquote} onClick={() => editor.chain().focus().toggleBlockquote().run()} />
                    <EditorToolButton label="行内代码" icon={Code} active={lists.code} disabled={!lists.canCode} onClick={() => editor.chain().focus().toggleCode().run()} />
                    <EditorToolButton label="代码块" icon={CodeXml} active={lists.codeBlock} onClick={() => editor.chain().focus().toggleCodeBlock().run()} />
                    <EditorToolButton label="分隔线" icon={Minus} onClick={() => editor.chain().focus().setHorizontalRule().run()} />
                </div>
                {lists.table && <div className="editor-toolbar-group editor-context-tools" role="group" aria-label="表格工具">
                    <EditorSelect className="editor-list-select" aria-label="表格操作" description="增删行列、切换表头；拖选多个单元格后可合并。" value="" placeholder="表格操作"
                        options={tableActions.map(([label, , disabled], index) => ({ value: String(index), label, disabled }))}
                        onChange={value => tableActions[Number(value)][1]()} />
                </div>}
            </div>
        </div>
        {searchOpen && <EditorSearch editor={editor} onClose={() => { setSearchOpen(false); editor.commands.focus(); }} />}
        {insertDialog && <EditorInsertDialog editor={editor} kind={insertDialog} onClose={() => setInsertDialog(null)} />}
    </>);
}
