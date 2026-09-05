import { invoke, isTauri } from '@tauri-apps/api/core';
import { join } from '@tauri-apps/api/path';
import { exists, mkdir, writeFile } from '@tauri-apps/plugin-fs';

export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

export async function readNoteImage(file: File): Promise<string> {
    if (!IMAGE_TYPES.includes(file.type)) throw new Error('请选择 PNG、JPEG、WebP 或 GIF 图片');
    if (!file.size || file.size > MAX_IMAGE_BYTES) throw new Error('请选择 2 MB 以内的图片');
    const bytes = new Uint8Array(await file.arrayBuffer());
    const valid = file.type === 'image/png' ? bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71
        : file.type === 'image/jpeg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
        : file.type === 'image/gif' ? new TextDecoder().decode(bytes.slice(0, 6)).match(/^GIF8[79]a$/)
        : new TextDecoder().decode(bytes.slice(0, 4)) === 'RIFF' && new TextDecoder().decode(bytes.slice(8, 12)) === 'WEBP';
    if (!valid) throw new Error('图片文件内容与格式不符，请重新选择');

    const embedded = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('图片读取失败'));
        reader.onerror = () => reject(new Error('图片读取失败，请重试'));
        reader.onabort = () => reject(new Error('图片读取已取消'));
        reader.readAsDataURL(file);
    });

    if (isTauri()) {
        const directory = await join(await invoke<string>('get_data_directory'), 'images');
        await mkdir(directory, { recursive: true });
        const digest = await crypto.subtle.digest('SHA-256', bytes);
        const name = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
        const path = await join(directory, `${name}.${file.type.split('/')[1]}`);
        if (!await exists(path)) await writeFile(path, bytes);
    }
    // Keep an embedded copy so backups, exports and existing notes remain self-contained.
    return embedded;
}

export async function openNoteImageFolder(embeddedImage?: string) {
    if (!isTauri()) throw new Error('网页预览的图片保存在当前浏览器中；免安装 EXE 版可以打开本机图片文件夹。');
    // Older images are embedded only. Materialize the selected image on demand too.
    if (embeddedImage?.startsWith('data:image/')) {
        const response = await fetch(embeddedImage);
        const blob = await response.blob();
        await readNoteImage(new File([blob], 'image', { type: blob.type }));
    }
    await invoke('open_data_directory', { subdirectory: 'images' });
}
