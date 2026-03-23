import type { IntentEntry } from './types';

const byId = new Map<string, IntentEntry>();

export function initLookup(registry: IntentEntry[]): void {
  byId.clear();
  for (const entry of registry) {
    byId.set(entry.id, entry);
  }
}

export function getIntentById(id: string): IntentEntry | undefined {
  return byId.get(id);
}
