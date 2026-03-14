import dotenv from 'dotenv';
import { existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import { generateVision } from './gateway.js';

// Ensure .env is loaded (works when invoiceExtractor is imported before main index dotenv)
const __dirname = dirname(fileURLToPath(import.meta.url));
const serverEnv = join(__dirname, '..', '..', '..', '.env');
if (existsSync(serverEnv)) dotenv.config({ path: serverEnv });

export interface InvoiceExtractionResult {
  vendor_name: string | null;
  vendor_email: string | null;
  vendor_address: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  due_date: string | null;
  currency: string | null;
  payment_terms: string | null;
  line_items: Array<{
    description: string;
    quantity: number;
    unit_price: number;
    tax_rate: number;
  }>;
  subtotal: number | null;
  tax_total: number | null;
  discount_pct: number | null;
  grand_total: number | null;
  notes: string | null;
  payment_instructions: string | null;
  confidence: number;
  raw_extraction: Record<string, unknown>;
}

const INVOICE_EXTRACTION_PROMPT = `You are a financial document analysis AI specialized in invoice processing. Extract structured data from this invoice image.

Return ONLY valid JSON (no markdown, no explanation) with this exact schema:
{
  "vendor_name": "string or null (the company/person who SENT the invoice)",
  "vendor_email": "string or null",
  "vendor_address": "string or null (full address on one line)",
  "invoice_number": "string or null (the invoice/reference number on the document)",
  "invoice_date": "YYYY-MM-DD or null (issue date)",
  "due_date": "YYYY-MM-DD or null",
  "currency": "3-letter ISO code or null",
  "payment_terms": "string or null (e.g. 'Net 30', 'Due on Receipt')",
  "line_items": [
    {
      "description": "string",
      "quantity": number (default 1 if not specified),
      "unit_price": number,
      "tax_rate": number (percentage, e.g. 20 for 20%. 0 if not specified)
    }
  ],
  "subtotal": number or null,
  "tax_total": number or null,
  "discount_pct": number or null (percentage, e.g. 10 for 10%),
  "grand_total": number or null,
  "notes": "string or null (any terms, conditions, or notes on the invoice)",
  "payment_instructions": "string or null (bank details, payment methods, account numbers)",
  "confidence_signals": {
    "is_invoice": true/false,
    "vendor_clearly_identifiable": true/false,
    "line_items_clearly_readable": true/false,
    "amounts_clearly_visible": true/false,
    "dates_clearly_readable": true/false,
    "image_quality": "good/fair/poor"
  }
}

Rules:
- If a field is unclear or not visible, set it to null
- For line items, extract each distinct item/service separately
- If quantities are not shown, default to 1
- unit_price should be the price PER UNIT (not the line total)
- tax_rate should be a percentage number (e.g. 20 for 20%), not a decimal
- grand_total should be the final amount due
- payment_instructions should capture any bank/wire/payment details
- Be honest about confidence_signals`;

function parseExtractionJson(text: string): InvoiceExtractionResult {
  let cleaned = text.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
  }
  const parsed = JSON.parse(cleaned);
  const confidence = computeConfidence(parsed.confidence_signals || {});

  const lineItems = Array.isArray(parsed.line_items)
    ? parsed.line_items
        .filter((li: Record<string, unknown>) => li.description || li.unit_price)
        .map((li: Record<string, unknown>) => ({
          description: String(li.description || 'Service'),
          quantity: Number(li.quantity) || 1,
          unit_price: Number(li.unit_price) || 0,
          tax_rate: Number(li.tax_rate) || 0,
        }))
    : [];

  // Fallback: if no line items found but grand_total exists, create a placeholder
  if (lineItems.length === 0 && parsed.grand_total != null && Number(parsed.grand_total) > 0) {
    lineItems.push({
      description: parsed.vendor_name ? `Services from ${parsed.vendor_name}` : 'Services',
      quantity: 1,
      unit_price: Number(parsed.grand_total),
      tax_rate: 0,
    });
  }

  return {
    vendor_name: parsed.vendor_name ?? null,
    vendor_email: parsed.vendor_email ?? null,
    vendor_address: parsed.vendor_address ?? null,
    invoice_number: parsed.invoice_number ?? null,
    invoice_date: parsed.invoice_date ?? null,
    due_date: parsed.due_date ?? null,
    currency: parsed.currency ?? null,
    payment_terms: parsed.payment_terms ?? null,
    line_items: lineItems,
    subtotal: parsed.subtotal != null ? Number(parsed.subtotal) : null,
    tax_total: parsed.tax_total != null ? Number(parsed.tax_total) : null,
    discount_pct: parsed.discount_pct != null ? Number(parsed.discount_pct) : null,
    grand_total: parsed.grand_total != null ? Number(parsed.grand_total) : null,
    notes: parsed.notes ?? null,
    payment_instructions: parsed.payment_instructions ?? null,
    confidence,
    raw_extraction: parsed,
  };
}

export async function extractInvoiceData(
  imageBase64: string,
  mediaType: string,
  options?: { tenantId?: string },
): Promise<InvoiceExtractionResult> {
  const tenantId = options?.tenantId ?? 'system';

  try {
    const text = await generateVision({
      imageBase64,
      mediaType,
      prompt: INVOICE_EXTRACTION_PROMPT,
      tenantId,
      maxTokens: 4096,
    });
    return parseExtractionJson(text);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Invoice scanning failed: ${msg}`);
  }
}

function computeConfidence(signals: Record<string, unknown>): number {
  let score = 0;
  const factors = 1.0;

  if (signals.is_invoice === true) score += 0.2;
  if (signals.vendor_clearly_identifiable === true) score += 0.2;
  if (signals.line_items_clearly_readable === true) score += 0.2;
  if (signals.amounts_clearly_visible === true) score += 0.2;
  if (signals.dates_clearly_readable === true) score += 0.1;
  const quality = signals.image_quality as string;
  if (quality === 'good') score += 0.1;
  else if (quality === 'fair') score += 0.05;

  return Math.round((score / factors) * 100) / 100;
}
