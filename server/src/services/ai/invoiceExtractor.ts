import dotenv from 'dotenv';
import { existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import Anthropic from '@anthropic-ai/sdk';

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

const anthropicClient = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;

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

async function extractWithAnthropic(
  imageBase64: string,
  mediaType: string,
): Promise<InvoiceExtractionResult> {
  if (!anthropicClient) {
    throw new Error('Anthropic API key not configured');
  }

  const isPdf = mediaType === 'application/pdf';
  const contentBlock = isPdf
    ? { type: 'document' as const, source: { type: 'base64' as const, media_type: 'application/pdf' as const, data: imageBase64 } }
    : { type: 'image' as const, source: { type: 'base64' as const, media_type: mediaType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp', data: imageBase64 } };

  const content: Array<{ type: 'text'; text: string } | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } } | { type: 'document'; source: { type: 'base64'; media_type: string; data: string } }> = [
    contentBlock,
    { type: 'text', text: INVOICE_EXTRACTION_PROMPT },
  ];
  const response = await anthropicClient.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 4096,
    messages: [{
      role: 'user',
      content: content as any,
    }],
  });

  const text = response.content?.[0]?.type === 'text' ? response.content[0].text : '';
  return parseExtractionJson(text);
}

async function extractWithGroq(
  imageBase64: string,
  mediaType: string,
): Promise<InvoiceExtractionResult> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('Groq API key not configured');
  if (mediaType === 'application/pdf') {
    throw new Error(
      'PDF scanning requires Anthropic API. Add ANTHROPIC_API_KEY to your server .env, or upload a JPG/PNG image instead.',
    );
  }

  const dataUrl = `data:${mediaType};base64,${imageBase64}`;

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'meta-llama/llama-4-scout-17b-16e-instruct',
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: dataUrl } },
          { type: 'text', text: INVOICE_EXTRACTION_PROMPT },
        ],
      }],
    }),
  });

  const json = await res.json() as { error?: { message?: string }; choices?: Array<{ message?: { content?: string } }> };
  if (!res.ok || json.error) {
    throw new Error(json.error?.message || `Groq API error: ${res.status}`);
  }

  const text = json.choices?.[0]?.message?.content || '';
  return parseExtractionJson(text);
}

export async function extractInvoiceData(
  imageBase64: string,
  mediaType: string,
): Promise<InvoiceExtractionResult> {
  // Try Anthropic first (best quality, supports PDFs)
  if (anthropicClient) {
    try {
      return await extractWithAnthropic(imageBase64, mediaType);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const isCreditsError = msg.includes('credit balance is too low') || msg.includes('insufficient_quota') || msg.includes('billing');
      const isAuthError = msg.includes('invalid x-api-key') || msg.includes('authentication_error');

      if (isCreditsError || isAuthError) {
        console.warn(`[invoiceExtractor] Anthropic unavailable (${isCreditsError ? 'credits' : 'auth'}), falling back to Groq vision...`);
        if (mediaType !== 'application/pdf') {
          return await extractWithGroq(imageBase64, mediaType);
        }
        throw new Error(
          isCreditsError
            ? 'AI scanning requires active Anthropic API credits. PDF scanning needs Anthropic — please top up your account at console.anthropic.com, or upload a JPG/PNG image instead.'
            : 'Anthropic API key is invalid. Please check server configuration.',
        );
      }

      // Other API errors (model not found, overloaded, etc.) — try Groq fallback for images
      if (mediaType !== 'application/pdf') {
        console.warn(`[invoiceExtractor] Anthropic error: ${msg}. Trying Groq fallback...`);
        try {
          return await extractWithGroq(imageBase64, mediaType);
        } catch (groqErr) {
          console.error('[invoiceExtractor] Groq fallback also failed:', groqErr instanceof Error ? groqErr.message : groqErr);
        }
      }
      throw new Error(`Invoice scanning failed: ${msg}`);
    }
  }

  // No Anthropic client — go straight to Groq
  return await extractWithGroq(imageBase64, mediaType);
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
