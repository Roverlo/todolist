import { openAttachmentFolder, storeAttachment } from './noteAttachments';

export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

export async function readNoteImage(file: File): Promise<string> {
    if (!IMAGE_TYPES.includes(file.type)) throw new Error('请选择 PNG、JPEG、WebP 或 GIF 图片；其他格式可通过“插入附件”保存');
    if (!file.size) throw new Error('图片文件为空，请重新选择');
    const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    const valid = file.type === 'image/png' ? bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71
        : file.type === 'image/jpeg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
        : file.type === 'image/gif' ? new TextDecoder().decode(bytes.slice(0, 6)).match(/^GIF8[79]a$/)
        : new TextDecoder().decode(bytes.slice(0, 4)) === 'RIFF' && new TextDecoder().decode(bytes.slice(8, 12)) === 'WEBP';
    if (!valid) throw new Error('图片文件内容与格式不符，请重新选择');
    const extension = file.type === 'image/jpeg' ? 'jpg' : file.type.split('/')[1];
    return storeAttachment(new File([file], `image.${extension}`, { type: file.type }));
}

export const openNoteImageFolder = openAttachmentFolder;
