/**
 * Knowledge Hub AI — Groq-style synthesis via LiteLLM gateway.
 * Uses generateText and streamModel for cost tracking and routing.
 * Falls back to direct Groq API when LiteLLM is unreachable (e.g. production without LiteLLM).
 */

import { generateText, streamModel } from './ai/gateway.js';
import { streamGroqCompletion } from './ai/groqToolCalling.js';

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
  tenantId?: string;
}

export async function streamGroqAnswer(
  userQuery: string,
  context: string,
  onChunk: (text: string) => void,
  chatHistory?: { role: 'user' | 'assistant'; content: string }[],
  options?: StreamGroqOptions,
): Promise<void> {
  const tenantId = options?.tenantId ?? 'system';
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

  const tiers = ['fast', 'balanced', 'complex'] as const;
  for (const tier of tiers) {
    try {
      for await (const chunk of streamModel({
        tier,
        messages,
        tenantId,
        maxTokens,
        temperature: 0.3,
      })) {
        const content = chunk.choices?.[0]?.delta?.content;
        if (content) onChunk(content);
      }
      return;
    } catch {
      continue;
    }
  }

  // Fallback: direct Groq when LiteLLM unreachable (e.g. Railway production)
  const groqMessages = messages.map((m) => ({ role: m.role, content: m.content ?? '' }));
  for await (const chunk of streamGroqCompletion(groqMessages, { maxTokens, temperature: 0.3, tenantId })) {
    onChunk(chunk);
  }
}

/** Non-streaming completion for structured output (e.g. presentation JSON). */
export async function generateGroqCompletion(
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
  options?: { maxTokens?: number; tenantId?: string },
): Promise<string> {
  const tenantId = options?.tenantId ?? 'system';
  const systemMsg = messages.find((m) => m.role === 'system');
  const userMsg = messages.find((m) => m.role === 'user');
  const prompt = userMsg?.content ?? '';
  const systemPrompt = systemMsg?.content;

  const tiers = ['fast', 'balanced', 'complex'] as const;
  for (const tier of tiers) {
    try {
      return await generateText({
        tier,
        prompt,
        systemPrompt,
        tenantId,
        maxTokens: options?.maxTokens ?? 2048,
        temperature: 0.3,
      });
    } catch {
      continue;
    }
  }

  throw new Error('Knowledge completion failed: all gateway tiers unavailable.');
}
