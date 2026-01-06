import { Icon } from '../ui/Icon';


interface NotesToolbarProps {
    onToday: () => void;
    onPrev: () => void;
    onNext: () => void;
    onLocate: () => void;
    canPrev: boolean;
    canNext: boolean;
    hasActiveNote: boolean;
}

export function NotesToolbar({
    onToday,
    onPrev,
    onNext,
    onLocate,
    canPrev,
    canNext,
    hasActiveNote
}: NotesToolbarProps) {
    return (
        <div className="notes-toolbar">
            <div className="notes-toolbar-group">
                <button
                    className="notes-toolbar-btn"
                    onClick={onPrev}
                    disabled={!canPrev}
                    title="上一篇"
                >
                    <Icon name="chevronLeft" size={14} />
                </button>

                <button
                    className="notes-toolbar-btn primary"
                    onClick={onToday}
                    title="写今天的日记"
                >
                    <Icon name="edit" size={14} />
                    <span>写今天</span>
                </button>

                <button
                    className="notes-toolbar-btn"
                    onClick={onNext}
                    disabled={!canNext}
                    title="下一篇"
                >
                    <Icon name="chevronRight" size={14} />
                </button>
            </div>

            <div className="notes-toolbar-divider" />

            <button
                className="notes-toolbar-btn"
                onClick={onLocate}
                disabled={!hasActiveNote}
                title="在列表中定位当前笔记"
            >
                <Icon name="target" size={14} />
            </button>
        </div>
    );
}
