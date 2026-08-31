import { useEffect, useRef, useState } from 'react';
import { Editor } from '@tiptap/react';
import {
    AlignCenter,
    AlignLeft,
    AlignRight,
    Bold,
    ChevronDown,
    Code2,
    Highlighter,
    Italic,
    List,
    ListOrdered,
    Palette,
    Quote,
    Redo2,
    RemoveFormatting,
    Strikethrough,
    Underline,
    Undo2,
    type LucideIcon,
} from 'lucide-react';
import clsx from 'clsx';
import './RichTextEditor.css';

interface EditorToolbarProps {
    editor: Editor | null;
}

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

export function EditorToolbar({ editor }: EditorToolbarProps) {
    const [textColor, setTextColor] = useState('#000000');
    const [highlightColor, setHighlightColor] = useState('#fff200');

    if (!editor) {
        return null;
    }

    const applyTextColor = (color: string) => {
        setTextColor(color);
        editor.chain().focus().setColor(color).run();
    };
    const applyHighlightColor = (color: string) => {
        setHighlightColor(color);
        editor.chain().focus().setHighlight({ color }).run();
    };

    const ToolbarButton = ({
        icon: ToolbarIcon,
        title,
        action,
        isActive = false,
        isDisabled = false,
    }: {
        icon: LucideIcon;
        title: string;
        action: () => void;
        isActive?: boolean;
        isDisabled?: boolean;
    }) => (
        <button
            onClick={(e) => {
                e.preventDefault();
                action();
            }}
            disabled={isDisabled}
            className={clsx('editor-toolbar-btn', { 'is-active': isActive })}
            title={title}
            aria-label={title}
            type="button"
            onMouseDown={(e) => e.preventDefault()} // Prevent focus loss
        >
            <ToolbarIcon size={18} strokeWidth={2} aria-hidden="true" />
        </button>
    );

    return (
        <div className="editor-toolbar">
            <div className="editor-toolbar-group">
                <ToolbarButton
                    icon={Undo2}
                    title="撤销 (Ctrl+Z)"
                    action={() => editor.chain().focus().undo().run()}
                    isDisabled={!editor.can().chain().focus().undo().run()}
                />
                <ToolbarButton
                    icon={Redo2}
                    title="重做 (Ctrl+Shift+Z)"
                    action={() => editor.chain().focus().redo().run()}
                    isDisabled={!editor.can().chain().focus().redo().run()}
                />
            </div>

            <div className="editor-toolbar-group">
                <ToolbarButton
                    icon={Bold}
                    title="加粗 (Ctrl+B)"
                    action={() => editor.chain().focus().toggleBold().run()}
                    isActive={editor.isActive('bold')}
                />
                <ToolbarButton
                    icon={Italic}
                    title="斜体 (Ctrl+I)"
                    action={() => editor.chain().focus().toggleItalic().run()}
                    isActive={editor.isActive('italic')}
                />
                <ToolbarButton
                    icon={Underline}
                    title="下划线 (Ctrl+U)"
                    action={() => editor.chain().focus().toggleUnderline().run()}
                    isActive={editor.isActive('underline')}
                />
                <ToolbarButton
                    icon={Strikethrough}
                    title="删除线 (Ctrl+Shift+S)"
                    action={() => editor.chain().focus().toggleStrike().run()}
                    isActive={editor.isActive('strike')}
                />
            </div>

            <div className="editor-toolbar-group">
                <ToolbarButton
                    icon={AlignLeft}
                    title="左对齐"
                    action={() => editor.chain().focus().setTextAlign('left').run()}
                    isActive={editor.isActive({ textAlign: 'left' })}
                />
                <ToolbarButton
                    icon={AlignCenter}
                    title="居中对齐"
                    action={() => editor.chain().focus().setTextAlign('center').run()}
                    isActive={editor.isActive({ textAlign: 'center' })}
                />
                <ToolbarButton
                    icon={AlignRight}
                    title="右对齐"
                    action={() => editor.chain().focus().setTextAlign('right').run()}
                    isActive={editor.isActive({ textAlign: 'right' })}
                />
            </div>

            <div className="editor-toolbar-group">
                <ToolbarButton
                    icon={List}
                    title="无序列表"
                    action={() => editor.chain().focus().toggleBulletList().run()}
                    isActive={editor.isActive('bulletList')}
                />
                <ToolbarButton
                    icon={ListOrdered}
                    title="有序列表"
                    action={() => editor.chain().focus().toggleOrderedList().run()}
                    isActive={editor.isActive('orderedList')}
                />
            </div>

            <div className="editor-toolbar-group">
                <ToolbarButton
                    icon={Quote}
                    title="引用"
                    action={() => editor.chain().focus().toggleBlockquote().run()}
                    isActive={editor.isActive('blockquote')}
                />
                <ToolbarButton
                    icon={Code2}
                    title="代码块"
                    action={() => editor.chain().focus().toggleCodeBlock().run()}
                    isActive={editor.isActive('codeBlock')}
                />
            </div>

            <div className="editor-toolbar-group">
                <div className="editor-toolbar-select-wrapper" title="字体大小">
                    <select
                        className="editor-toolbar-select"
                        aria-label="字体大小"
                        onChange={(e) => editor.chain().focus().setFontSize(e.target.value).run()}
                        value={editor.getAttributes('textStyle').fontSize || ''}
                        onMouseDown={(e) => {
                            // Don't prevent default on select as it needs to open options
                            e.stopPropagation();
                        }}
                    >
                        <option value="" disabled>字号</option>
                        <option value="12px">12px</option>
                        <option value="14px">14px</option>
                        <option value="16px">16px</option>
                        <option value="18px">18px</option>
                        <option value="20px">20px</option>
                        <option value="24px">24px</option>
                        <option value="30px">30px</option>
                    </select>
                </div>
            </div>

            <div className="editor-toolbar-group">
                <WordColorPicker
                    icon={Palette}
                    label="字体颜色"
                    color={textColor}
                    clearLabel="自动颜色"
                    onApply={applyTextColor}
                    onClear={() => editor.chain().focus().unsetColor().run()}
                />
                <WordColorPicker
                    icon={Highlighter}
                    label="背景颜色"
                    color={highlightColor}
                    clearLabel="无颜色"
                    onApply={applyHighlightColor}
                    onClear={() => editor.chain().focus().unsetHighlight().run()}
                />
            </div>

            <div className="editor-toolbar-group">
                <ToolbarButton
                    icon={RemoveFormatting}
                    title="清除所有格式"
                    action={() => editor.chain().focus().unsetAllMarks().clearNodes().unsetFontSize().run()}
                />
            </div>

            <div className="editor-toolbar-shim" />
        </div>
    );
}
