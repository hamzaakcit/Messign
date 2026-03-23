import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { resolve, extname } from 'path';

const UPLOAD_BASE = resolve(process.env.UPLOAD_DIR || resolve(process.cwd(), 'uploads'));

function resolveFilePath(uploadUrl: string): string {
  const cleaned = uploadUrl.replace(/^\/uploads\//, '');
  const resolved = resolve(UPLOAD_BASE, cleaned);
  if (!resolved.startsWith(UPLOAD_BASE)) {
    throw new Error('Path traversal detected');
  }
  return resolved;
}

const SUPPORTED_EXTENSIONS = new Set([
  '.pdf', '.pptx', '.docx', '.xlsx',
  '.txt', '.csv', '.md', '.json', '.xml', '.html', '.htm', '.log', '.rtf',
]);

export function isExtractable(fileName: string): boolean {
  return SUPPORTED_EXTENSIONS.has(extname(fileName).toLowerCase());
}

async function extractPdf(buffer: Buffer): Promise<string> {
  const pdfParse = (await import('pdf-parse')).default;
  const data = await pdfParse(buffer);
  return data.text?.trim() ?? '';
}

async function extractPptx(filePath: string): Promise<string> {
  const AdmZip = (await import('adm-zip')).default;
  const zip = new AdmZip(filePath);
  const entries = zip.getEntries();
  let text = '';
  const slideEntries = entries
    .filter((e: { entryName: string }) => /ppt\/slides\/slide\d+\.xml/.test(e.entryName))
    .sort((a: { entryName: string }, b: { entryName: string }) => {
      const numA = parseInt(a.entryName.match(/slide(\d+)/)?.[1] ?? '0');
      const numB = parseInt(b.entryName.match(/slide(\d+)/)?.[1] ?? '0');
      return numA - numB;
    });

  for (const entry of slideEntries) {
    const xml = entry.getData().toString('utf-8');
    const matches = xml.match(/<a:t>([^<]*)<\/a:t>/g) || [];
    const slideText = matches.map((m: string) => m.replace(/<\/?a:t>/g, '')).join(' ');
    if (slideText.trim()) text += slideText.trim() + '\n\n';
  }
  return text.trim();
}

async function extractDocx(filePath: string): Promise<string> {
  const mammoth = await import('mammoth');
  const result = await mammoth.extractRawText({ path: filePath });
  return result.value?.trim() ?? '';
}

async function extractXlsx(filePath: string): Promise<string> {
  const XLSX = await import('xlsx');
  const workbook = XLSX.readFile(filePath);
  let text = '';
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const csv = XLSX.utils.sheet_to_csv(sheet);
    if (csv.trim()) text += `Sheet: ${sheetName}\n${csv.trim()}\n\n`;
  }
  return text.trim();
}

function extractPlainText(buffer: Buffer): string {
  return buffer.toString('utf-8').trim();
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

export async function extractTextFromFile(filePath: string): Promise<string> {
  if (!existsSync(filePath)) {
    console.warn('[extract] File not found:', filePath);
    return '';
  }

  const ext = extname(filePath).toLowerCase();

  try {
    switch (ext) {
      case '.pdf':
        return await extractPdf(await readFile(filePath));
      case '.pptx':
        return await extractPptx(filePath);
      case '.docx':
        return await extractDocx(filePath);
      case '.xlsx':
        return await extractXlsx(filePath);
      case '.html':
      case '.htm':
        return stripHtml(await readFile(filePath, 'utf-8'));
      case '.txt': case '.csv': case '.md': case '.json':
      case '.xml': case '.log': case '.rtf':
        return extractPlainText(await readFile(filePath));
      default:
        console.warn('[extract] Unsupported format:', ext);
        return '';
    }
  } catch (e) {
    console.error('[extract] Failed for', filePath, e);
    return '';
  }
}

export async function extractTextFromUploadUrl(uploadUrl: string): Promise<string> {
  const ext = extname(uploadUrl).toLowerCase();
  if (!SUPPORTED_EXTENSIONS.has(ext)) return '';
  const filePath = resolveFilePath(uploadUrl);
  return extractTextFromFile(filePath);
}

interface Attachment { url: string; fileName: string; }

export async function extractTextFromAttachments(attachments: Attachment[]): Promise<string> {
  if (!attachments?.length) return '';

  const texts = await Promise.all(
    attachments
      .filter(a => isExtractable(a.fileName || a.url))
      .map(a => extractTextFromUploadUrl(a.url))
  );

  return texts.filter(Boolean).join('\n\n---\n\n');
}
