import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { getMarkRange, type Editor } from '@tiptap/core';
import { isTauri } from '@tauri-apps/api/core';
import { FolderOpen, ImagePlus, X } from 'lucide-react';
import { IMAGE_TYPES, readNoteImage, openNoteImageFolder } from '../../utils/noteImages';

export function EditorInsertDialog({ editor, kind, onClose }: { editor: Editor; kind: 'link' | 'image'; onClose: () => void }) {
    const dialogRef = useRef<HTMLDialogElement>(null);
    const fileRef = useRef<HTMLInputElement>(null);
    const selection = useRef(kind === 'link'
        ? getMarkRange(editor.state.selection.$from, editor.schema.marks.link) || editor.state.selection
        : editor.state.selection);
    const originalText = editor.state.doc.textBetween(selection.current.from, selection.current.to, ' ');
    const [text, setText] = useState(originalText);
    const [url, setUrl] = useState(kind === 'link' ? editor.getAttributes('link').href || '' : '');
    const [source, setSource] = useState<'local' | 'url'>('local');
    const [file, setFile] = useState<File | null>(null);
    const [preview, setPreview] = useState('');
    const [description, setDescription] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        dialogRef.current?.showModal();
    }, []);
    useEffect(() => {
        if (!file) return;
        const url = URL.createObjectURL(file);
        setPreview(url);
        return () => URL.revokeObjectURL(url);
    }, [file]);

    const submit = async () => {
        setError('');
        setBusy(true);
        try {
            let address = url.trim();
            if (kind === 'link' || source === 'url') {
                if (!address) throw new Error('请输入链接地址');
                if (!/^[a-z][a-z\d+.-]*:/i.test(address)) address = 'https://' + address;
                const parsed = new URL(address);
                const allowed = kind === 'link' ? ['http:', 'https:', 'mailto:', 'tel:'] : ['http:', 'https:'];
                if (!allowed.includes(parsed.protocol)) throw new Error('请使用有效的网页链接');
            }
            if (kind === 'link') {
                const chain = editor.chain().focus().setTextSelection(selection.current);
                if (text === originalText && originalText) chain.setLink({ href: address }).run();
                else chain.insertContent({ type: 'text', text: text.trim() || address, marks: [{ type: 'link', attrs: { href: address } }] }).run();
            } else {
                if (source === 'local' && !file) throw new Error('请先选择图片');
                const src = source === 'local' ? await readNoteImage(file!) : address;
                if (!editor.isDestroyed) editor.chain().focus().setTextSelection(selection.current)
                    .insertContent({ type: 'imageBlock', attrs: { src, alt: description.trim() || file?.name || '' } }).run();
            }
            onClose();
        } catch (error) {
            setError(error instanceof Error ? error.message : '插入失败，请重试');
        } finally { setBusy(false); }
    };

    return createPortal(
        <dialog className="editor-insert-dialog" ref={dialogRef} aria-labelledby="editor-insert-title"
            onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
            <form onSubmit={event => { event.preventDefault(); void submit(); }}>
                <header>
                    <h2 id="editor-insert-title">{kind === 'link' ? '插入链接' : '插入图片'}</h2>
                    <button type="button" className="editor-dialog-close" aria-label="关闭插入窗口" disabled={busy} onClick={onClose}><X size={18} /></button>
                </header>
                <div className="editor-dialog-body">
                    {kind === 'link' ? <>
                        <label>显示文字<input autoFocus value={text} onChange={event => setText(event.target.value)} placeholder="留空则显示链接地址" /></label>
                        <label>链接地址<input value={url} onChange={event => setUrl(event.target.value)} placeholder="https://example.com" required /></label>
                    </> : <>
                        <div className="editor-image-sources" role="group" aria-label="图片来源">
                            <button type="button" aria-pressed={source === 'local'} onClick={() => { setSource('local'); setError(''); }}>本地图片</button>
                            <button type="button" aria-pressed={source === 'url'} onClick={() => { setSource('url'); setError(''); }}>网络图片</button>
                        </div>
                        {source === 'local' ? <>
                            <input ref={fileRef} type="file" accept={IMAGE_TYPES.join(',')} hidden aria-label="选择本地图片"
                                onChange={event => { setFile(event.target.files?.[0] || null); setError(''); }} />
                            <button type="button" className="editor-image-picker" onClick={() => fileRef.current?.click()}>
                                {file && preview ? <img src={preview} alt="待插入图片预览" /> : <ImagePlus size={28} />}
                                <strong>{file ? file.name : '选择图片'}</strong>
                                <span>{file ? '点击可重新选择' : 'PNG、JPG、WebP、GIF · 单张不超过 2 MB'}</span>
                            </button>
                        </> : <label>图片链接<input value={url} onChange={event => setUrl(event.target.value)} placeholder="https://example.com/photo.png" required /></label>}
                        <label>图片说明（选填）<input value={description} onChange={event => setDescription(event.target.value)} placeholder="如：机房网络拓扑" /></label>
                        <p className="editor-dialog-hint">图片无法显示或使用读屏工具时，会用这段说明代替。</p>
                        <div className="editor-image-storage">
                            <strong>图片存在哪里？</strong>
                            <p>{source === 'url' ? '网络图片引用原网址，需要联网查看。'
                                : isTauri() ? '本地图片会保存到“文档 / ProjectTodo / images”，笔记内也保留副本，备份和导出仍包含图片。'
                                    : '网页预览中的图片保存在当前浏览器。免安装 EXE 版会保存到“文档 / ProjectTodo / images”。'}</p>
                            <button type="button" disabled={!isTauri()} onClick={() => void openNoteImageFolder().catch(error => setError(String(error)))}>
                                <FolderOpen size={15} />打开图片文件夹
                            </button>
                        </div>
                    </>}
                    {error && <p className="editor-dialog-error" role="alert">{error}</p>}
                </div>
                <footer>
                    {kind === 'link' && editor.isActive('link') && <button type="button" onClick={() => {
                        editor.chain().focus().setTextSelection(selection.current).unsetLink().run(); onClose();
                    }}>移除链接</button>}
                    <button type="button" disabled={busy} onClick={onClose}>取消</button>
                    <button type="submit" className="editor-dialog-primary" disabled={busy || (kind === 'image' && source === 'local' && !file)}>
                        {busy ? '正在插入…' : kind === 'link' ? '应用链接' : '插入图片'}
                    </button>
                </footer>
            </form>
        </dialog>, document.body
    );
}
