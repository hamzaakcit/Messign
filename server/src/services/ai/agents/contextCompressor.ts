/**
 * Context Compressor — Compress conversation history when passing to specialists
 *
 * Uses a fast tier model to summarize long conversations into max ~500 tokens.
 * Only compresses when history exceeds 4000 characters.
 */

import { generateText } from '../gateway.js';

const COMPRESSION_THRESHOLD_CHARS = 4000;
const MAX_SUMMARY_TOKENS = 500;

/**
 * Compress conversation history into a summary for specialist context.
 * Returns the original text if under threshold.
 */
export async function compressConversationContext(
  history: Array<{ role: string; content: string }>,
  tenantId: string,
): Promise<string> {
  const fullText = history
    .map((m) => `${m.role}: ${m.content}`)
    .join('\n\n');

  if (fullText.length <= COMPRESSION_THRESHOLD_CHARS) {
    return fullText;
  }

  try {
    const summary = await generateText({
      tier: 'fast',
      prompt: `Summarize this conversation between user and assistant in 2-4 sentences. Preserve: key questions asked, data requested, any specific entities (names, projects, amounts). Output ONLY the summary, no preamble.\n\n${fullText.slice(0, 8000)}`,
      systemPrompt: 'You are a summarizer. Output concise, factual summaries. No markdown.',
      tenantId,
      maxTokens: MAX_SUMMARY_TOKENS,
      temperature: 0.1,
    });

    return summary.trim() || fullText.slice(0, 2000);
  } catch (err) {
    console.warn('[ContextCompressor] Compression failed, using truncated history:', err);
    return fullText.slice(0, 2000) + '\n\n[Truncated]';
  }
}
