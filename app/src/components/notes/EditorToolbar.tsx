import { Editor } from '@tiptap/react';
import { Icon, type IconName } from '../ui/Icon';
import clsx from 'clsx';
import './RichTextEditor.css';

interface EditorToolbarProps {
    editor: Editor | null;
}

export function EditorToolbar({ editor }: EditorToolbarProps) {
    if (!editor) {
        return null;
    }

    const ToolbarButton = ({
        icon,
        title,
        action,
        isActive = false,
        isDisabled = false,
    }: {
        icon: IconName;
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
            type="button"
            onMouseDown={(e) => e.preventDefault()} // Prevent focus loss
        >
            <Icon name={icon} size={16} />
        </button>
    );

    const ToolbarDivider = () => <div className="editor-toolbar-divider" />;

    return (
        <div className="editor-toolbar">
            <div className="editor-toolbar-group">
                <ToolbarButton
                    icon="undo"
                    title="撤销 (Ctrl+Z)"
                    action={() => editor.chain().focus().undo().run()}
                    isDisabled={!editor.can().chain().focus().undo().run()}
                />
                <ToolbarButton
                    icon="redo"
                    title="重做 (Ctrl+Shift+Z)"
                    action={() => editor.chain().focus().redo().run()}
                    isDisabled={!editor.can().chain().focus().redo().run()}
                />
            </div>

            <ToolbarDivider />

            <div className="editor-toolbar-group">
                <ToolbarButton
                    icon="bold"
                    title="加粗 (Ctrl+B)"
                    action={() => editor.chain().focus().toggleBold().run()}
                    isActive={editor.isActive('bold')}
                />
                <ToolbarButton
                    icon="italic"
                    title="斜体 (Ctrl+I)"
                    action={() => editor.chain().focus().toggleItalic().run()}
                    isActive={editor.isActive('italic')}
                />
                <ToolbarButton
                    icon="underline"
                    title="下划线 (Ctrl+U)"
                    action={() => editor.chain().focus().toggleUnderline().run()}
                    isActive={editor.isActive('underline')}
                />
                <ToolbarButton
                    icon="strike"
                    title="删除线 (Ctrl+Shift+S)"
                    action={() => editor.chain().focus().toggleStrike().run()}
                    isActive={editor.isActive('strike')}
                />
            </div>

            <ToolbarDivider />

            <div className="editor-toolbar-group">
                <ToolbarButton
                    icon="align-left"
                    title="左对齐"
                    action={() => editor.chain().focus().setTextAlign('left').run()}
                    isActive={editor.isActive({ textAlign: 'left' })}
                />
                <ToolbarButton
                    icon="align-center"
                    title="居中对齐"
                    action={() => editor.chain().focus().setTextAlign('center').run()}
                    isActive={editor.isActive({ textAlign: 'center' })}
                />
                <ToolbarButton
                    icon="align-right"
                    title="右对齐"
                    action={() => editor.chain().focus().setTextAlign('right').run()}
                    isActive={editor.isActive({ textAlign: 'right' })}
                />
            </div>

            <ToolbarDivider />

            <div className="editor-toolbar-group">
                <ToolbarButton
                    icon="list-ul"
                    title="无序列表"
                    action={() => editor.chain().focus().toggleBulletList().run()}
                    isActive={editor.isActive('bulletList')}
                />
                <ToolbarButton
                    icon="list-ol"
                    title="有序列表"
                    action={() => editor.chain().focus().toggleOrderedList().run()}
                    isActive={editor.isActive('orderedList')}
                />
            </div>

            <ToolbarDivider />

            <div className="editor-toolbar-group">
                <ToolbarButton
                    icon="quote"
                    title="引用"
                    action={() => editor.chain().focus().toggleBlockquote().run()}
                    isActive={editor.isActive('blockquote')}
                />
                <ToolbarButton
                    icon="code"
                    title="代码块"
                    action={() => editor.chain().focus().toggleCodeBlock().run()}
                    isActive={editor.isActive('codeBlock')}
                />
            </div>

            <ToolbarDivider />

            <div className="editor-toolbar-group">
                <div className="editor-toolbar-select-wrapper" title="字体大小">
                    <select
                        className="editor-toolbar-select"
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

            <ToolbarDivider />

            <div className="editor-toolbar-group">
                <div className="color-picker-wrapper" title="字体颜色">
                    <Icon name="palette" size={16} className="color-picker-icon" />
                    <input
                        type="color"
                        className="color-picker-input"
                        onInput={(e) => editor.chain().focus().setColor((e.target as HTMLInputElement).value).run()}
                        onChange={(e) => editor.chain().focus().setColor((e.target as HTMLInputElement).value).run()}
                        value={editor.getAttributes('textStyle').color || '#000000'}
                    />
                </div>
                <div className="color-picker-wrapper" title="背景颜色 (高亮)">
                    <Icon name="highlighter" size={16} className="color-picker-icon" />
                    <input
                        type="color"
                        className="color-picker-input"
                        onInput={(e) => editor.chain().focus().toggleHighlight({ color: (e.target as HTMLInputElement).value }).run()}
                        onChange={(e) => editor.chain().focus().toggleHighlight({ color: (e.target as HTMLInputElement).value }).run()}
                        value={editor.getAttributes('highlight').color || '#ffff00'}
                    />
                </div>
            </div>

            <ToolbarDivider />

            <div className="editor-toolbar-group">
                <ToolbarButton
                    icon="eraser"
                    title="清除所有格式"
                    action={() => editor.chain().focus().unsetAllMarks().clearNodes().unsetFontSize().run()}
                />
            </div>

            <div className="editor-toolbar-shim" />
        </div>
    );
}
