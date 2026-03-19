/**
 * Knowledge Hub AI — Gemini-style synthesis via LiteLLM gateway.
 * Uses generateText and streamModel for cost tracking and routing.
 * Falls back to direct Gemini API when LiteLLM is unreachable (e.g. production without LiteLLM).
 */

import { generateText, streamModel } from './ai/gateway.js';
import { streamGeminiCompletion } from './ai/groqToolCalling.js';

const DEFAULT_SYSTEM_PROMPT = `You are Dora, the AI pilot for Messign Workspace. Your job is to help employees find information and answer questions. Never introduce yourself as a "Knowledge Hub" or "Knowledge Hub AI" — you are Dora, the AI pilot. You have a warm, human touch — occasional light humor or dad jokes are welcome when they fit naturally. Stay professional for serious topics.

RULES:
1. Use the provided knowledge base context as your PRIMARY source. Always cite the document titles when referencing them.
2. If the context contains the answer, provide a clear, well-structured response based on it.
3. If the context is only partially relevant, use it as a starting point and supplement with your general knowledge. Clearly distinguish between what comes from the knowledge base vs your general knowledge.
4. If the context is NOT relevant at all, answer using your general knowledge but tell the user: "I couldn't find this in the knowledge base, but here's what I know:"
5. Be concise, professional, and helpful. Use bullet points or numbered lists when appropriate.
6. Always respond in English.`;

export interface StreamGeminiOptions {
  /** Override system prompt (for synthesis with tool context) */
  systemPrompt?: string;
  /** Override user message (for synthesis with tool context) */
  userMessage?: string;
  tenantId?: string;
}

export async function streamGeminiAnswer(
  userQuery: string,
  context: string,
  onChunk: (text: string) => void,
  options?: StreamGeminiOptions,
): Promise<void> {
  const tenantId = options?.tenantId ?? 'system';
  const userContent = (options?.systemPrompt && options?.userMessage)
    ? `${options.systemPrompt}\n\n---\n\n${options.userMessage}`
    : `${DEFAULT_SYSTEM_PROMPT}\n\n---\nKNOWLEDGE BASE CONTEXT:\n${context}\n---\n\nEmployee question: ${userQuery}`;

  const messages = [{ role: 'user' as const, content: userContent }];

  const tiers = ['balanced', 'fast', 'complex'] as const;
  for (const tier of tiers) {
    try {
      for await (const chunk of streamModel({
        tier,
        messages,
        tenantId,
        maxTokens: 2048,
        temperature: 0.4,
      })) {
        const content = chunk.choices?.[0]?.delta?.content;
        if (content) onChunk(content);
      }
      return;
    } catch {
      continue;
    }
  }

  // Fallback: direct Gemini when LiteLLM unreachable (e.g. Railway production)
  const fallbackSystemPrompt = options?.systemPrompt ?? DEFAULT_SYSTEM_PROMPT;
  const fallbackUserContent = options?.userMessage ?? `KNOWLEDGE BASE CONTEXT:\n${context}\n---\n\nEmployee question: ${userQuery}`;
  for await (const chunk of streamGeminiCompletion(fallbackSystemPrompt, fallbackUserContent)) {
    onChunk(chunk);
  }
}

export async function generateGeminiAnswer(
  userQuery: string,
  context: string,
  options?: { tenantId?: string },
): Promise<string> {
  const tenantId = options?.tenantId ?? 'system';
  const systemPrompt = `You are Dora, the AI pilot for Messign Workspace. Answer the employee's question using the provided context. If the context doesn't fully answer the question, supplement with your general knowledge but clearly note when you're going beyond the provided data. Cite sources when relevant. Always respond in English. Be concise and professional. You have a warm, human touch — occasional light humor or dad jokes are welcome when they fit naturally. Stay professional for serious topics.`;

  const prompt = `${systemPrompt}\n\n---\nKNOWLEDGE BASE CONTEXT:\n${context}\n---\n\nEmployee question: ${userQuery}`;

  const tiers = ['balanced', 'fast', 'complex'] as const;
  for (const tier of tiers) {
    try {
      return await generateText({
        tier,
        prompt,
        tenantId,
        maxTokens: 2048,
        temperature: 0.4,
      });
    } catch {
      continue;
    }
  }

  return 'I was unable to generate a response.';
}
