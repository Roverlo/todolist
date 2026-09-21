import { Node, Extension, type Editor, type JSONContent } from '@tiptap/core';
import { Plugin } from '@tiptap/pm/state';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { attachmentId, storeAttachment, openAttachmentFolder, saveAttachment, externalizeAttachments } from '../../../utils/noteAttachments';
import { IMAGE_TYPES, readNoteImage } from '../../../utils/noteImages';
import { useToastStore } from '../../../state/toastStore';

const report = (error: unknown) => useToastStore.getState().addToast(error instanceof Error ? error.message : String(error), 'error', 8000);
const validSource = (source: string) => !!attachmentId(source) || /^data:[^,]*;base64,/i.test(source);
const sizeLabel = (bytes: number) => bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

export async function insertNoteFiles(editor: Editor, files: File[], asAttachments = false) {
    const nodes: JSONContent[] = [];
    // Read sequentially so multi-file pastes do not multiply peak memory usage.
    for (const file of files) {
        try {
            if (!asAttachments && IMAGE_TYPES.includes(file.type)) {
                nodes.push({ type: 'imageBlock', attrs: { src: await readNoteImage(file), alt: file.name } });
            } else {
                nodes.push({ type: 'noteAttachment', attrs: { src: await storeAttachment(file), name: file.name, size: file.size, mime: file.type || 'application/octet-stream' } });
            }
        } catch (error) { report(new Error(`${file.name || '文件'}：${error instanceof Error ? error.message : String(error)}`)); }
    }
    if (nodes.length && !editor.isDestroyed) editor.chain().focus().insertContent(nodes).run();
}

export const NoteAttachment = Node.create({
    name: 'noteAttachment', group: 'block', atom: true, draggable: true,
    addAttributes() {
        return {
            src: { default: '', parseHTML: element => element.getAttribute('href'), rendered: false },
            name: { default: '附件', parseHTML: element => element.getAttribute('download') || element.textContent, rendered: false },
            size: { default: 0, parseHTML: element => Number(element.getAttribute('data-size')) || 0, rendered: false },
            mime: { default: 'application/octet-stream', parseHTML: element => element.getAttribute('data-mime') || 'application/octet-stream', rendered: false },
        };
    },
    parseHTML() { return [{ tag: 'a[data-type="attachment"]', priority: 1000, getAttrs: element => validSource(element.getAttribute('href') || '') ? {} : false }]; },
    renderHTML({ node }) {
        return ['a', { 'data-type': 'attachment', href: validSource(node.attrs.src) ? node.attrs.src : '', download: node.attrs.name,
            'data-size': node.attrs.size, 'data-mime': node.attrs.mime }, `📎 ${node.attrs.name} (${sizeLabel(node.attrs.size)})`];
    },
    renderText({ node }) { return `[附件：${node.attrs.name}]`; },
    addNodeView() {
        return ({ node }) => {
            const dom = document.createElement('div');
            dom.className = 'note-attachment';
            dom.setAttribute('data-type', 'attachment');
            dom.contentEditable = 'false';
            const label = document.createElement('span');
            label.className = 'note-attachment-name';
            label.textContent = `📎 ${node.attrs.name}`;
            label.title = node.attrs.name;
            const size = document.createElement('span');
            size.className = 'note-attachment-size';
            size.textContent = sizeLabel(node.attrs.size);
            const save = document.createElement('button');
            save.type = 'button';
            save.textContent = '另存为';
            save.setAttribute('aria-label', `另存附件 ${node.attrs.name}`);
            save.onclick = () => void saveAttachment(node.attrs.src, node.attrs.name, node.attrs.mime).catch(report);
            dom.append(label, size, save);
            if (isTauri()) {
                const folder = document.createElement('button');
                folder.type = 'button';
                folder.textContent = '所在文件夹';
                folder.setAttribute('aria-label', `打开附件文件夹 ${node.attrs.name}`);
                folder.onclick = () => void openAttachmentFolder(node.attrs.src).catch(report);
                dom.append(folder);
            }
            return { dom, stopEvent: event => event.target instanceof Element && !!event.target.closest('button') };
        };
    },
});

export const NoteFilePaste = Extension.create({
    name: 'noteFilePaste', priority: 1100,
    addProseMirrorPlugins() {
        const editor = this.editor;
        let filePaste = 0;
        return [new Plugin({ props: {
            handleKeyDown: (_view, event) => {
                if (!isTauri() || !(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'v' || event.shiftKey) return false;
                const before = filePaste;
                // WebView does not always expose Windows CF_HDROP in ClipboardEvent.files.
                void invoke<string[]>('clipboard_file_names').then(async names => {
                    if (!names.length || before !== filePaste || editor.isDestroyed) return;
                    filePaste++;
                    const files: File[] = [];
                    for (const [index, name] of names.entries()) {
                        const bytes = await invoke<ArrayBuffer>('read_clipboard_file', { index, name });
                        const type = ({ png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' } as Record<string, string>)[name.split('.').pop()?.toLowerCase() || ''] || 'application/octet-stream';
                        files.push(new File([bytes], name, { type }));
                    }
                    await insertNoteFiles(editor, files);
                }).catch(report);
                return false;
            },
            handlePaste: (_view, event) => {
                const files = Array.from(event.clipboardData?.files || []);
                if (!files.length) {
                    const html = event.clipboardData?.getData('text/html') || '';
                    if (!isTauri() || !/data:[^,]*;base64,/i.test(html)) return false;
                    event.preventDefault();
                    filePaste++;
                    void externalizeAttachments(html).then(content => {
                        if (!editor.isDestroyed) editor.chain().focus().insertContent(content).run();
                    }).catch(report);
                    return true;
                }
                filePaste++;
                event.preventDefault();
                void insertNoteFiles(editor, files);
                return true;
            },
            handleDrop: (view, event, _slice, moved) => {
                if (moved) return false;
                const files = Array.from(event.dataTransfer?.files || []);
                if (!files.length) return false;
                event.preventDefault();
                const position = view.posAtCoords({ left: event.clientX, top: event.clientY });
                if (position) editor.commands.setTextSelection(position.pos);
                void insertNoteFiles(editor, files);
                return true;
            },
        } })];
    },
});
