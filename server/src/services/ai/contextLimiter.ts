/**
 * Messign AI Brain — Context Limiter
 *
 * Manages the token budget for LLM calls.
 * Ensures the combined context from all tools doesn't exceed
 * the model's context window or waste tokens unnecessarily.
 *
 * Token budget allocation:
 * - System prompt: ~500 tokens (fixed)
 * - Conversation history: ~1000 tokens (last 4-6 messages)
 * - Tool context: ~6000 tokens (bulk of the budget)
 * - Response: ~2000 tokens (reserved for the LLM's answer)
 * - Total: ~9500 tokens (well within 32k/128k context windows)
 */

/**
 * Approximate token count for a string.
 * Rough estimation: 1 token ≈ 4 characters for English text.
 * This is intentionally conservative.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

/**
 * Token budget configuration.
 */
const TOKEN_BUDGET = {
  systemPrompt: 500,
  history: 1000,
  toolContext: 6000,
  responseReserve: 2000,
};

/**
 * Trim tool context to fit within the token budget.
 * Prioritizes: successful results > failed results, earlier tools > later tools.
 *
 * @param combinedContext - The full context string from all tools
 * @returns Trimmed context that fits within budget
 */
export function trimToTokenBudget(combinedContext: string): string {
  const currentTokens = estimateTokens(combinedContext);
  const budget = TOKEN_BUDGET.toolContext;

  if (currentTokens <= budget) return combinedContext;

  // Need to trim. Split by tool sections and prioritize.
  const sections = combinedContext.split('\n\n---\n\n');
  const trimmedSections: string[] = [];
  let usedTokens = 0;

  for (const section of sections) {
    const sectionTokens = estimateTokens(section);

    if (usedTokens + sectionTokens <= budget) {
      trimmedSections.push(section);
      usedTokens += sectionTokens;
    } else {
      // Truncate this section to fit remaining budget
      const remaining = budget - usedTokens;
      if (remaining > 100) { // Only include if we can fit meaningful content
        const charLimit = remaining * 4;
        trimmedSections.push(section.slice(0, charLimit) + '\n[... truncated due to context size limit]');
      }
      break;
    }
  }

  return trimmedSections.join('\n\n---\n\n');
}

/**
 * Trim conversation history to fit within token budget.
 */
export function trimHistory(history: { role: string; content: string }[], maxTokens: number = TOKEN_BUDGET.history): { role: string; content: string }[] {
  if (!history || history.length === 0) return [];

  const trimmed: { role: string; content: string }[] = [];
  let usedTokens = 0;

  // Work backwards (most recent messages first)
  for (let i = history.length - 1; i >= 0; i--) {
    const msg = history[i];
    const msgTokens = estimateTokens(msg.content);

    if (usedTokens + msgTokens > maxTokens) break;

    trimmed.unshift(msg);
    usedTokens += msgTokens;
  }

  return trimmed;
}
