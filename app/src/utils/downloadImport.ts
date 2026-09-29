import Papa from 'papaparse';
import type JSZip from 'jszip';

export const MAX_DOWNLOAD_LINKS = 500;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_TEXT_LENGTH = 1024 * 1024;

export function extractDownloadLinks(text: string) {
  if (text.length > MAX_TEXT_LENGTH) throw new Error('链接内容过长，请分批导入');
  const urls: string[] = [], seen = new Set<string>();
  let duplicates = 0, invalid = 0;
  for (const match of text.matchAll(/https?:\/\/[^\s<>"'“”‘’，。；、【】（）《》〈〉「」『』！？]+/giu)) {
    // Split punctuation BETWEEN URLs, never a comma/semicolon inside a signed query.
    const pieces = match[0].split(/[,;|]+(?=https?:\/\/)/i);
    for (let url of pieces) {
      if (url.length > 16384) { invalid++; continue; }
      if (!url.includes('?') || /^\s*https?:\/\//i.test(text.slice(match.index + match[0].length))) url = url.replace(/[,;|]+$/, '');
      for (const [open, close] of [['(', ')'], ['[', ']'], ['{', '}']]) {
        let unmatched = url.split(close).length - url.split(open).length;
        while (unmatched-- > 0 && url.endsWith(close)) url = url.slice(0, -1);
      }
      try {
        const parsed = new URL(url);
        if (!parsed.hostname || parsed.username || parsed.password) throw new Error();
      } catch { invalid++; continue; }
      // Preserve signed query strings exactly; URL.toString() can re-encode them.
      if (seen.has(url)) { duplicates++; continue; }
      seen.add(url); urls.push(url);
      if (urls.length > MAX_DOWNLOAD_LINKS) throw new Error(`一次最多添加 ${MAX_DOWNLOAD_LINKS} 个链接，请分批导入`);
    }
  }
  return { urls, duplicates, invalid };
}

function decodeText(bytes: ArrayBuffer) {
  const prefix = new Uint8Array(bytes, 0, Math.min(2, bytes.byteLength));
  if (prefix[0] === 255 && prefix[1] === 254) return new TextDecoder('utf-16le').decode(bytes);
  if (prefix[0] === 254 && prefix[1] === 255) return new TextDecoder('utf-16be').decode(bytes);
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { return new TextDecoder('gb18030').decode(bytes); }
}

function parseXml(text: string) {
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new Error('此 Excel 文件包含不支持的 XML 内容');
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('Excel 文件内容损坏，无法读取');
  return doc;
}
const elements = (node: Document | Element, name: string) => Array.from(node.getElementsByTagNameNS('*', name));
const textRuns = (node: Element) => elements(node, 't').map(t => t.textContent || '').join('');

async function readXlsx(bytes: ArrayBuffer) {
  // JSZip is already in the locked production tree through docx. Only load it for XLSX.
  const { default: Zip } = await import('jszip');
  const zip = await Zip.loadAsync(bytes);
  if (!zip.file('xl/workbook.xml')) throw new Error('文件不是有效的 .xlsx 工作簿');
  if (Object.keys(zip.files).length > 2048) throw new Error('Excel 文件过于复杂，请另存为 CSV 后导入');
  let remaining = 20 * 1024 * 1024;
  async function xml(name: string) {
    const entry = zip.file(name);
    if (!entry) return null;
    // Documented JSZip streaming API (missing from its bundled ZipObject types).
    const stream = (entry as JSZip.JSZipObject & { internalStream(type: 'uint8array'): JSZip.JSZipStreamHelper<Uint8Array> }).internalStream('uint8array');
    const chunks: Uint8Array[] = [];
    let length = 0;
    await new Promise<void>((resolve, reject) => {
      stream.on('data', chunk => {
        remaining -= chunk.length;
        if (remaining < 0) { stream.pause(); reject(new Error('Excel 解压内容过大，请拆分文件或另存为 CSV')); return; }
        chunks.push(chunk); length += chunk.length;
      }).on('error', reject).on('end', resolve).resume();
    });
    const content = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { content.set(chunk, offset); offset += chunk.length; }
    return parseXml(new TextDecoder().decode(content));
  }
  const sharedDoc = await xml('xl/sharedStrings.xml');
  const shared = sharedDoc ? elements(sharedDoc, 'si').map(textRuns) : [];
  const urls: string[] = [];
  const append = (text: string) => {
    urls.push(...extractDownloadLinks(text).urls);
    if (urls.length > MAX_DOWNLOAD_LINKS * 10) throw new Error('Excel 中链接过多，请分批导入');
  };
  for (const name of Object.keys(zip.files).filter(n => /^xl\/worksheets\/[^/]+\.xml$/.test(n))) {
    const sheet = await xml(name);
    if (!sheet) continue;
    for (const cell of elements(sheet, 'c')) {
      const value = elements(cell, 'v')[0]?.textContent || '';
      append(cell.getAttribute('t') === 's' ? shared[Number(value)] || '' : cell.getAttribute('t') === 'inlineStr' ? textRuns(cell) : value);
      const formula = elements(cell, 'f')[0]?.textContent || '';
      const link = formula.match(/^\s*(?:_xlfn\.)?HYPERLINK\s*\(\s*"((?:[^"]|"")*)"/i);
      if (link) append(link[1].replaceAll('""', '"'));
    }
    const refs = new Set(elements(sheet, 'hyperlink').map(link => Array.from(link.attributes).find(a => a.localName === 'id')?.value));
    const relationships = await xml(name.replace(/([^/]+)$/, '_rels/$1.rels'));
    if (relationships) for (const rel of elements(relationships, 'Relationship')) {
      if (refs.has(rel.getAttribute('Id') || '') && rel.getAttribute('Type')?.endsWith('/hyperlink')) append(rel.getAttribute('Target') || '');
    }
  }
  return extractDownloadLinks(urls.join('\n')).urls;
}

export async function importDownloadFile(file: File): Promise<string[]> {
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (!['txt', 'csv', 'tsv', 'xlsx'].includes(extension || '')) throw new Error('支持 TXT、CSV、TSV 和 Excel .xlsx；旧版 .xls 请另存为 .xlsx 或 .csv');
  if (file.size > MAX_FILE_BYTES) throw new Error('单个文件不能超过 10 MiB，请拆分后导入');
  const bytes = await file.arrayBuffer();
  let urls: string[];
  if (extension === 'xlsx') {
    try { urls = await readXlsx(bytes); }
    catch (error) { throw new Error(error instanceof Error && /Excel|xlsx/.test(error.message) ? error.message : 'Excel 文件无法读取，请确认文件未损坏或加密'); }
  } else {
    let text = decodeText(bytes);
    if (extension !== 'txt') {
      const result = Papa.parse<string[]>(text, { delimiter: extension === 'tsv' ? '\t' : ',', skipEmptyLines: true });
      if (result.errors.length) throw new Error('表格文本格式有误，请检查引号或另存为 TXT');
      text = result.data.flat().join('\n');
    }
    urls = extractDownloadLinks(text).urls;
  }
  if (!urls.length) throw new Error('文件中未找到 HTTP / HTTPS 链接');
  return urls;
}
