import { getDocumentById } from '../db/knowledgeV2Db.js';

export async function generateDocumentPDF(documentId: string): Promise<Buffer | null> {
  const doc = await getDocumentById(documentId);
  if (!doc) return null;

  try {
    const puppeteer = await import('puppeteer');
    const browser = await puppeteer.default.launch({ headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 800px; margin: 0 auto; padding: 40px; color: #1a1a1a; }
          h1 { font-size: 28px; margin-bottom: 8px; }
          .meta { color: #666; font-size: 14px; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 1px solid #e5e7eb; }
          .content { line-height: 1.7; font-size: 15px; }
          .content h2 { margin-top: 24px; }
          .content p { margin: 8px 0; }
          .content code { background: #f3f4f6; padding: 2px 6px; border-radius: 4px; font-size: 13px; }
          .content pre { background: #f3f4f6; padding: 16px; border-radius: 8px; overflow-x: auto; }
          .content blockquote { border-left: 3px solid #3b82f6; padding-left: 16px; margin: 16px 0; color: #4b5563; }
          .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #9ca3af; text-align: center; }
        </style>
      </head>
      <body>
        <h1>${doc.title}</h1>
        <div class="meta">
          By ${doc.author_name} · ${new Date(doc.updated_at).toLocaleDateString()} · ${doc.document_type}
        </div>
        <div class="content">${doc.plain_text?.replace(/\n/g, '<br>') ?? ''}</div>
        <div class="footer">Messign Knowledge Hub · Exported ${new Date().toLocaleDateString()}</div>
      </body>
      </html>
    `;

    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdf = await page.pdf({ format: 'A4', margin: { top: '20mm', right: '20mm', bottom: '20mm', left: '20mm' } });
    await browser.close();
    return Buffer.from(pdf);
  } catch (e) {
    console.error('[kh-pdf] Generation failed:', e);
    return null;
  }
}
