/**
 * Per-tab session memory for Dora (sessionStorage — fresh per browser tab).
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { IntentCategory } from '@/shared/intents/registry';
import { getIntentById } from '@/shared/intents/registry';

const MAX_RECENT_INTENTS = 20;
const MAX_VISITED_PREFIXES = 15;
const MAX_CONTEXT_SEGMENTS = 8;

function deriveFrequentCategories(recentIntents: string[]): IntentCategory[] {
  const counts = new Map<IntentCategory, number>();
  for (const id of recentIntents) {
    const c = getIntentById(id)?.category;
    if (!c) continue;
    counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([c]) => c);
}

function modulePrefix(path: string): string | null {
  const p = path.split('?')[0]?.split('#')[0] ?? '';
  if (!p.startsWith('/')) return null;
  const parts = p.split('/').filter(Boolean);
  if (parts.length === 0) return '/';
  return `/${parts[0]}`;
}

export interface DoraSessionMemory {
  recentIntents: string[];
  frequentCategories: IntentCategory[];
  preferredMode: 'concise' | 'detailed';
  conversationContext: string[];
  visitedModulePrefixes: string[];
  addIntent: (intentId: string) => void;
  clearSession: () => void;
  setPreferredMode: (mode: 'concise' | 'detailed') => void;
  setConversationContext: (segments: string[]) => void;
  recordPath: (pathname: string) => void;
}

export const useDoraSessionStore = create<DoraSessionMemory>()(
  persist(
    (set) => ({
      recentIntents: [],
      frequentCategories: [],
      preferredMode: 'concise',
      conversationContext: [],
      visitedModulePrefixes: [],

      addIntent: (intentId: string) => {
        const id = intentId.trim();
        if (!id) return;
        set((state) => {
          const recent = [...state.recentIntents, id].slice(-MAX_RECENT_INTENTS);
          return {
            recentIntents: recent,
            frequentCategories: deriveFrequentCategories(recent),
          };
        });
      },

      clearSession: () => {
        set((state) => ({
          recentIntents: [],
          frequentCategories: [],
          conversationContext: [],
          visitedModulePrefixes: [],
          preferredMode: state.preferredMode,
        }));
      },

      setPreferredMode: (mode) => set({ preferredMode: mode }),

      setConversationContext: (segments) =>
        set({ conversationContext: segments.slice(-MAX_CONTEXT_SEGMENTS) }),

      recordPath: (pathname: string) => {
        const prefix = modulePrefix(pathname);
        if (!prefix) return;
        set((state) => {
          const rest = state.visitedModulePrefixes.filter((p) => p !== prefix);
          return {
            visitedModulePrefixes: [prefix, ...rest].slice(0, MAX_VISITED_PREFIXES),
          };
        });
      },
    }),
    {
      name: 'dora-session-memory',
      storage: createJSONStorage(() => sessionStorage),
      partialize: (s) => ({
        recentIntents: s.recentIntents,
        frequentCategories: s.frequentCategories,
        preferredMode: s.preferredMode,
        conversationContext: s.conversationContext,
        visitedModulePrefixes: s.visitedModulePrefixes,
      }),
    },
  ),
);
