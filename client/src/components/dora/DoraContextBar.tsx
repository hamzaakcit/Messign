import { useMemo } from 'react';
import { X } from 'lucide-react';
import type { IntentCategory } from '@/shared/intents/registry';
import { getIntentById } from '@/shared/intents/registry';

/** Last `max` distinct categories as they appear in recent history (most recent trail). */
function lastUniqueCategories(recentIntentIds: string[], max: number): IntentCategory[] {
  const seen = new Set<IntentCategory>();
  const out: IntentCategory[] = [];
  for (let i = recentIntentIds.length - 1; i >= 0 && out.length < max; i--) {
    const c = getIntentById(recentIntentIds[i])?.category;
    if (!c || seen.has(c)) continue;
    seen.add(c);
    out.push(c);
  }
  return out.reverse();
}

function lastIntentForCategory(recentIntentIds: string[], cat: IntentCategory): string | null {
  for (let i = recentIntentIds.length - 1; i >= 0; i--) {
    const id = recentIntentIds[i];
    if (getIntentById(id)?.category === cat) return id;
  }
  return null;
}

function truncate(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function categoryShortLabel(cat: IntentCategory): string {
  if (cat === 'finance') return 'Finance';
  if (cat === 'quick') return 'Tasks';
  if (cat === 'projects') return 'Projects';
  if (cat === 'dashboard') return 'Dashboard';
  return cat.charAt(0).toUpperCase() + cat.slice(1);
}

/** Plain labels for session memory `conversationContext` */
export function buildConversationContextLabels(
  recentIntentIds: string[],
  lastUserQuery: string,
): string[] {
  const last3 = lastUniqueCategories(recentIntentIds, 3);
  if (last3.length === 0) return [];

  if (last3.length === 1 && recentIntentIds.length > 0) {
    const cat = last3[0];
    const id = lastIntentForCategory(recentIntentIds, cat);
    if (!id) return [];
    const entry = getIntentById(id);
    return [
      categoryShortLabel(cat),
      truncate(lastUserQuery || entry?.query || '', 42),
    ];
  }

  return last3
    .map((cat) => {
      const id = lastIntentForCategory(recentIntentIds, cat);
      const entry = id ? getIntentById(id) : undefined;
      return entry?.label ? truncate(entry.label, 36) : categoryShortLabel(cat);
    })
    .filter(Boolean);
}

interface DoraContextBarProps {
  recentIntentIds: string[];
  lastUserQuery: string;
  onResendIntent: (intentId: string, query: string) => void;
  onClear: () => void;
}

export function DoraContextBar({
  recentIntentIds,
  lastUserQuery,
  onResendIntent,
  onClear,
}: DoraContextBarProps) {
  const segments = useMemo(() => {
    const last3 = lastUniqueCategories(recentIntentIds, 3);
    if (last3.length === 0) return [];

    if (last3.length === 1 && recentIntentIds.length > 0) {
      const cat = last3[0];
      const id = lastIntentForCategory(recentIntentIds, cat);
      if (!id) return [];
      const entry = getIntentById(id);
      const catLabel = categoryShortLabel(cat);
      const q0 = entry?.query ?? '';
      const q1 = (lastUserQuery || '').trim() || q0;
      return [
        { key: `${id}-cat`, label: catLabel, intentId: id, sendQuery: q0 },
        { key: `${id}-q`, label: truncate(lastUserQuery || entry?.query || '', 42), intentId: id, sendQuery: q1 },
      ];
    }

    return last3.map((cat) => {
      const id = lastIntentForCategory(recentIntentIds, cat);
      const entry = id ? getIntentById(id) : undefined;
      const label = entry?.label ? truncate(entry.label, 36) : categoryShortLabel(cat);
      return {
        key: id ?? cat,
        label,
        intentId: id ?? '',
        sendQuery: entry?.query ?? '',
      };
    }).filter((s) => s.intentId);
  }, [recentIntentIds, lastUserQuery]);

  if (segments.length === 0) return null;

  return (
    <div className="mb-2 flex flex-wrap items-center gap-x-1 gap-y-1 text-[11px] text-app-muted">
      <span className="shrink-0 text-gray-600">Context:</span>
      {segments.map((s, i) => (
        <span key={s.key} className="inline-flex items-center gap-1">
          {i > 0 && <span className="text-gray-600">→</span>}
          <button
            type="button"
            onClick={() => onResendIntent(s.intentId, s.sendQuery)}
            className="max-w-[200px] truncate rounded-md px-1.5 py-0.5 text-left text-app-muted transition-colors hover:bg-app-hover hover:text-sky-300"
            title="Repeat this intent"
          >
            {s.label}
          </button>
        </span>
      ))}
      <button
        type="button"
        onClick={onClear}
        className="ml-1 inline-flex items-center gap-0.5 rounded-md border border-app-border px-2 py-0.5 text-app-muted transition-colors hover:border-danger-500/40 hover:text-danger-400"
        title="Clear conversation"
      >
        <X size={12} />
        Clear
      </button>
    </div>
  );
}
