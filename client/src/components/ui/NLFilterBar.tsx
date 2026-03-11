import { useState, useCallback } from 'react';
import { Sparkles, X, Loader2 } from 'lucide-react';
import { getAccessToken } from '@/lib/authToken';
import { API_ORIGIN } from '@/lib/api';

export interface AvailableField {
  key: string;
  label: string;
  type: 'string' | 'number' | 'date' | 'enum';
  values?: string[];
}

interface NLFilterBarProps {
  placeholder?: string;
  onFiltersApplied: (filters: Record<string, unknown>) => void;
  availableFields: AvailableField[];
  module: string;
}

interface ActiveChip {
  key: string;
  label: string;
  value: unknown;
}

export function NLFilterBar({ placeholder, onFiltersApplied, availableFields, module }: NLFilterBarProps) {
  const [query, setQuery] = useState('');
  const [chips, setChips] = useState<ActiveChip[]>([]);
  const [loading, setLoading] = useState(false);
  const [interpretation, setInterpretation] = useState<string | null>(null);

  const fieldMap = new Map(availableFields.map(f => [f.key, f.label]));

  const parseFilters = useCallback(async () => {
    if (!query.trim() || loading) return;
    setLoading(true);
    setInterpretation(null);

    try {
      const token = getAccessToken();
      const res = await fetch(`${API_ORIGIN}/api/dora/parse-filters`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ query: query.trim(), availableFields, module }),
      });

      if (!res.ok) return;
      const data = await res.json() as { filters: Record<string, unknown>; interpretation: string };
      const { filters, interpretation: interp } = data;

      const newChips: ActiveChip[] = Object.entries(filters)
        .filter(([, v]) => v !== null && v !== undefined && v !== '')
        .map(([key, value]) => {
          const baseKey = key.replace(/(Min|Max|From|To)$/, '');
          const suffix = key.replace(baseKey, '');
          const label = fieldMap.get(baseKey) ?? fieldMap.get(key) ?? key;
          const displayLabel = suffix ? `${label} ${suffix.replace(/([A-Z])/g, ' $1').trim()}` : label;
          return { key, label: displayLabel, value };
        });

      setChips(newChips);
      setInterpretation(interp);
      setQuery('');
      onFiltersApplied(filters);
    } catch {
      setInterpretation('Failed to parse filters');
    } finally {
      setLoading(false);
    }
  }, [query, loading, availableFields, module, onFiltersApplied, fieldMap]);

  const removeChip = useCallback((key: string) => {
    setChips(prev => {
      const next = prev.filter(c => c.key !== key);
      const filters: Record<string, unknown> = {};
      for (const chip of next) filters[chip.key] = chip.value;
      onFiltersApplied(filters);
      return next;
    });
  }, [onFiltersApplied]);

  const clearAll = useCallback(() => {
    setChips([]);
    setInterpretation(null);
    onFiltersApplied({});
  }, [onFiltersApplied]);

  return (
    <div className="space-y-2">
      <div className="relative">
        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-violet-400">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        </div>
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') parseFilters(); }}
          placeholder={placeholder ?? 'Try: "expenses over €500 from last month"'}
          className="w-full rounded-lg border border-zinc-700 bg-zinc-800/50 py-2 pl-10 pr-4 text-sm text-zinc-100 placeholder-zinc-500 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
          disabled={loading}
        />
      </div>

      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {chips.map(chip => (
            <span
              key={chip.key}
              className="inline-flex items-center gap-1 rounded-full bg-violet-500/15 px-2.5 py-0.5 text-xs font-medium text-violet-300"
            >
              {chip.label}: {String(chip.value)}
              <button
                onClick={() => removeChip(chip.key)}
                className="ml-0.5 rounded-full p-0.5 hover:bg-violet-500/30"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          <button
            onClick={clearAll}
            className="text-xs text-zinc-500 hover:text-zinc-300"
          >
            Clear all
          </button>
        </div>
      )}

      {interpretation && chips.length > 0 && (
        <p className="text-xs text-zinc-500 italic">{interpretation}</p>
      )}
    </div>
  );
}
