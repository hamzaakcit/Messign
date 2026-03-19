import { INTENT_REGISTRY } from './registry';
import type { IntentEntry } from './registry';

export function resolveIntent(query: string): IntentEntry | null {
  const normalized = query.toLowerCase().trim();

  const exact = INTENT_REGISTRY.find((i) => i.query.toLowerCase() === normalized);
  if (exact) return exact;

  const labelMatch = INTENT_REGISTRY.find((i) => i.label.toLowerCase() === normalized);
  if (labelMatch) return labelMatch;

  const queryWords = normalized.split(/\s+/).filter(Boolean);
  let bestMatch: IntentEntry | null = null;
  let bestScore = 0;

  for (const intent of INTENT_REGISTRY) {
    const intentWords = intent.query.toLowerCase().split(/\s+/).filter(Boolean);
    const overlap = queryWords.filter((w) => intentWords.includes(w)).length;
    const score = overlap / Math.max(queryWords.length, intentWords.length, 1);
    if (score > bestScore && score >= 0.5) {
      bestScore = score;
      bestMatch = intent;
    }
  }

  return bestMatch;
}
