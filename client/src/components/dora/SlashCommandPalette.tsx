import { useEffect, useMemo, useRef } from 'react';
import type { IntentEntry } from '@/shared/intents/registry';
import { INTENT_REGISTRY } from '@/shared/intents/registry';
import { INTENT_ICON_MAP } from '@/components/knowledge-hub/ai/AISuggestionChips';
import type { IntentCategory } from '@/shared/intents/registry';

const CATEGORY_TAG: Partial<Record<IntentCategory, string>> = {
  dashboard: 'Dashboard',
  quick: 'Tasks',
  finance: 'Finance',
  projects: 'Projects',
  performance: 'Performance',
  knowledge: 'Knowledge',
  crm: 'CRM',
  marketing: 'Marketing',
  recruitment: 'Hiring',
  support: 'Support',
  okr: 'OKRs',
  reports: 'Reports',
  admin: 'Admin',
  hr: 'HR',
  assets: 'Assets',
  contracts: 'Contracts',
  culture: 'Culture',
};

function categoryTag(cat: IntentCategory): string {
  return CATEGORY_TAG[cat] ?? cat.replace(/_/g, ' ');
}

const SLASH_POOL: IntentEntry[] = INTENT_REGISTRY.filter(
  (e) => e.surfaces.includes('dora') && !e.id.startsWith('generic.'),
);

export function filterSlashCommands(needle: string): IntentEntry[] {
  const q = needle.trim().toLowerCase();
  if (!q) return SLASH_POOL.slice(0, 8);
  return SLASH_POOL.filter(
    (e) =>
      e.label.toLowerCase().includes(q) ||
      e.id.toLowerCase().includes(q) ||
      e.query.toLowerCase().includes(q),
  ).slice(0, 8);
}

interface SlashCommandPaletteProps {
  filter: string;
  activeIndex: number;
  onActiveIndexChange: (i: number) => void;
  onSelect: (entry: IntentEntry) => void;
}

export function SlashCommandPalette({
  filter,
  activeIndex,
  onActiveIndexChange,
  onSelect,
}: SlashCommandPaletteProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const matches = useMemo(() => filterSlashCommands(filter), [filter]);
  const safeIndex = matches.length > 0 ? Math.min(activeIndex, matches.length - 1) : 0;

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-slash-idx="${activeIndex}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [safeIndex]);

  if (matches.length === 0) {
    return (
      <div
        className="absolute bottom-full left-0 right-0 z-30 mb-1 rounded-xl border border-app-border bg-app-bg/98 px-3 py-2 text-xs text-app-muted shadow-xl backdrop-blur-md"
        role="listbox"
      >
        No commands match &ldquo;{filter || '…'}&rdquo;
      </div>
    );
  }

  return (
    <div
      ref={listRef}
      className="absolute bottom-full left-0 right-0 z-30 mb-1 max-h-[min(240px,40vh)] overflow-y-auto rounded-xl border border-sky-500/15 bg-app-bg/98 py-1 shadow-xl backdrop-blur-md"
      role="listbox"
    >
      {matches.map((entry, i) => {
        const Icon = entry.icon ? INTENT_ICON_MAP[entry.icon] : null;
        const active = i === safeIndex;
        return (
          <button
            key={entry.id}
            type="button"
            role="option"
            aria-selected={active}
            data-slash-idx={i}
            onMouseEnter={() => onActiveIndexChange(i)}
            onClick={() => onSelect(entry)}
            className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
              active ? 'bg-sky-500/15 text-app-text' : 'text-app-muted hover:bg-app-hover'
            }`}
          >
            {Icon && <Icon size={16} className="shrink-0 text-app-muted" />}
            <span className="min-w-0 flex-1 truncate">{entry.label}</span>
            <span className="shrink-0 rounded-md bg-app-card px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-app-muted">
              {categoryTag(entry.category)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
