import { useEffect, useRef, useState, type ReactNode } from 'react';
import { type Editor, useEditorState } from '@tiptap/react';
import { ChevronDown, Highlighter, Baseline, IndentIncrease, IndentDecrease, AlignLeft, AlignCenter, AlignRight, AlignJustify, Search, MoreHorizontal, type LucideIcon } from 'lucide-react';
import { RichTextBold } from 'reactjs-tiptap-editor/bold';
import { RichTextItalic } from 'reactjs-tiptap-editor/italic';
import { RichTextUnderline } from 'reactjs-tiptap-editor/textunderline';
import { RichTextStrike } from 'reactjs-tiptap-editor/strike';
import { RichTextFontSize } from 'reactjs-tiptap-editor/fontsize';
import { RichTextHeading } from 'reactjs-tiptap-editor/heading';
import { RichTextFormatPainter } from 'reactjs-tiptap-editor/formatpainter';
import { RichTextLineHeight } from 'reactjs-tiptap-editor/lineheight';
import { RichTextTaskList } from 'reactjs-tiptap-editor/tasklist';
import { RichTextLink } from 'reactjs-tiptap-editor/link';
import { RichTextImage } from 'reactjs-tiptap-editor/image';
import { RichTextTable } from 'reactjs-tiptap-editor/table';
import { RichTextClear } from 'reactjs-tiptap-editor/clear';
import { RichTextUndo, RichTextRedo } from 'reactjs-tiptap-editor/history';
import { RichTextBlockquote } from 'reactjs-tiptap-editor/blockquote';
import { RichTextCode } from 'reactjs-tiptap-editor/code';
import { RichTextCodeBlock } from 'reactjs-tiptap-editor/codeblock';
import { RichTextHorizontalRule } from 'reactjs-tiptap-editor/horizontalrule';
import { BULLET_STYLES, NUMBER_STYLES, FONT_FAMILIES } from './extensions/NoteExtensions';
import { EditorSearch } from './EditorSearch';

const COLOR_PALETTE = [
    ['黑色', '#000000'], ['深灰', '#595959'], ['灰色', '#a5a5a5'], ['浅灰', '#d9d9d9'], ['白色', '#ffffff'],
    ['深红', '#c00000'], ['红色', '#ff0000'], ['橙色', '#ed7d31'], ['金色', '#ffc000'], ['黄色', '#fff200'],
    ['深绿', '#008000'], ['绿色', '#70ad47'], ['青色', '#00b0f0'], ['浅蓝', '#5b9bd5'], ['蓝色', '#0070c0'],
    ['深蓝', '#002060'], ['紫色', '#7030a0'], ['品红', '#c000c0'], ['棕色', '#7f6000'], ['米色', '#f4b183'],
] as const;

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
    const wrapperRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;

        const closeOutside = (event: PointerEvent) => {
            if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
        };
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setOpen(false);
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
                className="word-color-menu"
                title={`选择${label}`}
                aria-label={`${label}菜单`}
                aria-haspopup="menu"
                aria-expanded={open}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => setOpen(value => !value)}
            >
                <ChevronDown size={12} strokeWidth={2.5} aria-hidden="true" />
            </button>

            {open && (
                <div className="word-color-popover" role="menu" aria-label={`选择${label}`}>
                    <div className="word-color-popover-title">主题颜色</div>
                    <div className="word-color-grid">
                        {COLOR_PALETTE.map(([name, value]) => (
                            <button
                                type="button"
                                role="menuitem"
                                key={value}
                                className="word-color-option"
                                style={{ backgroundColor: value }}
                                title={name}
                                aria-label={`${label}：${name}`}
                                onMouseDown={(event) => event.preventDefault()}
                                onClick={() => chooseColor(value)}
                            />
                        ))}
                    </div>
                    <div className="word-color-popover-footer">
                        <button
                            type="button"
                            role="menuitem"
                            className="word-color-clear"
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => {
                                onClear();
                                setOpen(false);
                            }}
                        >
                            {clearLabel}
                        </button>
                        <label className="word-color-custom">
                            其他颜色
                            <input
                                type="color"
                                value={color}
                                aria-label={`${label}其他颜色`}
                                onChange={(event) => chooseColor(event.target.value)}
                            />
                        </label>
                    </div>
                </div>
            )}
        </div>
    );
}

