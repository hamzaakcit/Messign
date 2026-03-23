import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Radar, Settings2, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { marketingAPI, type CompetitorClient, type CompetitorEventClient } from '@/lib/marketingApi';
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

const TIER_COLORS: Record<string, string> = {
  direct: 'bg-blue-500/15 text-blue-400',
  indirect: 'bg-gray-500/15 text-gray-400',
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

export function CompetitorDashboard() {
  const { user } = useAuthStore();
  const userId = user?.authUserId || user?.id || '';

  const [timeRange, setTimeRange] = useState<string>('last_month');
  const [selectedCompetitor, setSelectedCompetitor] = useState<string | null>(null);
  const [selectedEventType, setSelectedEventType] = useState<string>('');
  const [events, setEvents] = useState<CompetitorEventClient[]>([]);
  const [totalEvents, setTotalEvents] = useState(0);
  const [competitors, setCompetitors] = useState<CompetitorClient[]>([]);
  const [isManagerOpen, setIsManagerOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const rangeDays = useMemo(() => TIME_RANGES.find((r) => r.value === timeRange)?.days ?? 30, [timeRange]);

  const fetchCompetitors = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await marketingAPI.listCompetitors(userId);
      setCompetitors(res.competitors);
    } catch { /* swallow */ }
  }, [userId]);

  const fetchEvents = useCallback(async (reset = true) => {
    if (!userId) return;
    if (reset) setIsLoading(true);
    else setLoadingMore(true);

    try {
      const res = await marketingAPI.queryCompetitorEvents(userId, {
        competitor_id: selectedCompetitor || undefined,
        event_type: selectedEventType || undefined,
        since: sinceFromRange(rangeDays),
        limit: PAGE_SIZE,
        offset: reset ? 0 : events.length,
      });
      if (reset) {
        setEvents(res.events);
      } else {
        setEvents((prev) => [...prev, ...res.events]);
      }
      setTotalEvents(res.total);
    } catch {
      toast.error('Failed to load events');
    }

    setIsLoading(false);
    setLoadingMore(false);
  }, [userId, selectedCompetitor, selectedEventType, rangeDays, events.length]);

  useEffect(() => { fetchCompetitors(); }, [fetchCompetitors]);
  useEffect(() => { fetchEvents(true); }, [userId, selectedCompetitor, selectedEventType, rangeDays]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleScrapeAll = async () => {
    if (!userId) return;
    try {
      const res = await marketingAPI.triggerScrapeAll(userId);
      toast.success(res.message);
    } catch { toast.error('Scrape failed'); }
  };

  const eventCountByCompetitor = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const e of events) {
      counts[e.competitor_id] = (counts[e.competitor_id] || 0) + 1;
    }
    return counts;
  }, [events]);

  const hasMore = events.length < totalEvents;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="shrink-0 px-6 py-4 border-b border-app-border">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-app-text">Competitor Intelligence</h2>
          <div className="flex gap-2">
            <button type="button" onClick={() => setIsManagerOpen(true)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-app-hover text-app-text hover:bg-app-card">
              <Settings2 className="w-3.5 h-3.5" /> Manage
            </button>
            <button type="button" onClick={handleScrapeAll} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-primary-500/10 text-primary-400 hover:bg-primary-500/20">
              <Radar className="w-3.5 h-3.5" /> Scrape All
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3">
          <div className="relative">
            <select
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value)}
              className="appearance-none rounded-lg border border-app-border bg-app-card px-3 py-1.5 pr-7 text-xs text-app-text focus:outline-none focus:ring-1 focus:ring-primary-500"
            >
              {TIME_RANGES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-app-muted pointer-events-none" />
          </div>
          <div className="relative">
            <select
              value={selectedEventType}
              onChange={(e) => setSelectedEventType(e.target.value)}
              className="appearance-none rounded-lg border border-app-border bg-app-card px-3 py-1.5 pr-7 text-xs text-app-text focus:outline-none focus:ring-1 focus:ring-primary-500"
            >
              {EVENT_TYPE_OPTIONS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-app-muted pointer-events-none" />
          </div>
        </div>
      </div>

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
              All ({totalEvents})
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
                  <span className={`px-1.5 py-0.5 rounded-full text-[9px] ${TIER_COLORS[c.tier] || TIER_COLORS.indirect}`}>{c.tier}</span>
                </div>
                <div className="flex items-center gap-2 text-[10px] text-app-muted">
                  <span>{eventCountByCompetitor[c.id] || 0} events</span>
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
        ) : events.length === 0 ? (
          <div className="text-center py-16">
            <Radar className="w-10 h-10 mx-auto mb-3 text-app-muted/40" />
            <p className="text-sm text-app-muted mb-1">No competitor events found</p>
            <p className="text-xs text-app-muted/60">
              {competitors.length === 0
                ? 'Add competitors and run a scrape to start monitoring.'
                : 'Try expanding the time range or adjusting filters.'}
            </p>
          </div>
        ) : (
          <div className="space-y-3 max-w-2xl">
            {events.map((event) => (
              <CompetitorEventCard
                key={event.id}
                event={event}
                showCompetitorName={!selectedCompetitor}
              />
            ))}
            {hasMore && (
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
      <SlideOverPanel isOpen={isManagerOpen} onClose={() => { setIsManagerOpen(false); fetchCompetitors(); fetchEvents(true); }} title="Manage Competitors">
        <CompetitorManager onViewEvents={(id) => { setSelectedCompetitor(id); setIsManagerOpen(false); }} />
      </SlideOverPanel>
    </div>
  );
}
