import { query } from '../../db/index.js';
import { logFinancialAction } from '../../db/budgetDb.js';
import { generateVision } from './gateway.js';

export interface ReceiptExtractionResult {
  vendor_name: string | null;
  amount: number | null;
  currency: string | null;
  date: string | null;
  category: string | null;
  line_items: Array<{ description: string; amount: number }>;
  confidence: number;
  raw_extraction: Record<string, unknown>;
}

const EXTRACTION_PROMPT = `You are a financial document analysis AI. Extract structured data from this receipt/invoice image.

Return ONLY valid JSON (no markdown, no explanation) with this exact schema:
{
  "vendor_name": "string or null",
  "amount": number or null (total amount),
  "currency": "3-letter ISO code or null",
  "date": "YYYY-MM-DD or null",
  "category": "one of: travel, meals, office_supplies, software, equipment, transportation, accommodation, communication, training, entertainment, medical, other",
  "line_items": [{"description": "string", "amount": number}],
  "confidence_signals": {
    "amount_clearly_visible": true/false,
    "vendor_clearly_identifiable": true/false,
    "date_clearly_readable": true/false,
    "is_receipt_or_invoice": true/false,
    "image_quality": "good/fair/poor"
  }
}

Rules:
- If a field is unclear or not visible, set it to null
- Amount should be the TOTAL/GRAND TOTAL, not subtotals
- Category should be your best guess based on the vendor and items
- Be honest about confidence_signals — they determine if auto-approval is safe`;

function parseReceiptJson(text: string): ReceiptExtractionResult {
  let cleaned = text.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
  }
  const parsed = JSON.parse(cleaned);
  const confidence = computeConfidence(parsed.confidence_signals || {});
  return {
    vendor_name: parsed.vendor_name ?? null,
    amount: parsed.amount ?? null,
    currency: parsed.currency ?? null,
    date: parsed.date ?? null,
    category: parsed.category ?? null,
    line_items: Array.isArray(parsed.line_items) ? parsed.line_items : [],
    confidence,
    raw_extraction: parsed,
  };
}

const emptyResult = (): ReceiptExtractionResult => ({
  vendor_name: null, amount: null, currency: null, date: null,
  category: null, line_items: [], confidence: 0, raw_extraction: {},
});

export async function extractReceiptData(
  imageBase64: string,
  mediaType: string,
  options?: { tenantId?: string },
): Promise<ReceiptExtractionResult> {
  const tenantId = options?.tenantId ?? 'system';

  try {
    const text = await generateVision({
      imageBase64,
      mediaType,
      prompt: EXTRACTION_PROMPT,
      tenantId,
      maxTokens: 2048,
    });
    try {
      return parseReceiptJson(text);
    } catch {
      return { ...emptyResult(), raw_extraction: { raw_text: text } };
    }
  } catch {
    return emptyResult();
  }
}

function computeConfidence(signals: Record<string, unknown>): number {
  let score = 0;
  let factors = 0;

  if (signals.is_receipt_or_invoice === true) { score += 0.25; }
  factors += 0.25;

  if (signals.amount_clearly_visible === true) { score += 0.25; }
  factors += 0.25;

  if (signals.vendor_clearly_identifiable === true) { score += 0.2; }
  factors += 0.2;

  if (signals.date_clearly_readable === true) { score += 0.15; }
  factors += 0.15;

  const quality = signals.image_quality as string;
  if (quality === 'good') score += 0.15;
  else if (quality === 'fair') score += 0.08;
  factors += 0.15;

  return Math.round((score / factors) * 100) / 100;
}

export async function applyExtractionToReimbursement(
  reimbursementId: string,
  extraction: ReceiptExtractionResult,
): Promise<void> {
  const setClauses: string[] = [
    'ai_confidence_score = $1',
    'ai_extracted_data = $2',
    'ai_categorized_at = NOW()',
  ];
  const values: unknown[] = [
    extraction.confidence,
    JSON.stringify(extraction.raw_extraction),
  ];

  let idx = 3;

  if (extraction.category && extraction.confidence >= 0.85) {
    const catResult = await query<{ id: string }>(
      `SELECT id FROM expense_categories WHERE LOWER(name) = LOWER($1) LIMIT 1`,
      [extraction.category],
    );
    if (catResult.rows[0]) {
      setClauses.push(`category_id = $${idx++}`);
      values.push(catResult.rows[0].id);
    }
  }

  values.push(reimbursementId);

  await query(
    `UPDATE reimbursement_requests SET ${setClauses.join(', ')} WHERE id = $${idx}`,
    values,
  );

  await logFinancialAction({
    actionType: 'receipt_extraction',
    relatedEntityType: 'reimbursement_request',
    relatedEntityId: reimbursementId,
    reasoning: `AI extracted receipt data: vendor=${extraction.vendor_name}, amount=${extraction.amount} ${extraction.currency}, confidence=${extraction.confidence}`,
    confidence: extraction.confidence,
    metadata: {
      vendor: extraction.vendor_name,
      amount: extraction.amount,
      currency: extraction.currency,
      category: extraction.category,
      auto_categorized: extraction.confidence >= 0.85,
    },
  });
}
