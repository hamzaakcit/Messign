import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { IntentCategory, Surface } from '@/shared/intents/registry';
import { getRankedIntentEntries } from '@/shared/intents/suggestion-engine';
import { INTENT_ICON_MAP } from '@/components/knowledge-hub/ai/AISuggestionChips';
import { useDoraSessionStore } from '@/stores/doraSessionStore';

const MORE_KEY = '__more__';

const CATEGORY_CHIP_META: Partial<Record<IntentCategory, { emoji: string; label: string }>> = {
  dashboard: { emoji: '📊', label: 'Dashboard' },
  quick: { emoji: '✅', label: 'Tasks' },
  finance: { emoji: '💰', label: 'Finance' },
  projects: { emoji: '📁', label: 'Projects' },
  performance: { emoji: '📈', label: 'Performance' },
  knowledge: { emoji: '📚', label: 'Knowledge' },
  time: { emoji: '🕐', label: 'Time' },
  crm: { emoji: '🤝', label: 'CRM' },
  marketing: { emoji: '📣', label: 'Marketing' },
  recruitment: { emoji: '👋', label: 'Hiring' },
  support: { emoji: '🎧', label: 'Support' },
  okr: { emoji: '🎯', label: 'OKRs' },
  reports: { emoji: '📋', label: 'Reports' },
  admin: { emoji: '⚙️', label: 'Admin' },
  hr: { emoji: '👥', label: 'HR' },
  assets: { emoji: '📦', label: 'Assets' },
  contracts: { emoji: '📄', label: 'Contracts' },
  culture: { emoji: '❤️', label: 'Culture' },
};

function categoryChipLabel(cat: IntentCategory): string {
  const m = CATEGORY_CHIP_META[cat];
  if (m) return `${m.emoji} ${m.label}`;
  const title = cat.replace(/_/g, ' ');
  return `🔹 ${title.charAt(0).toUpperCase() + title.slice(1)}`;
}

interface ProgressiveChipsProps {
  userRole: string;
  surface?: Surface;
  currentPath?: string;
  /** @deprecated session store provides recent intents */
  recentIntentIds?: string[];
  onSuggestionClick: (query: string, intentId?: string) => void;
}

export function ProgressiveChips({
  userRole,
  surface = 'dora',
  currentPath,
  recentIntentIds: recentIntentIdsProp,
  onSuggestionClick,
}: ProgressiveChipsProps) {
  const path = currentPath ?? (typeof window !== 'undefined' ? window.location.pathname : '/');
  const [selected, setSelected] = useState<IntentCategory | typeof MORE_KEY | null>(null);

  const storeRecent = useDoraSessionStore((s) => s.recentIntents);
  const frequentCategories = useDoraSessionStore((s) => s.frequentCategories);
  const visitedModulePrefixes = useDoraSessionStore((s) => s.visitedModulePrefixes);
  const recentIntentIds = recentIntentIdsProp ?? storeRecent;

  const ranked = useMemo(
    () =>
      getRankedIntentEntries({
        role: userRole,
        currentPath: path,
        surface,
        recentIntents: recentIntentIds,
        frequentCategories,
        visitedModulePrefixes,
        conversationActive: false,
      }),
    [userRole, path, surface, recentIntentIds, frequentCategories, visitedModulePrefixes],
  );

  const { primaryCats, showMore } = useMemo(() => {
    const orderedCats: IntentCategory[] = [];
    const seen = new Set<IntentCategory>();
    for (const e of ranked) {
      if (seen.has(e.category)) continue;
      seen.add(e.category);
      orderedCats.push(e.category);
    }
    const MAX_PRIMARY = 4;
    const more = orderedCats.length > MAX_PRIMARY;
    return {
      primaryCats: more ? orderedCats.slice(0, MAX_PRIMARY) : orderedCats.slice(0, 5),
      showMore: more,
    };
  }, [ranked]);

  const level2Intents = useMemo(() => {
    if (!selected) return [];
    if (selected === MORE_KEY) {
      const rest = new Set(primaryCats);
      return ranked.filter((e) => !rest.has(e.category));
    }
    return ranked.filter((e) => e.category === selected);
  }, [ranked, selected, primaryCats]);

  if (ranked.length === 0) return null;

  const runIntent = (query: string, intentId?: string) => {
    setSelected(null);
    onSuggestionClick(query, intentId);
  };

  return (
    <div className="relative min-h-[44px] overflow-hidden">
      <AnimatePresence mode="wait" initial={false}>
        {!selected ? (
          <motion.div
            key="l1"
            initial={{ opacity: 0, x: -24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="flex flex-nowrap gap-2 overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-dark-600"
          >
            {primaryCats.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelected(cat)}
                className="group inline-flex shrink-0 items-center gap-1.5 rounded-full border border-app-border bg-app-sidebar px-4 py-2 text-sm text-gray-300 transition-all duration-200 hover:scale-[1.02] hover:border-primary-500/50 hover:bg-app-hover/80 hover:text-app-text"
              >
                <span className="whitespace-nowrap">{categoryChipLabel(cat)}</span>
              </button>
            ))}
            {showMore && (
              <button
                type="button"
                onClick={() => setSelected(MORE_KEY)}
                className="group inline-flex shrink-0 items-center gap-1.5 rounded-full border border-app-border bg-app-sidebar px-4 py-2 text-sm text-gray-300 transition-all duration-200 hover:scale-[1.02] hover:border-primary-500/50 hover:bg-app-hover/80 hover:text-app-text"
              >
                <span className="whitespace-nowrap">🔍 More...</span>
              </button>
            )}
          </motion.div>
        ) : (
          <motion.div
            key="l2"
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 24 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="flex flex-nowrap gap-2 overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-dark-600"
          >
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="group inline-flex shrink-0 items-center gap-1.5 rounded-full border border-sky-500/30 bg-app-sidebar/90 px-3 py-2 text-sm text-sky-300 transition-all hover:border-sky-500/50 hover:text-app-text"
            >
              <span className="whitespace-nowrap">← Back</span>
            </button>
            {level2Intents.map((suggestion, i) => {
              const IconComponent = suggestion.icon ? INTENT_ICON_MAP[suggestion.icon] : null;
              return (
                <button
                  key={suggestion.id}
                  type="button"
                  title={suggestion.query}
                  onClick={() => runIntent(suggestion.query, suggestion.id)}
                  style={{
                    animation: 'dora-chip-in 0.35s ease-out forwards',
                    animationDelay: `${i * 40}ms`,
                    opacity: 0,
                  }}
                  className="group inline-flex shrink-0 items-center gap-1.5 rounded-full border border-app-border border-l-2 border-l-primary-500/50 bg-app-sidebar px-4 py-2 text-sm text-gray-300 transition-all duration-200 hover:scale-[1.02] hover:border-primary-500/50 hover:bg-app-hover/80 hover:text-app-text"
                >
                  {IconComponent && (
                    <IconComponent size={14} className="shrink-0 text-app-muted transition-colors group-hover:text-primary-400" />
                  )}
                  <span className="whitespace-nowrap">{suggestion.label}</span>
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
      <style>{`
        @keyframes dora-chip-in {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
