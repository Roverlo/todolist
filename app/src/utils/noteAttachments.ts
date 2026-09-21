import { invoke, isTauri } from '@tauri-apps/api/core';
import type { Note } from '../types';

const ATTACHMENT_URL = 'http://attachment.localhost/';
const ID_PATTERN = /^[a-f0-9]{64}\.[a-z0-9]{1,16}$/;

export function attachmentId(source: string): string | null {
    const id = source.startsWith(ATTACHMENT_URL) ? source.slice(ATTACHMENT_URL.length) : '';
    return ID_PATTERN.test(id) ? id : null;
}

export function fileDataURL(file: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('文件读取失败'));
        reader.onerror = () => reject(new Error('文件读取失败，请重试'));
        reader.onabort = () => reject(new Error('文件读取已取消'));
        reader.readAsDataURL(file);
    });
}

export async function storeAttachment(file: File): Promise<string> {
    if (!isTauri()) return fileDataURL(file);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
    const extension = file.name.split('.').pop()?.toLowerCase() || '';
    const id = `${hash}.${/^[a-z0-9]{1,16}$/.test(extension) ? extension : 'bin'}`;
    await invoke('write_attachment', bytes, { headers: { 'x-attachment-id': id } });
    return ATTACHMENT_URL + id;
}

export async function attachmentBlob(source: string, type = 'application/octet-stream'): Promise<Blob> {
    const id = attachmentId(source);
    if (id) {
        if (!isTauri()) throw new Error('此附件仅在原电脑上可用，请在 EXE 版导出包含附件的备份后再迁移');
        const bytes = await invoke<ArrayBuffer>('read_attachment', { id });
        return new Blob([bytes], { type });
    }
    if (!/^data:[^,]*;base64,/i.test(source)) throw new Error('附件地址无效，请重新插入');
    return (await fetch(source)).blob();
}

export async function saveAttachment(source: string, name: string, type?: string) {
    const blob = await attachmentBlob(source, type);
    if (isTauri()) {
        const { save } = await import('@tauri-apps/plugin-dialog');
        const { writeFile } = await import('@tauri-apps/plugin-fs');
        const path = await save({ defaultPath: name.replace(/[\\/:*?"<>|]/g, '_') });
        if (path) await writeFile(path, new Uint8Array(await blob.arrayBuffer()));
    } else {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = name;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
}

export async function openAttachmentFolder(source?: string) {
    if (!isTauri()) throw new Error('网页预览的附件保存在浏览器中；EXE 版可以打开本机附件文件夹');
    const id = source && attachmentId(source);
    if (id) await invoke('reveal_attachment', { id });
    else await invoke('open_data_directory', { subdirectory: 'attachments' });
}

const imageTypes: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' };

// Transfer formats remain self-contained. Regular saves only contain short local references.
export async function embedAttachments(html: string): Promise<string> {
    if (!html.includes(ATTACHMENT_URL)) return html;
    const document = new DOMParser().parseFromString(html, 'text/html');
    const cache = new Map<string, string>();
    for (const element of document.querySelectorAll('img[src], a[data-type="attachment"][href]')) {
        const attribute = element.tagName === 'IMG' ? 'src' : 'href';
        const source = element.getAttribute(attribute) || '';
        const id = attachmentId(source);
        if (!id) continue;
        let embedded = cache.get(source);
        if (!embedded) {
            const type = element.getAttribute('data-mime') || imageTypes[id.split('.').pop()!] || 'application/octet-stream';
            embedded = await fileDataURL(await attachmentBlob(source, type));
            cache.set(source, embedded);
        }
        element.setAttribute(attribute, embedded);
    }
    return document.body.innerHTML;
}

export async function externalizeAttachments(html: string): Promise<string> {
    if (!isTauri() || !html.includes('data:')) return html;
    const document = new DOMParser().parseFromString(html, 'text/html');
    let changed = false;
    for (const element of document.querySelectorAll('img[src], a[data-type="attachment"][href]')) {
        const attribute = element.tagName === 'IMG' ? 'src' : 'href';
        const source = element.getAttribute(attribute) || '';
        if (!/^data:[^,]*;base64,/i.test(source)) continue;
        const blob = await attachmentBlob(source);
        if (element.tagName === 'IMG' && !Object.values(imageTypes).includes(blob.type)) continue;
        const extension = Object.entries(imageTypes).find(([, type]) => type === blob.type)?.[0] || 'bin';
        const name = element.tagName === 'IMG' ? `image.${extension}` : element.getAttribute('download') || `attachment.${extension}`;
        element.setAttribute(attribute, await storeAttachment(new File([blob], name, { type: blob.type })));
        changed = true;
    }
    return changed ? document.body.innerHTML : html;
}

export async function transferNotes(notes: Note[], direction: 'export' | 'import'): Promise<Note[]> {
    const result: Note[] = [];
    for (const note of notes) result.push({ ...note, content: await (direction === 'export' ? embedAttachments : externalizeAttachments)(note.content) });
    return result;
}

export async function migrateStoredAttachments(value: string): Promise<string> {
    if (!isTauri() || !value.includes('data:image/')) return value;
    const data = JSON.parse(value);
    if (!Array.isArray(data.state?.notes)) return value;
    await invoke('backup_before_attachment_migration');
    data.state.notes = await transferNotes(data.state.notes, 'import');
    return JSON.stringify(data);
}
