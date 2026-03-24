import React, { useState, useRef, useEffect } from 'react';
import {
  Filter,
  Grid3X3,
  List,
  Plus,
  Lock,
  Briefcase,
  Zap,
  ChevronDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export type MarketplaceTab = 'opportunity-hub' | 'tasks';
export type MarketplaceFilter = 'all' | 'projects' | 'side_ops' | 'mspd';

export interface AdvancedFilterOptions {
  department: string;
  skill: string;
  timeCommitment: string;
  xpRange: string;
  status: string;
}

export interface MarketplaceNavBarProps {
  activeTab: MarketplaceTab;
  activeFilter: MarketplaceFilter;
  viewMode: 'grid' | 'list';
  onTabChange: (tab: MarketplaceTab) => void;
  onFilterChange: (filter: MarketplaceFilter) => void;
  onViewModeChange: (mode: 'grid' | 'list') => void;
  onPropose: () => void;
  myItemsCount?: number;
  onAdvancedFiltersChange?: (filters: AdvancedFilterOptions) => void;
  /** Initial values for the advanced filters panel (e.g. from parent state). */
  initialFilterOptions?: Partial<AdvancedFilterOptions>;
  /** Options for the Skill dropdown (e.g. from API). */
  skillOptions?: string[];
}

const MAIN_TABS: { id: MarketplaceTab; label: string }[] = [
  { id: 'opportunity-hub', label: 'Opportunity Hub' },
  { id: 'tasks', label: 'Tasks' },
];

const FILTER_TABS: { id: MarketplaceFilter; label: string; icon: React.ComponentType<{ className?: string }> | null; locked?: boolean }[] = [
  { id: 'all', label: 'All', icon: null },
  { id: 'projects', label: 'Projects', icon: Briefcase },
  { id: 'side_ops', label: 'Side Ops', icon: Zap },
  { id: 'mspd', label: 'MSPD', icon: Lock, locked: true },
];

const DEPARTMENTS = ['', 'engineering', 'product', 'design', 'marketing', 'sales', 'operations'];

export function MarketplaceNavBar({
  activeTab,
  activeFilter,
  viewMode,
  onTabChange,
  onFilterChange,
  onViewModeChange,
  onPropose,
  myItemsCount = 0,
  onAdvancedFiltersChange,
  initialFilterOptions,
  skillOptions = [],
}: MarketplaceNavBarProps) {
  const [showFilters, setShowFilters] = useState(false);
  const [filterOptions, setFilterOptions] = useState<AdvancedFilterOptions>({
    department: initialFilterOptions?.department ?? '',
    skill: initialFilterOptions?.skill ?? '',
    timeCommitment: initialFilterOptions?.timeCommitment ?? '',
    xpRange: initialFilterOptions?.xpRange ?? '',
    status: initialFilterOptions?.status ?? '',
  });
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (initialFilterOptions)
      setFilterOptions((prev) => ({
        ...prev,
        ...initialFilterOptions,
      }));
  }, [initialFilterOptions?.department, initialFilterOptions?.skill, initialFilterOptions?.timeCommitment, initialFilterOptions?.xpRange, initialFilterOptions?.status]);

  useEffect(() => {
    if (!showFilters) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setShowFilters(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showFilters]);

  const activeFilterCount = [filterOptions.department, filterOptions.skill, filterOptions.timeCommitment, filterOptions.xpRange, filterOptions.status].filter(Boolean).length;

  const handleApplyFilters = () => {
    onAdvancedFiltersChange?.(filterOptions);
    setShowFilters(false);
  };

  const handleClearFilters = () => {
    setFilterOptions({ department: '', skill: '', timeCommitment: '', xpRange: '', status: '' });
  };

  return (
    <div className="flex items-center justify-between gap-4 py-3 px-4 border-b border-app-border bg-app-sidebar flex-shrink-0">
      {/* Left: Main Tabs */}
      <div className="flex items-center shrink-0">
        <div className="flex items-center bg-app-surface-tertiary rounded-lg p-1 border border-app-border">
          {MAIN_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => onTabChange(tab.id)}
              className={cn(
                'px-4 py-2 text-sm font-medium rounded-md transition-all whitespace-nowrap',
                activeTab === tab.id
                  ? 'bg-app-nav-active-bg text-app-nav-active-text'
                  : 'text-app-muted hover:text-app hover:bg-app-hover'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Center: Filter Pills */}
      <div className="flex items-center min-w-0 flex-1 justify-center overflow-hidden">
        <div className="flex items-center bg-app-surface-tertiary rounded-lg p-1 border border-app-border max-w-full">
          {FILTER_TABS.map((filter) => {
            const Icon = filter.icon;
            return (
              <button
                key={filter.id}
                type="button"
                onClick={() => onFilterChange(filter.id)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-all shrink-0 min-w-0',
                  filter.locked
                    ? activeFilter === filter.id
                      ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                      : 'text-amber-400/80 hover:bg-amber-500/10 hover:text-amber-400 border border-transparent'
                    : activeFilter === filter.id
                      ? 'bg-primary-500 text-app-text'
                      : 'text-app-muted hover:text-app hover:bg-app-hover'
                )}
              >
                {Icon && (
                  <Icon className={cn('w-3.5 h-3.5 shrink-0', filter.locked && 'text-amber-400')} />
                )}
                <span className="truncate">{filter.label}</span>
                {filter.id === 'mspd' && myItemsCount > 0 && (
                  <span
                    className={cn(
                      'ml-1 px-1.5 py-0.5 text-xs rounded-full shrink-0',
                      activeFilter === filter.id ? 'bg-white/20 text-app-text' : 'bg-app-hover text-app-muted'
                    )}
                  >
                    {myItemsCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Right: Filters dropdown, View toggle, Propose */}
      <div className="flex items-center gap-2 shrink-0">
        <div className="relative" ref={panelRef}>
          <button
            type="button"
            onClick={() => setShowFilters(!showFilters)}
            className={cn(
              'flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border transition-all h-9',
              showFilters || activeFilterCount > 0
                ? 'bg-primary-500/10 border-primary-500 text-primary-400'
                : 'bg-app-surface-tertiary border-app-border text-app-muted hover:text-app hover:border-app-border'
            )}
          >
            <Filter className="w-4 h-4 shrink-0" />
            <span>Filters</span>
            {activeFilterCount > 0 && (
              <span className="w-5 h-5 flex items-center justify-center bg-primary-500 text-app-text text-xs rounded-full shrink-0">
                {activeFilterCount}
              </span>
            )}
            <ChevronDown className={cn('w-4 h-4 shrink-0 transition-transform', showFilters && 'rotate-180')} />
          </button>

          {showFilters && (
            <div className="absolute top-full right-0 mt-2 w-72 bg-app-card border border-app-border rounded-xl shadow-lg z-50 p-4">
              <div className="flex items-center justify-between mb-4">
                <span className="text-app font-medium text-sm">Advanced Filters</span>
                <button
                  type="button"
                  onClick={handleClearFilters}
                  className="text-xs text-app-muted hover:text-app"
                >
                  Clear all
                </button>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="text-app-muted text-xs mb-1 block">Department</label>
                  <select
                    value={filterOptions.department}
                    onChange={(e) => setFilterOptions((f) => ({ ...f, department: e.target.value }))}
                    className="w-full h-8 rounded-lg bg-app-surface-tertiary border border-app-border px-3 py-1.5 text-sm text-app focus:outline-none focus:ring-1 focus:ring-primary-500"
                  >
                    <option value="">All Departments</option>
                    {DEPARTMENTS.filter(Boolean).map((d) => (
                      <option key={d} value={d}>
                        {d.charAt(0).toUpperCase() + d.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-app-muted text-xs mb-1 block">Skill</label>
                  <select
                    value={filterOptions.skill}
                    onChange={(e) => setFilterOptions((f) => ({ ...f, skill: e.target.value }))}
                    className="w-full h-8 rounded-lg bg-app-surface-tertiary border border-app-border px-3 py-1.5 text-sm text-app focus:outline-none focus:ring-1 focus:ring-primary-500"
                  >
                    <option value="">All Skills</option>
                    {skillOptions.map((s) => (
                      <option key={s} value={s}>
                        #{s}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-app-muted text-xs mb-1 block">Time Commitment</label>
                  <select
                    value={filterOptions.timeCommitment}
                    onChange={(e) => setFilterOptions((f) => ({ ...f, timeCommitment: e.target.value }))}
                    className="w-full h-8 rounded-lg bg-app-surface-tertiary border border-app-border px-3 py-1.5 text-sm text-app focus:outline-none focus:ring-1 focus:ring-primary-500"
                  >
                    <option value="">Any</option>
                    <option value="low">Low (1-5 hrs/wk)</option>
                    <option value="medium">Medium (5-15 hrs/wk)</option>
                    <option value="high">High (15-30 hrs/wk)</option>
                    <option value="full">Full-time (30+ hrs/wk)</option>
                  </select>
                </div>

                <div>
                  <label className="text-app-muted text-xs mb-1 block">XP Reward</label>
                  <select
                    value={filterOptions.xpRange}
                    onChange={(e) => setFilterOptions((f) => ({ ...f, xpRange: e.target.value }))}
                    className="w-full h-8 rounded-lg bg-app-surface-tertiary border border-app-border px-3 py-1.5 text-sm text-app focus:outline-none focus:ring-1 focus:ring-primary-500"
                  >
                    <option value="">Any XP</option>
                    <option value="0-100">0 - 100 XP</option>
                    <option value="100-250">100 - 250 XP</option>
                    <option value="250-500">250 - 500 XP</option>
                    <option value="500+">500+ XP</option>
                  </select>
                </div>

                <div>
                  <label className="text-app-muted text-xs mb-1 block">Status</label>
                  <select
                    value={filterOptions.status}
                    onChange={(e) => setFilterOptions((f) => ({ ...f, status: e.target.value }))}
                    className="w-full h-8 rounded-lg bg-app-surface-tertiary border border-app-border px-3 py-1.5 text-sm text-app focus:outline-none focus:ring-1 focus:ring-primary-500"
                  >
                    <option value="">All</option>
                    <option value="recruiting">Recruiting</option>
                    <option value="active">Active</option>
                    <option value="hot">Hot</option>
                    <option value="double-xp">2x XP</option>
                  </select>
                </div>
              </div>

              <button
                type="button"
                onClick={handleApplyFilters}
                className="w-full mt-4 py-2 rounded-lg text-sm font-medium bg-primary-500 hover:bg-primary-600 text-app-text transition-colors"
              >
                Apply Filters
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center bg-app-surface-tertiary rounded-lg p-1 border border-app-border">
          <button
            type="button"
            onClick={() => onViewModeChange('grid')}
            className={cn(
              'p-2 rounded-md transition-all',
              viewMode === 'grid' ? 'bg-app-nav-active-bg text-app-nav-active-text' : 'text-app-muted hover:text-app'
            )}
            title="Grid view"
          >
            <Grid3X3 className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => onViewModeChange('list')}
            className={cn(
              'p-2 rounded-md transition-all',
              viewMode === 'list' ? 'bg-app-nav-active-bg text-app-nav-active-text' : 'text-app-muted hover:text-app'
            )}
            title="List view"
          >
            <List className="w-4 h-4" />
          </button>
        </div>

        <button
          type="button"
          onClick={onPropose}
          className="flex items-center gap-2 bg-primary-500 hover:bg-primary-600 text-app-text px-4 py-2 rounded-lg text-sm font-medium transition-colors h-9 shrink-0"
        >
          <Plus className="w-4 h-4 shrink-0" />
          <span>Propose</span>
        </button>
      </div>
    </div>
  );
}
