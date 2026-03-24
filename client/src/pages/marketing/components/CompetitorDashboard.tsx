import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Radar, Settings2, ChevronDown, Download, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import {
  marketingAPI,
  type CompetitorClient,
  type CompetitorEventClient,
  type CompetitorStatsResponse,
} from '@/lib/marketingApi';
import { useAuthStore } from '@/stores/authStore';
import { SlideOverPanel } from '@/components/ui/SlideOverPanel';
import { CompetitorEventCard } from './CompetitorEventCard';
import { CompetitorManager } from './CompetitorManager';

const TIME_RANGES = [
  { value: 'last_week', label: 'Last Week', days: 7 },
  { value: 'last_month', label: 'Last Month', days: 30 },
  { value: 'last_quarter', label: 'Last Quarter', days: 90 },
  { value: 'last_year', label: 'Last Year', days: 365 },
] as const;

const EVENT_TYPE_OPTIONS = [
  { value: '', label: 'All Types' },
  { value: 'product_launch', label: 'Product Launch' },
  { value: 'blog_post', label: 'Blog Post' },
  { value: 'pricing_change', label: 'Pricing Change' },
  { value: 'feature_update', label: 'Feature Update' },
  { value: 'partnership', label: 'Partnership' },
  { value: 'funding', label: 'Funding' },
  { value: 'email_campaign', label: 'Email Campaign' },
  { value: 'press_release', label: 'Press Release' },
  { value: 'social_post', label: 'Social Post' },
  { value: 'other', label: 'Other' },
] as const;

