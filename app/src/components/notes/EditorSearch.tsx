import { useEffect, useRef, useState } from 'react';
import { type Editor, useEditorState } from '@tiptap/react';

export function EditorSearch({ editor, onClose }: { editor: Editor; onClose: () => void }) {
    const [search, setSearch] = useState('');
    const [replacement, setReplacement] = useState('');
    const [caseSensitive, setCaseSensitive] = useState(false);
    const input = useRef<HTMLInputElement>(null);
    const match = useEditorState({ editor, selector: ({ editor }) => ({
        count: editor.storage.searchAndReplace.results.length,
        index: editor.storage.searchAndReplace.resultIndex,
    }) });

    useEffect(() => {
        editor.commands.setSearchTerm(search);
        editor.commands.setCaseSensitive(caseSensitive);
        editor.commands.resetIndex();
    }, [editor, search, caseSensitive]);

    // Empty replacement is meaningful: it deletes the matched text.
    useEffect(() => { editor.commands.setReplaceTerm(replacement); }, [editor, replacement]);
    useEffect(() => {
        input.current?.focus();
        return () => { if (!editor.isDestroyed) editor.commands.setSearchTerm(''); };
    }, [editor]);

    const move = (backward = false) => {
        if (backward) editor.commands.previousSearchResult();
        else editor.commands.nextSearchResult();
        const { results, resultIndex } = editor.storage.searchAndReplace;
        if (results[resultIndex]) editor.chain().focus().setTextSelection(results[resultIndex]).scrollIntoView().run();
    };

    return <form className="editor-search" role="search" aria-label="查找替换"
        onSubmit={event => { event.preventDefault(); move(); }}
        onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); onClose(); } }}>
        <label>查找<input ref={input} aria-label="查找内容" value={search} onChange={event => setSearch(event.target.value)} /></label>
        <label>替换为<input aria-label="替换内容" value={replacement} onChange={event => setReplacement(event.target.value)} placeholder="留空可删除匹配内容" /></label>
        <label className="editor-search-case"><input type="checkbox" checked={caseSensitive} onChange={event => setCaseSensitive(event.target.checked)} />区分大小写</label>
        <span role="status">{match.count ? Math.min(match.index + 1, match.count) : 0}/{match.count}</span>
        <button type="button" disabled={!match.count} onClick={() => move(true)}>上一处</button>
        <button type="submit" disabled={!match.count}>下一处</button>
        <button type="button" disabled={!match.count} onClick={() => editor.commands.replace()}>替换当前</button>
        <button type="button" disabled={!match.count} onClick={() => editor.commands.replaceAll()}>全部替换</button>
        <button type="button" onClick={onClose} aria-label="关闭查找替换">关闭</button>
    </form>;
}
