import { useAppStore } from '../../state/appStore';
import { Icon } from '../ui/Icon';

export function NotesSearch() {
    const searchText = useAppStore((state) => state.noteSearchText) || '';
    const setSearchText = useAppStore((state) => state.setNoteSearchText);

    return (
        <div className="notes-search">
            <Icon name="search" size={14} />
            <input
                type="text"
                placeholder="搜索随记...（支持标题和内容）"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
            />
            {searchText && (
                <button
                    className="notes-search-clear"
                    onClick={() => setSearchText('')}
                    title="清除搜索"
                >
                    <Icon name="close" size={12} />
                </button>
            )}
        </div>
    );
}
