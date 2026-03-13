/**
 * Context Compressor — Pass compressed summaries between specialists
 *
 * When the orchestrator routes between specialists, pass only a compressed
 * summary — not the full tool output history.
 */
import { callModelSafe } from '../gateway.js';

const COMPACTION_PROMPT = `Compress the following conversation into a concise context summary.
Preserve: key data points, decisions made, unresolved questions, specific numbers/IDs.
Discard: tool call syntax, redundant data, intermediate reasoning.
Format: bullet points, max 500 tokens.`;

export async function compactContext(
  messages: Array<{ role: string; content: string }>,
  tenantId: string,
): Promise<string> {
  const totalChars = messages.reduce((sum, m) => sum + (typeof m.content === 'string' ? m.content.length : 0), 0);

  if (totalChars < 4000) {
    return messages
      .filter((m) => m.role !== 'system')
      .map((m) => `[${m.role}]: ${typeof m.content === 'string' ? m.content : ''}`)
      .join('\n')
      .slice(0, 2000);
  }

  const lastMessages = messages.slice(-10);
  const payload = lastMessages.map((m) => ({
    role: m.role,
    content: typeof m.content === 'string' ? m.content.slice(0, 4000) : '',
  }));

  const response = await callModelSafe({
    tier: 'fast',
    tenantId,
    messages: [
      { role: 'system', content: COMPACTION_PROMPT },
      { role: 'user', content: JSON.stringify(payload) },
    ],
    maxTokens: 500,
  });

  return response.choices?.[0]?.message?.content ?? '';
}
