import { useState } from 'react';
import type { TemplateCategory, UnlayerStarterTemplate } from '../unlayerTemplates/types';

type Props = {
  templates: UnlayerStarterTemplate[];
  onSelect: (id: string) => void;
};

const CATEGORY_FILTERS: { id: TemplateCategory | 'all'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'sales', label: 'Sales' },
  { id: 'nurture', label: 'Nurture' },
  { id: 'announce', label: 'Announce' },
  { id: 'engage', label: 'Engage' },
  { id: 'general', label: 'General' },
];

const CATEGORY_COLORS: Record<TemplateCategory, string> = {
  sales: 'bg-red-500/20 text-red-300',
  nurture: 'bg-blue-500/20 text-blue-300',
  announce: 'bg-amber-500/20 text-amber-300',
  engage: 'bg-purple-500/20 text-purple-300',
  general: 'bg-slate-500/20 text-slate-300',
};

function getSubtitle(t: UnlayerStarterTemplate): string {
  if (t.description) return t.description;
  if (t.htmlImportUrl) return 'HTML import starter';
  if (t.manifest) return 'Themed template';
  if (t.design == null) return 'Empty canvas';
  return 'Pre-built starter';
}

export function UnlayerTemplatePicker({ templates, onSelect }: Props) {
  const [activeFilter, setActiveFilter] = useState<TemplateCategory | 'all'>('all');

  const filtered = activeFilter === 'all'
    ? templates
    : templates.filter((t) => (t.category ?? 'general') === activeFilter);

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium text-app-text">Choose a template</h3>
        <p className="text-xs text-app-muted mt-1">Pick a starter layout or begin from a blank canvas.</p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {CATEGORY_FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setActiveFilter(f.id)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              activeFilter === f.id
                ? 'bg-primary-500 text-app-text'
                : 'bg-app-surface-tertiary text-app-muted hover:bg-app-hover hover:text-app-text'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {filtered.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onSelect(t.id)}
            className="group text-left rounded-xl border border-app-border bg-app-surface-tertiary p-3 transition-all hover:bg-app-hover hover:border-app-border-strong hover:scale-[1.02] hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-primary-500/40"
          >
            <div className="aspect-[4/3] rounded-lg overflow-hidden mb-2.5 border border-app-border bg-gradient-to-br from-primary-500/15 to-slate-900/40 flex items-center justify-center relative">
              {t.thumbnailSrc ? (
                <img src={t.thumbnailSrc} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="flex flex-col items-center gap-1">
                  <span className="text-3xl font-bold text-primary-400/60 group-hover:text-primary-400/80 transition-colors">
                    {t.title.charAt(0)}
                  </span>
                  {t.manifest && (
                    <span className="text-[9px] uppercase tracking-wider text-app-muted/60 font-medium">VA2</span>
                  )}
                </div>
              )}
              {t.category && t.category !== 'general' && (
                <span className={`absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wider ${CATEGORY_COLORS[t.category]}`}>
                  {t.category}
                </span>
              )}
            </div>
            <p className="text-sm font-medium text-app-text group-hover:text-app-text transition-colors">{t.title}</p>
            <p className="text-[11px] text-app-muted mt-0.5 line-clamp-2">{getSubtitle(t)}</p>
          </button>
        ))}
        {filtered.length === 0 && (
          <p className="col-span-full text-center text-sm text-app-muted py-8">No templates in this category.</p>
        )}
      </div>
    </div>
  );
}
