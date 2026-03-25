import { CalendarRange, Filter, RefreshCw } from 'lucide-react';
import type { BrandProfileClient } from '@/lib/marketingApi';

export interface CommandCenterToolbarProps {
  days: number;
  onDaysChange: (days: number) => void;
  brandList: BrandProfileClient[];
  brandFilter: string | null;
  onBrandFilterChange: (id: string | null) => void;
  onRefresh: () => void;
  loading?: boolean;
}

const DAY_OPTIONS = [7, 14, 30] as const;

/**
 * Dense filter row: date range + brand.
 */
export function CommandCenterToolbar({
  days,
  onDaysChange,
  brandList,
  brandFilter,
  onBrandFilterChange,
  onRefresh,
  loading,
}: CommandCenterToolbarProps): JSX.Element {
  return (
    <div className="flex flex-wrap items-center gap-2 px-3 py-1.5 border-b border-white/[0.06] bg-[#0a0d12] shrink-0">
      <div className="flex items-center gap-1 text-slate-500">
        <CalendarRange className="h-3.5 w-3.5" />
        <span className="text-[10px] uppercase tracking-wider">Range</span>
      </div>
      <div className="flex rounded-md border border-white/[0.08] overflow-hidden">
        {DAY_OPTIONS.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => onDaysChange(d)}
            className={`px-2 py-0.5 text-[10px] font-medium transition-colors ${
              days === d ? 'bg-primary-600 text-white' : 'bg-app-surface-tertiary text-app-muted hover:text-app-text'
            }`}
          >
            {d}d
          </button>
        ))}
      </div>
      {brandList.length > 0 && (
        <>
          <div className="flex items-center gap-1 text-slate-500 ml-1">
            <Filter className="h-3.5 w-3.5" />
            <span className="text-[10px] uppercase tracking-wider">Brand</span>
          </div>
          <select
            value={brandFilter || ''}
            onChange={(e) => onBrandFilterChange(e.target.value || null)}
            className="bg-app-surface-tertiary border border-white/[0.08] rounded-md px-2 py-0.5 text-[10px] text-app-text min-w-[120px]"
          >
            <option value="">All brands</option>
            {brandList.map((b) => (
              <option key={b.id} value={b.id}>
                {b.brand_name}
              </option>
            ))}
          </select>
        </>
      )}
      <button
        type="button"
        onClick={onRefresh}
        disabled={loading}
        className="ml-auto flex items-center gap-1 rounded-md border border-white/[0.08] px-2 py-0.5 text-[10px] text-app-muted hover:text-app-text hover:bg-app-surface-tertiary disabled:opacity-50"
      >
        <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
        Refresh
      </button>
    </div>
  );
}
