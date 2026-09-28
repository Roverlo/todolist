import { useRef, useState } from 'react';
import { Clock3 } from 'lucide-react';
import { useAppStore, waitForAppSave } from '../../state/appStore';
import { DEFAULT_NOTE_TASK_TIME, noteTaskTimeSettings } from '../../utils/noteTaskTime';
import { EditorPopover, EditorToolButton } from './EditorToolbarControls';

export function NoteTaskTimeSettings() {
    const triggerRef = useRef<HTMLButtonElement>(null);
    const [open, setOpen] = useState(false);
    const [draft, setDraft] = useState(DEFAULT_NOTE_TASK_TIME);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const apply = async () => {
        setSaving(true); setError('');
        useAppStore.getState().updateSettings({ noteTaskTime: draft });
        try { await waitForAppSave(); setOpen(false); }
        catch { setError('设置未能保存，请检查存储空间后重试。'); }
        finally { setSaving(false); }
    };
    return <div className="editor-popover-anchor">
        <EditorToolButton ref={triggerRef} icon={Clock3} label="待办时间设置"
            className="editor-toolbar-text-button editor-todo-btn" aria-haspopup="dialog" aria-expanded={open}
            description="分别设置创建时间、完成时间的显示和颜色。"
            onClick={() => {
                setDraft(noteTaskTimeSettings(useAppStore.getState().settings.noteTaskTime));
                setError(''); setOpen(value => !value);
            }}><span>时间</span></EditorToolButton>
        {open && <EditorPopover label="待办时间设置" triggerRef={triggerRef} setOpen={setOpen} className="note-task-time-popover">
            <div className="editor-popover-heading"><strong>待办时间</strong><span>应用于全部随记</span></div>
            {([['showCreated', 'createdColor', '创建时间'], ['showCompleted', 'completedColor', '完成时间']] as const).map(([show, color, label]) =>
                <div className="note-task-time-option" key={show}>
                    <label><input type="checkbox" checked={draft[show]} disabled={saving}
                        onChange={event => setDraft({ ...draft, [show]: event.target.checked })} />显示{label}</label>
                    <input type="color" aria-label={`${label}颜色`} title={`选择${label}颜色`} value={draft[color]} disabled={saving}
                        onChange={event => setDraft({ ...draft, [color]: event.target.value })} />
                </div>)}
            <div className="note-task-time-preview" aria-label="时间样式预览">
                {draft.showCreated && <span style={{ color: draft.createdColor }}>创建 09:30</span>}
                {draft.showCreated && draft.showCompleted && <span> / </span>}
                {draft.showCompleted && <span style={{ color: draft.completedColor }}>完成 11:20</span>}
                {!draft.showCreated && !draft.showCompleted && <span>隐藏时间，仍会记录</span>}
            </div>
            {error && <p className="note-task-time-error" role="alert">{error}</p>}
            <div className="note-task-time-actions">
                <button type="button" className="btn btn-light" disabled={saving} onClick={() => setDraft(DEFAULT_NOTE_TASK_TIME)}>恢复默认</button>
                <button type="button" className="btn btn-primary" disabled={saving} onClick={() => void apply()}>{saving ? '保存中…' : '应用'}</button>
            </div>
        </EditorPopover>}
    </div>;
}