const SIGNIFICANCE_OPTIONS = [
  { value: '', label: 'All significance' },
  { value: 'low', label: 'Low' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High' },
  { value: 'critical', label: 'Critical' },
] as const;

const TIER_COLORS: Record<string, string> = {
  direct: 'bg-blue-500/15 text-blue-400',
  indirect: 'bg-gray-500/15 text-app-muted',
  aspirational: 'bg-purple-500/15 text-purple-400',
};

function sinceFromRange(days: number): string {
  return new Date(Date.now() - days * 86400000).toISOString();
}

function formatFreshness(lastScraped: string | null): string {
  if (!lastScraped) return 'Never';
  const hours = Math.floor((Date.now() - new Date(lastScraped).getTime()) / 3600000);
  if (hours < 1) return 'Just now';
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 300;
const POLL_INTERVAL_MS = 3000;
const POLL_MAX_TICKS = 20;

function escapeCsvCell(s: string): string {
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function exportEventsCsv(events: CompetitorEventClient[], filename: string): void {
  const header = ['discovered_at', 'competitor', 'type', 'significance', 'title', 'summary', 'source_url'];
  const rows = events.map((e) => [
    e.discovered_at,
    e.competitor_name ?? '',
    e.event_type,
    e.significance,
    e.title,
    e.summary ?? '',
    e.source_url ?? '',
  ]);
  const csv = [header.join(','), ...rows.map((r) => r.map((c) => escapeCsvCell(String(c))).join(','))].join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function CompetitorDashboard() {
  const { user } = useAuthStore();
  const userId = user?.authUserId || user?.id || '';

  const [timeRange, setTimeRange] = useState<string>('last_month');
  const [selectedCompetitor, setSelectedCompetitor] = useState<string | null>(null);
  const [selectedEventType, setSelectedEventType] = useState<string>('');
  const [significanceFilter, setSignificanceFilter] = useState<string>('');
  const [searchInput, setSearchInput] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');
  const [events, setEvents] = useState<CompetitorEventClient[]>([]);
  const [totalEvents, setTotalEvents] = useState(0);
  const [competitors, setCompetitors] = useState<CompetitorClient[]>([]);
  const [stats, setStats] = useState<CompetitorStatsResponse | null>(null);
  const [significantEvents, setSignificantEvents] = useState<CompetitorEventClient[]>([]);
  const [isManagerOpen, setIsManagerOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const rangeDays = useMemo(() => TIME_RANGES.find((r) => r.value === timeRange)?.days ?? 30, [timeRange]);
  const sinceIso = useMemo(() => sinceFromRange(rangeDays), [rangeDays]);

  useEffect(() => {
    const t = window.setTimeout(() => setSearchDebounced(searchInput.trim()), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, []);

  const fetchCompetitors = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await marketingAPI.listCompetitors(userId);
      setCompetitors(res.competitors);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load competitors');
    }
  }, [userId]);

  const fetchStats = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await marketingAPI.getCompetitorStats(userId, sinceIso);
      setStats(res);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load stats');
    }
  }, [userId, sinceIso]);

  const fetchSignificantStrip = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await marketingAPI.getSignificantCompetitorEvents(userId, sinceIso);
      setSignificantEvents(res.events.slice(0, 8));
    } catch {
      setSignificantEvents([]);
    }
  }, [userId, sinceIso]);

  const eventsOffsetRef = useRef(0);

  const fetchEvents = useCallback(
    async (reset = true) => {
      if (!userId) return;
      if (reset) {
        setIsLoading(true);
        eventsOffsetRef.current = 0;
      } else {
        setLoadingMore(true);
      }

      const offset = reset ? 0 : eventsOffsetRef.current;

      try {
        const res = await marketingAPI.queryCompetitorEvents(userId, {
          competitor_id: selectedCompetitor || undefined,
          event_type: selectedEventType || undefined,
          significance: significanceFilter || undefined,
          since: sinceIso,
          limit: PAGE_SIZE,
          offset,
        });
        if (reset) {
          setEvents(res.events);
        } else {
          setEvents((prev) => [...prev, ...res.events]);
        }
        eventsOffsetRef.current = offset + res.events.length;
        setTotalEvents(res.total);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Failed to load events');
      }

      setIsLoading(false);
      setLoadingMore(false);
    },
    [userId, selectedCompetitor, selectedEventType, significanceFilter, sinceIso],
  );

  useEffect(() => {
    fetchCompetitors();
  }, [fetchCompetitors]);

  useEffect(() => {
    fetchStats();
    fetchSignificantStrip();
  }, [fetchStats, fetchSignificantStrip]);

  useEffect(() => {
    void fetchEvents(true);
  }, [fetchEvents]);

  const stopPostScrapePoll = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const startPostScrapePoll = useCallback(
    async (baselineFingerprint: string) => {
      stopPostScrapePoll();
      let ticks = 0;
      pollTimerRef.current = setInterval(async () => {
        ticks += 1;
        try {
          const list = await marketingAPI.listCompetitors(userId);
          setCompetitors(list.competitors);
          const fp = list.competitors.map((c) => `${c.id}:${c.last_scraped_at}:${c.last_scrape_summary?.finishedAt ?? ''}`).join('|');
          await fetchStats();
          await fetchSignificantStrip();
          await fetchEvents(true);
          if (fp !== baselineFingerprint || ticks >= POLL_MAX_TICKS) {
            stopPostScrapePoll();
          }
        } catch {
          if (ticks >= POLL_MAX_TICKS) stopPostScrapePoll();
        }
      }, POLL_INTERVAL_MS);
    },
    [userId, fetchStats, fetchSignificantStrip, fetchEvents, stopPostScrapePoll],
  );

  const handleScrapeAll = async () => {
    if (!userId) return;
    try {
      const pre = await marketingAPI.listCompetitors(userId);
      const baselineFingerprint = pre.competitors
        .map((c) => `${c.id}:${c.last_scraped_at}:${c.last_scrape_summary?.finishedAt ?? ''}`)
        .join('|');
      const res = await marketingAPI.triggerScrapeAll(userId);
      toast.success(res.message);
      await startPostScrapePoll(baselineFingerprint);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Scrape failed');
    }
  };

  const eventCountByCompetitor = useMemo(() => {
    const map = new Map<string, number>();
    if (stats?.per_competitor) {
      for (const row of stats.per_competitor) {
        map.set(row.competitor_id, row.event_count);
      }
    }
    return map;
  }, [stats]);

  const filteredEvents = useMemo(() => {
    if (!searchDebounced) return events;
    const q = searchDebounced.toLowerCase();
    return events.filter((ev) => {
      const title = (ev.title || '').toLowerCase();
      const summary = (ev.summary || '').toLowerCase();
      const name = (ev.competitor_name || '').toLowerCase();
      return title.includes(q) || summary.includes(q) || name.includes(q);
    });
  }, [events, searchDebounced]);

  const significantInRangeCount = significantEvents.length;

  const totalForAllChip = stats?.total_events ?? totalEvents;

  const hasMore = events.length < totalEvents;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="shrink-0 px-6 py-4 border-b border-app-border">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-app-text">Competitor Intelligence</h2>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setIsManagerOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-app-hover text-app-text hover:bg-app-card"
            >
              <Settings2 className="w-3.5 h-3.5" /> Manage
            </button>
            <button
              type="button"
              onClick={handleScrapeAll}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-primary-500/10 text-primary-400 hover:bg-primary-500/20"
            >
              <Radar className="w-3.5 h-3.5" /> Scrape All
            </button>
          </div>
        </div>

        {/* KPI row */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
            <div className="rounded-lg border border-app-border bg-app-card/40 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-app-muted">Events in range</p>
              <p className="text-lg font-semibold text-app-text">{stats.total_events}</p>
            </div>
            <div className="rounded-lg border border-app-border bg-app-card/40 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-app-muted">Tracked</p>
              <p className="text-lg font-semibold text-app-text">{competitors.length}</p>
            </div>
            <div className="rounded-lg border border-app-border bg-app-card/40 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-app-muted">High / critical (strip)</p>
              <p className="text-lg font-semibold text-app-text">{significantInRangeCount}</p>
            </div>
            <div className="rounded-lg border border-app-border bg-app-card/40 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-app-muted">Listed below</p>
              <p className="text-lg font-semibold text-app-text">{filteredEvents.length}</p>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <select
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value)}
              className="appearance-none rounded-lg border border-app-border bg-app-card px-3 py-1.5 pr-7 text-xs text-app-text focus:outline-none focus:ring-1 focus:ring-primary-500"
            >
              {TIME_RANGES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-app-muted pointer-events-none" />
          </div>
          <div className="relative">
            <select
              value={selectedEventType}
              onChange={(e) => setSelectedEventType(e.target.value)}
              className="appearance-none rounded-lg border border-app-border bg-app-card px-3 py-1.5 pr-7 text-xs text-app-text focus:outline-none focus:ring-1 focus:ring-primary-500"
            >
              {EVENT_TYPE_OPTIONS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-app-muted pointer-events-none" />
          </div>
          <div className="relative">
            <select
              value={significanceFilter}
              onChange={(e) => setSignificanceFilter(e.target.value)}
              className="appearance-none rounded-lg border border-app-border bg-app-card px-3 py-1.5 pr-7 text-xs text-app-text focus:outline-none focus:ring-1 focus:ring-primary-500"
            >
              {SIGNIFICANCE_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-app-muted pointer-events-none" />
          </div>
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search title, summary…"
            className="rounded-lg border border-app-border bg-app-card px-3 py-1.5 text-xs text-app-text placeholder:text-app-muted/60 focus:outline-none focus:ring-1 focus:ring-primary-500 min-w-[180px] flex-1 max-w-xs"
          />
          {filteredEvents.length > 0 && (
            <button
              type="button"
              onClick={() =>
                exportEventsCsv(
                  filteredEvents,
                  `competitor-events-${new Date().toISOString().slice(0, 10)}.csv`,
                )
              }
              className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs text-app-muted hover:text-app-text border border-app-border"
            >
              <Download className="w-3.5 h-3.5" /> CSV
            </button>
          )}
        </div>
      </div>

      {/* Significant events strip */}
      {significantEvents.length > 0 && (
        <div className="shrink-0 px-6 py-2 border-b border-app-border bg-primary-500/5">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-3.5 h-3.5 text-primary-400" />
            <span className="text-xs font-medium text-app-text">Significant this period</span>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {significantEvents.map((ev) => (
              <div
                key={ev.id}
                className="shrink-0 max-w-[220px] rounded-lg border border-app-border bg-app-card/80 px-2 py-1.5"
              >
                <p className="text-[10px] text-app-muted truncate">{ev.competitor_name ?? 'Competitor'}</p>
                <p className="text-xs text-app-text line-clamp-2">{ev.title}</p>
                <span className="text-[9px] text-primary-400">{ev.significance}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Competitor Cards Row */}
      {competitors.length > 0 && (
        <div className="shrink-0 px-6 py-3 border-b border-app-border overflow-x-auto">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setSelectedCompetitor(null)}
              className={`shrink-0 px-3 py-2 rounded-lg border text-xs font-medium transition-colors ${
                selectedCompetitor === null
                  ? 'border-primary-500 bg-primary-500/10 text-primary-400'
                  : 'border-app-border bg-app-card/50 text-app-muted hover:bg-app-card'
              }`}
            >
              All ({totalForAllChip})
            </button>
            {competitors.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelectedCompetitor(selectedCompetitor === c.id ? null : c.id)}
                className={`shrink-0 px-3 py-2 rounded-lg border text-left transition-colors ${
                  selectedCompetitor === c.id
                    ? 'border-primary-500 bg-primary-500/10'
                    : 'border-app-border bg-app-card/50 hover:bg-app-card'
                }`}
              >
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="text-xs font-medium text-app-text">{c.name}</span>
                  <span className={`px-1.5 py-0.5 rounded-full text-[9px] ${TIER_COLORS[c.tier] || TIER_COLORS.indirect}`}>
                    {c.tier}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-[10px] text-app-muted">
                  <span>{eventCountByCompetitor.get(c.id) ?? 0} events</span>
                  <span>{formatFreshness(c.last_scraped_at)}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Event Timeline */}
      <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-5 w-5 animate-spin text-primary-400" />
          </div>
        ) : filteredEvents.length === 0 ? (
          <div className="text-center py-16">
            <Radar className="w-10 h-10 mx-auto mb-3 text-app-muted/40" />
            <p className="text-sm text-app-muted mb-1">No competitor events found</p>
            <p className="text-xs text-app-muted/60">
              {competitors.length === 0
                ? 'Add competitors and run a scrape to start monitoring.'
                : searchDebounced
                  ? 'No matches for your search in this list. Load more or clear search.'
                  : 'Try expanding the time range or adjusting filters.'}
            </p>
          </div>
        ) : (
          <div className="space-y-3 max-w-2xl">
            {filteredEvents.map((event) => (
              <CompetitorEventCard key={event.id} event={event} showCompetitorName={!selectedCompetitor} />
            ))}
            {hasMore && !searchDebounced && (
              <div className="text-center pt-2">
                <button
                  type="button"
                  onClick={() => fetchEvents(false)}
                  disabled={loadingMore}
                  className="px-4 py-2 rounded-lg text-xs font-medium bg-app-hover text-app-muted hover:text-app-text disabled:opacity-50"
                >
                  {loadingMore ? <Loader2 className="w-3 h-3 animate-spin inline mr-1" /> : null}
                  Load More ({totalEvents - events.length} remaining)
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Manager Slide-Over */}
      <SlideOverPanel
        isOpen={isManagerOpen}
        onClose={() => {
          setIsManagerOpen(false);
          fetchCompetitors();
          fetchStats();
          fetchEvents(true);
        }}
        title="Manage Competitors"
      >
        <CompetitorManager
          onViewEvents={(id) => {
            setSelectedCompetitor(id);
            setIsManagerOpen(false);
          }}
        />
      </SlideOverPanel>
    </div>
  );
}