function Tool({ label, children }: { label: string; children: ReactNode }) {
    return <label className="editor-tool" data-tool={label}><span className="editor-sr-only">{label}</span>{children}</label>;
}

export function EditorToolbar({ editor }: { editor: Editor }) {
    const [searchOpen, setSearchOpen] = useState(false);
    const [textColor, setTextColor] = useState('#000000');
    const [highlightColor, setHighlightColor] = useState('#fff200');
    const moreRef = useRef<HTMLDetailsElement>(null);
    useEffect(() => {
        const closeOutside = (event: PointerEvent) => {
            if (moreRef.current && !moreRef.current.contains(event.target as Node)) moreRef.current.open = false;
        };
        document.addEventListener('pointerdown', closeOutside);
        return () => document.removeEventListener('pointerdown', closeOutside);
    }, []);
    const lists = useEditorState({
        editor,
        selector: ({ editor }) => ({
            bullet: editor.isActive('bulletList') ? editor.getAttributes('bulletList').listStyle || 'disc' : '',
            ordered: editor.isActive('orderedList') ? editor.getAttributes('orderedList').listStyle || 'decimal' : '',
            table: editor.isActive('table'),
            canMerge: editor.can().mergeCells(),
            canSplit: editor.can().splitCell(),
            image: editor.isActive('imageBlock') || editor.isActive('image'),
            font: editor.getAttributes('textStyle').fontFamily || '',
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
                if (event.target instanceof Element && event.target.closest('button, summary')) event.preventDefault();
            }}>
            <div className="editor-toolbar-row">
            <div className="editor-toolbar-group" role="group" aria-label="字体">
                <span className="editor-group-label" aria-hidden="true">文字</span>
                <Tool label="段落标题"><RichTextHeading /></Tool>
                <select className="editor-list-select" aria-label="正文字体" value={lists.font}
                    onChange={event => event.target.value
                        ? editor.chain().focus().setFontFamily(event.target.value).run()
                        : editor.chain().focus().unsetFontFamily().run()}>
                    {FONT_FAMILIES.map(([value, name]) => <option key={value} value={value}>{name}</option>)}
                    {!FONT_FAMILIES.some(([value]) => value === lists.font) && <option value={lists.font}>{lists.font}</option>}
                </select>
                <Tool label="字号"><RichTextFontSize /></Tool>
                <span className="editor-toolbar-divider" aria-hidden="true" />
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
                <span className="editor-group-label" aria-hidden="true">编辑</span>
                <Tool label="撤销"><RichTextUndo /></Tool>
                <Tool label="重做"><RichTextRedo /></Tool>
                <Tool label="格式刷"><RichTextFormatPainter /></Tool>
                <Tool label="清除格式"><RichTextClear /></Tool>
                <button type="button" className="editor-toolbar-btn" aria-label="查找替换" title="查找替换"
                    data-state={searchOpen ? 'on' : 'off'} aria-pressed={searchOpen}
                    onClick={() => setSearchOpen(value => !value)}><Search size={18} /></button>
            </div>
            </div>
            <div className="editor-toolbar-row">
            <div className="editor-toolbar-group" role="group" aria-label="段落和列表">
                <span className="editor-group-label" aria-hidden="true">段落</span>
                {([['left', '左对齐', AlignLeft], ['center', '居中对齐', AlignCenter], ['right', '右对齐', AlignRight], ['justify', '两端对齐', AlignJustify]] as const)
                    .map(([value, label, AlignIcon]) => <button key={value} type="button" className="editor-toolbar-btn"
                        aria-label={label} title={label} data-state={lists.align === value ? 'on' : 'off'} aria-pressed={lists.align === value}
                        onClick={() => editor.chain().focus().setTextAlign(value).run()}><AlignIcon size={18} /></button>)}
                <Tool label="行距"><RichTextLineHeight /></Tool>
                <span className="editor-toolbar-divider" aria-hidden="true" />
                <select className="editor-list-select" aria-label="项目符号样式" value={lists.bullet}
                    onChange={event => setListStyle('bulletList', event.target.value)}>
                    <option value="" disabled>项目符号</option>
                    {BULLET_STYLES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    {lists.bullet && <option value="none">取消项目符号</option>}
                </select>
                <select className="editor-list-select" aria-label="编号样式" value={lists.ordered}
                    onChange={event => setListStyle('orderedList', event.target.value)}>
                    <option value="" disabled>编号样式</option>
                    {NUMBER_STYLES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    {lists.ordered && <option value="none">取消编号</option>}
                </select>
                <Tool label="待办列表"><RichTextTaskList /></Tool>
                <button type="button" className="editor-toolbar-btn" aria-label="增加缩进" title="增加缩进 (Tab)"
                    onClick={() => editor.chain().focus().indent().run()}><IndentIncrease size={18} /></button>
                <button type="button" className="editor-toolbar-btn" aria-label="减少缩进" title="减少缩进 (Shift+Tab)"
                    onClick={() => editor.chain().focus().outdent().run()}><IndentDecrease size={18} /></button>
            </div>
            <div className="editor-toolbar-group" role="group" aria-label="插入">
                <span className="editor-group-label" aria-hidden="true">插入</span>
                <Tool label="插入链接"><RichTextLink /></Tool>
                <Tool label="插入图片"><RichTextImage /></Tool>
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
                <details className="editor-more" ref={moreRef}
                    onKeyDown={event => {
                        if (event.key === 'Escape') {
                            event.currentTarget.open = false;
                            event.currentTarget.querySelector('summary')?.focus();
                        }
                    }}>
                    <summary aria-label="更多插入工具" title="更多插入工具"><MoreHorizontal size={18} />更多</summary>
                    <div className="editor-more-menu" onClick={event => {
                        if (event.target instanceof Element && event.target.closest('button') && moreRef.current) moreRef.current.open = false;
                    }}>
                        <Tool label="行内代码"><RichTextCode /></Tool>
                        <Tool label="代码块"><RichTextCodeBlock /></Tool>
                        <Tool label="分隔线"><RichTextHorizontalRule /></Tool>
                    </div>
                </details>
            </div>
            </div>
            {(lists.table || lists.image) && <div className="editor-context-tools" role="group" aria-label="选中内容工具">
                {lists.table && <>
                <span className="editor-group-label">表格</span>
                <select className="editor-list-select" aria-label="表格操作" value=""
                    onChange={event => tableActions[Number(event.target.value)][1]()}>
                    <option value="" disabled>行列与单元格</option>
                    {tableActions.map(([label, , disabled], index) => <option key={label} value={index} disabled={disabled}>{label}</option>)}
                </select>
                <span className="editor-context-hint">拖选多个单元格后可合并</span>
                </>}
                {lists.image && <>
                <span className="editor-group-label">图片</span>
                <select className="editor-list-select" aria-label="图片宽度" value=""
                    onChange={event => editor.chain().focus().updateImage({ width: event.target.value === 'auto' ? null
                        : Math.round(editor.view.dom.clientWidth * Number.parseInt(event.target.value) / 100) }).run()}>
                    <option value="" disabled>图片宽度</option>
                    <option value="auto">原始宽度</option>
                    {['25%', '50%', '75%', '100%'].map(width => <option key={width} value={width}>{width} 正文宽度</option>)}
                </select>
                <span className="editor-context-hint">拖动图片四角可调整大小</span>
                </>}
            </div>}
        </div>
        {searchOpen && <EditorSearch editor={editor} onClose={() => setSearchOpen(false)} />}
    </>);
}
