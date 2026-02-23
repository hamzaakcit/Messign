import Anthropic from '@anthropic-ai/sdk';

export interface OCRExtract {
  vendor_name?: string;
  amount?: number;
  currency?: string;
  date?: string;
  line_items?: unknown[];
}

const client = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;

export async function processReceiptOCR(imageBase64: string, mediaType: string): Promise<OCRExtract> {
  if (!client) {
    return {};
  }
  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: mediaType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
              data: imageBase64,
            },
          },
          {
            type: 'text',
            text: `Extract the following from this receipt or invoice. Respond with valid JSON only, no markdown or explanation.
{
  "vendor_name": "Business or vendor name",
  "amount": number (total amount only),
  "currency": "USD or EUR or TRY etc",
  "date": "YYYY-MM-DD",
  "line_items": [] // optional array of item descriptions if visible
}`,
          },
        ],
      },
    ],
  });
  const text = response.content?.[0]?.type === 'text' ? response.content[0].text : '';
  try {
    const parsed = JSON.parse(text.trim()) as OCRExtract;
    return parsed;
  } catch {
    return {};
  }
}
