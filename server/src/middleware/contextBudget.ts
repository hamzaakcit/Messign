/**
 * Rough character/token budgets for hydration segments (defense against huge prompts).
 */
export function approxTokensFromChars(chars: number): number {
  return Math.max(1, Math.ceil(chars / 4));
}

export function trimTextToCharBudget(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 24))}\n…[truncated]`;
}

export type NamedSegment = { name: string; content: string; priority: number };

/**
 * Higher priority = kept longer when trimming. Drops lowest priority first.
 */
export function applySegmentBudget(segments: NamedSegment[], maxChars: number): Map<string, string> {
  const sorted = [...segments].sort((a, b) => a.priority - b.priority);
  const out = new Map<string, string>();
  let budget = maxChars;
  for (const s of sorted) {
    if (budget <= 0) break;
    const slice = trimTextToCharBudget(s.content, budget);
    out.set(s.name, slice);
    budget -= slice.length;
  }
  return out;
}
