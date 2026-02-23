const GEMINI_MODEL = 'gemini-2.0-flash-lite';

interface GeminiCandidate {
  content?: { parts?: { text?: string }[] };
  finishReason?: string;
}

interface GeminiResponse {
  candidates?: GeminiCandidate[];
}

export function getGeminiApiKey(): string | null {
  return process.env.GOOGLE_GEMINI_API_KEY || null;
}

export interface StreamGeminiOptions {
  /** Override system prompt (for synthesis with tool context) */
  systemPrompt?: string;
  /** Override user message (for synthesis with tool context) */
  userMessage?: string;
}

export async function streamGeminiAnswer(
  userQuery: string,
  context: string,
  onChunk: (text: string) => void,
  options?: StreamGeminiOptions,
): Promise<void> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) throw new Error('GOOGLE_GEMINI_API_KEY not configured');

  const defaultSystemPrompt = `You are the Knowledge Hub AI assistant for Messign Workspace. Your job is to help employees find information and answer questions.

RULES:
1. Use the provided knowledge base context as your PRIMARY source. Always cite the document titles when referencing them.
2. If the context contains the answer, provide a clear, well-structured response based on it.
3. If the context is only partially relevant, use it as a starting point and supplement with your general knowledge. Clearly distinguish between what comes from the knowledge base vs your general knowledge.
4. If the context is NOT relevant at all, answer using your general knowledge but tell the user: "I couldn't find this in the knowledge base, but here's what I know:"
5. Be concise, professional, and helpful. Use bullet points or numbered lists when appropriate.
6. Always respond in English.`;

  const userContent = (options?.systemPrompt && options?.userMessage)
    ? `${options.systemPrompt}\n\n---\n\n${options.userMessage}`
    : `${defaultSystemPrompt}\n\n---\nKNOWLEDGE BASE CONTEXT:\n${context}\n---\n\nEmployee question: ${userQuery}`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:streamGenerateContent?alt=sse&key=${apiKey}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: userContent }],
          },
        ],
        generationConfig: {
          maxOutputTokens: 2048,
          temperature: 0.4,
        },
      }),
    });
  } catch (fetchErr: unknown) {
    const msg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
    console.error('[Gemini Synthesis] Fetch failed:', { error: msg, stack: fetchErr instanceof Error ? fetchErr.stack : undefined });
    throw fetchErr;
  }

  if (!res.ok || !res.body) {
    const errBody = await res.text().catch(() => '');
    console.error('[Gemini Synthesis] API error:', { status: res.status, statusText: res.statusText, bodyPreview: errBody.slice(0, 500) });
    throw new Error(`Gemini API error ${res.status}: ${errBody.slice(0, 200)}`);
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
        const parsed: GeminiResponse = JSON.parse(payload);
        const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) onChunk(text);
      } catch { /* skip parse errors */ }
    }
  }
}

export async function generateGeminiAnswer(
  userQuery: string,
  context: string,
): Promise<string> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) throw new Error('GOOGLE_GEMINI_API_KEY not configured');

  const systemPrompt = `You are the Knowledge Hub AI assistant for Messign Workspace. Answer the employee's question using the provided knowledge base context. If the context doesn't fully answer the question, supplement with your general knowledge but clearly note when you're going beyond the knowledge base. Cite document titles. Always respond in English. Be concise and professional.`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [{ text: `${systemPrompt}\n\n---\nKNOWLEDGE BASE CONTEXT:\n${context}\n---\n\nEmployee question: ${userQuery}` }],
        },
      ],
      generationConfig: {
        maxOutputTokens: 2048,
        temperature: 0.4,
      },
    }),
  });

  if (!res.ok) {
    throw new Error(`Gemini API error ${res.status}`);
  }

  const data = (await res.json()) as GeminiResponse;
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? 'I was unable to generate a response.';
}
