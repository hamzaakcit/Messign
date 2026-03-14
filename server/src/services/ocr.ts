import { generateVision } from './ai/gateway.js';

export interface OCRExtract {
  vendor_name?: string;
  amount?: number;
  currency?: string;
  date?: string;
  line_items?: unknown[];
}

const OCR_PROMPT = `Extract the following from this receipt or invoice. Respond with valid JSON only, no markdown or explanation.
{
  "vendor_name": "Business or vendor name",
  "amount": number (total amount only),
  "currency": "USD or EUR or TRY etc",
  "date": "YYYY-MM-DD",
  "line_items": [] // optional array of item descriptions if visible
}`;

export async function processReceiptOCR(
  imageBase64: string,
  mediaType: string,
  options?: { tenantId?: string },
): Promise<OCRExtract> {
  const tenantId = options?.tenantId ?? 'system';

  try {
    const text = await generateVision({
      imageBase64,
      mediaType,
      prompt: OCR_PROMPT,
      tenantId,
      maxTokens: 1024,
    });
    const parsed = JSON.parse(text.trim()) as OCRExtract;
    return parsed;
  } catch {
    return {};
  }
}
