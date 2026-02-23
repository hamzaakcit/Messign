const GROQ_MODEL = 'llama-3.1-8b-instant';

interface GroqChoice {
  delta?: { content?: string };
  finish_reason?: string | null;
}

interface GroqChunk {
  choices?: GroqChoice[];
}

export function getGroqApiKey(): string | null {
  return process.env.GROQ_API_KEY || null;
}

const SYSTEM_BASE = `You are the Knowledge Hub AI assistant for Messign Workspace. You help employees get quick, accurate answers from the company knowledge base.

CRITICAL RULES:
1. SYNTHESIZE — Read the context, understand it, then answer in your own words. Do NOT copy-paste long excerpts or dump raw document text.
2. BE CONCISE — Prefer 2–4 short paragraphs or a few bullet points. Only add detail when the question explicitly asks for it.
3. ANSWER THE QUESTION — Address what was asked directly first (e.g. "Messign is …" or "Handset DLR means …"). Then add 1–2 supporting points if useful.
4. CITE BRIEFLY — Mention document names in passing (e.g. "According to the SMS Guide, …"). Do not list full excerpts.
5. If the context doesn't contain the answer, say so briefly and add what you know. Always respond in English.`;

const CONCISE_ADDON = `\n\nThis is a simple or overview question. Give a direct, short answer in 2–4 sentences or a brief bullet list. Do not list long excerpts or repeat full paragraphs from the documents.`;

export interface StreamGroqOptions {
  concise?: boolean;
  maxTokens?: number;
  /** Override system prompt (for synthesis with tool context) */
  systemPrompt?: string;
  /** Override user message (for synthesis with tool context) */
  userMessage?: string;
}

export async function streamGroqAnswer(
  userQuery: string,
  context: string,
  onChunk: (text: string) => void,
  chatHistory?: { role: 'user' | 'assistant'; content: string }[],
  options?: StreamGroqOptions,
): Promise<void> {
  const apiKey = getGroqApiKey();
  if (!apiKey) throw new Error('GROQ_API_KEY not configured');

  const concise = options?.concise ?? true;
  const maxTokens = options?.maxTokens ?? (concise ? 600 : 1200);

  const systemContent = options?.systemPrompt
    ?? SYSTEM_BASE + (concise ? CONCISE_ADDON : '') + `\n\nKNOWLEDGE BASE CONTEXT (use to inform your answer; do not copy verbatim):\n${context}`;

  const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
    { role: 'system', content: systemContent },
  ];

  if (chatHistory?.length) {
    for (const msg of chatHistory) {
      messages.push({ role: msg.role, content: msg.content });
    }
  }

  const finalUserContent = options?.userMessage ?? userQuery;
  messages.push({ role: 'user', content: finalUserContent });

  let res: Response;
  try {
    res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        stream: true,
        max_tokens: maxTokens,
        temperature: 0.3,
        messages,
      }),
    });
  } catch (fetchErr: unknown) {
    const msg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
    console.error('[Groq Synthesis] Fetch failed:', { error: msg, stack: fetchErr instanceof Error ? fetchErr.stack : undefined });
    throw fetchErr;
  }

  if (!res.ok || !res.body) {
    const errBody = await res.text().catch(() => '');
    console.error('[Groq Synthesis] API error:', { status: res.status, statusText: res.statusText, bodyPreview: errBody.slice(0, 500) });
    throw new Error(`Groq API error ${res.status}: ${errBody.slice(0, 200)}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const payload = line.slice(6).trim();
      if (payload === '[DONE]') return;
      try {
        const parsed: GroqChunk = JSON.parse(payload);
        const text = parsed.choices?.[0]?.delta?.content;
        if (text) onChunk(text);
      } catch { /* skip parse errors */ }
    }
  }
}

/** Non-streaming completion for structured output (e.g. presentation JSON). */
export async function generateGroqCompletion(
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
  options?: { maxTokens?: number },
): Promise<string> {
  const apiKey = getGroqApiKey();
  if (!apiKey) throw new Error('GROQ_API_KEY not configured');

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      stream: false,
      max_tokens: options?.maxTokens ?? 2048,
      temperature: 0.3,
      messages,
    }),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`Groq API error ${res.status}: ${errBody.slice(0, 200)}`);
  }

  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return data.choices?.[0]?.message?.content?.trim() ?? '';
}
