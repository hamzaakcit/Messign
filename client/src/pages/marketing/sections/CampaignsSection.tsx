import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  AlertTriangle,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  DollarSign,
  Instagram,
  LayoutGrid,
  List,
  Mail,
  Megaphone,
  Plus,
  Sparkles,
  Target,
  TrendingUp,
  Wallet,
  Zap,
} from 'lucide-react';
import { useDebouncedCallback } from '@/hooks';
import { DoraInsightBar } from '@/components/dora/DoraInsightBar';
import { KPICard } from '@/components/finance/KPICard';
import { DataTable, type ColumnDef } from '@/components/ui/DataTable';
import { SlideOverPanel } from '@/components/ui/SlideOverPanel';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';
import {
  marketingAPI,
  type Campaign,
  type CampaignMetricsSummary,
  type ContentCalendarDay,
  type ContentItem,
  type DashboardMetrics,
} from '@/lib/marketingApi';
import { CampaignDetailPanel } from '../components/CampaignDetailPanel';
import { CampaignCreatePanel } from '../components/CampaignCreatePanel';
import { ContentDetailPanel } from '../components/ContentDetailPanel';
import { ContentCreatePanel } from '../components/ContentCreatePanel';

type SubTab = 'campaigns' | 'content';
type ViewMode = 'month' | 'week' | 'list';

function formatCurrency(value: number, currency = 'EUR'): string {
  return new Intl.NumberFormat('en-IE', { style: 'currency', currency }).format(value || 0);
}

function channelVariant(channel: string): 'default' | 'blue' | 'purple' | 'green' | 'orange' | 'red' {
  if (channel === 'email' || channel === 'content') return 'blue';
  if (channel === 'social' || channel === 'paid_social') return 'purple';
  if (channel === 'webinar' || channel === 'event') return 'orange';
  return 'default';
}

function statusVariant(status: string): 'default' | 'blue' | 'purple' | 'green' | 'orange' | 'red' {
  if (status === 'active' || status === 'completed') return 'green';
  if (status === 'paused' || status === 'scheduled') return 'orange';
  if (status === 'cancelled') return 'red';
  return 'default';
}

function contentVariant(t: string): 'default' | 'blue' | 'purple' | 'green' | 'orange' | 'red' {
  if (t === 'blog') return 'blue';
  if (t === 'social') return 'purple';
  if (t === 'email') return 'green';
  if (t === 'video') return 'red';
  if (t === 'webinar') return 'orange';
  return 'default';
}

function channelIcon(channel?: string | null): JSX.Element {
  const c = (channel ?? '').toLowerCase();
  if (c === 'instagram') return <Instagram className="h-3 w-3 text-pink-400" />;
  if (c === 'email') return <Mail className="h-3 w-3 text-green-400" />;
  return <Megaphone className="h-3 w-3 text-slate-400" />;
}

function channelBg(channel?: string | null): string {
  const c = (channel ?? '').toLowerCase();
  if (c === 'instagram') return 'bg-pink-500/15 text-pink-300 border-pink-500/20';
  if (c === 'email') return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/20';
  if (c === 'twitter' || c === 'x') return 'bg-sky-500/15 text-sky-300 border-sky-500/20';
  if (c === 'linkedin') return 'bg-blue-500/15 text-blue-300 border-blue-500/20';
  if (c === 'facebook') return 'bg-indigo-500/15 text-indigo-300 border-indigo-500/20';
  return 'bg-white/[0.06] text-slate-300 border-white/[0.08]';
}

function startOfCalendarMonth(year: number, monthIndex: number): Date {
  const first = new Date(year, monthIndex, 1);
  const day = (first.getDay() + 6) % 7;
  const start = new Date(first);
  start.setDate(first.getDate() - day);
  return start;
}

function startOfCalendarWeek(date: Date): Date {
  const d = new Date(date);
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}

const todayKey = new Date().toISOString().slice(0, 10);

export function CampaignsSection(): JSX.Element {
  const [searchParams] = useSearchParams();
  const { user } = useAuthStore();
  const userId = user?.authUserId || user?.id || '';

  const initialTab = searchParams.get('tab') === 'content' ? 'content' : 'campaigns';
  const [subTab, setSubTab] = useState<SubTab>(initialTab);

  return (
    <>
      <DoraInsightBar module="marketing" fallback="Dora tracks campaign ROI and identifies your highest-performing channels." />

      <div className="flex items-center gap-1 mb-4">
        {(['campaigns', 'content'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setSubTab(t)}
            className={cn(
              'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
              subTab === t
                ? 'bg-primary-500/20 text-primary-400'
                : 'text-app-muted hover:text-app-text hover:bg-white/5',
            )}
          >
            {t === 'campaigns' ? 'Campaigns' : 'Content Calendar'}
          </button>
        ))}
      </div>

      {subTab === 'campaigns' ? (
        <CampaignsTab userId={userId} />
      ) : (
        <ContentCalendarTab userId={userId} />
      )}
    </>
  );
}

function CampaignsTab({ userId }: { userId: string }): JSX.Element {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState<CampaignMetricsSummary | null>(null);
  const [dashboard, setDashboard] = useState<DashboardMetrics | null>(null);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [filters, setFilters] = useState({
    status: '',
    channel: '',
    search: '',
    dateFrom: '',
    dateTo: '',
  });

  const fetchData = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const queryFilters: Record<string, string> = { page: String(page + 1), pageSize: '20' };
      if (filters.status) queryFilters.status = filters.status;
      if (filters.channel) queryFilters.channel = filters.channel;
      if (filters.search) queryFilters.search = filters.search;
      if (filters.dateFrom) queryFilters.dateFrom = filters.dateFrom;
      if (filters.dateTo) queryFilters.dateTo = filters.dateTo;

      const [campaignRes, metricsRes, dashboardRes] = await Promise.all([
        marketingAPI.listCampaigns(userId, queryFilters),
        marketingAPI.getCampaignMetrics(userId),
        marketingAPI.getDashboardMetrics(userId),
      ]);
      setCampaigns(campaignRes.data);
      setTotal(campaignRes.total);
      setMetrics(metricsRes);
      setDashboard(dashboardRes);
    } finally {
      setLoading(false);
    }
  }, [filters, page, userId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const debouncedSearch = useDebouncedCallback((search: string) => {
    setFilters((c) => ({ ...c, search }));
  }, 300);

  const columns = useMemo<ColumnDef<Campaign>[]>(() => [
    { key: 'name', header: 'Name', sortable: true, render: (_v, row) => <span className="font-medium text-app-text">{row.name}</span> },
    { key: 'channel', header: 'Channel', render: (v) => <Badge variant={channelVariant(String(v))}>{String(v)}</Badge> },
    { key: 'status', header: 'Status', render: (v) => <Badge variant={statusVariant(String(v))}>{String(v)}</Badge> },
    { key: 'budget_eur', header: 'Budget', render: (v, row) => formatCurrency(Number(v), row.currency) },
    { key: 'actual_spend_eur', header: 'Spend', render: (v, row) => formatCurrency(Number(v), row.currency) },
    { key: 'leads_generated', header: 'Leads', sortable: true },
    { key: 'cost_per_lead', header: 'CPL', render: (v, row) => formatCurrency(Number(v ?? 0), row.currency) },
    { key: 'roi', header: 'ROI', sortable: true, render: (v) => { const roi = Number(v ?? 0); const color = roi > 2 ? 'text-emerald-300' : roi >= 1 ? 'text-amber-300' : 'text-red-300'; return <span className={color}>{roi.toFixed(2)}x</span>; } },
    { key: 'owner_name', header: 'Owner' },
    { key: 'start_date', header: 'Dates', render: (_v, row) => `${row.start_date || 'TBD'} - ${row.end_date || 'TBD'}` },
  ], []);

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <KPICard title="MQLs Generated" value={dashboard?.mqls ?? 0} icon={Target} />
        <KPICard title="Avg Campaign ROI" value={`${(metrics?.avgROI ?? 0).toFixed(2)}x`} icon={TrendingUp} />
        <KPICard title="CAC" value={formatCurrency(dashboard?.cac ?? 0)} icon={DollarSign} />
        <KPICard title="Active Campaigns" value={metrics?.activeCampaigns ?? 0} icon={Megaphone} />
        <KPICard title="Total Spend" value={formatCurrency(metrics?.totalSpend ?? 0)} icon={Wallet} />
      </div>

      <div className="flex items-end justify-between gap-4 mb-4 flex-wrap">
        <div className="flex items-end gap-3 flex-wrap">
          <div>
            <label className="block text-xs text-app-muted mb-1">Status</label>
            <select className="rounded-lg border border-app-border bg-app-card px-3 py-2 text-sm text-app-text" value={filters.status} onChange={(e) => setFilters((c) => ({ ...c, status: e.target.value }))}>
              <option value="">All</option>
              <option value="draft">Draft</option>
              <option value="scheduled">Scheduled</option>
              <option value="active">Active</option>
              <option value="paused">Paused</option>
              <option value="completed">Completed</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-app-muted mb-1">Channel</label>
            <select className="rounded-lg border border-app-border bg-app-card px-3 py-2 text-sm text-app-text" value={filters.channel} onChange={(e) => setFilters((c) => ({ ...c, channel: e.target.value }))}>
              <option value="">All</option>
              <option value="email">Email</option>
              <option value="social">Social</option>
              <option value="paid_search">Paid Search</option>
              <option value="paid_social">Paid Social</option>
              <option value="content">Content</option>
              <option value="event">Event</option>
              <option value="webinar">Webinar</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-app-muted mb-1">From</label>
            <input className="rounded-lg border border-app-border bg-app-card px-3 py-2 text-sm text-app-text" type="date" value={filters.dateFrom} onChange={(e) => setFilters((c) => ({ ...c, dateFrom: e.target.value }))} />
          </div>
          <div>
            <label className="block text-xs text-app-muted mb-1">To</label>
            <input className="rounded-lg border border-app-border bg-app-card px-3 py-2 text-sm text-app-text" type="date" value={filters.dateTo} onChange={(e) => setFilters((c) => ({ ...c, dateTo: e.target.value }))} />
          </div>
        </div>
        <button onClick={() => setCreateOpen(true)} className="px-3 py-2 rounded-lg text-sm font-medium bg-primary-500 text-white hover:bg-primary-600 flex items-center gap-1.5">
          <Plus className="w-4 h-4" />
          New Campaign
        </button>
      </div>

      <DataTable
        data={campaigns}
        columns={columns}
        isLoading={loading}
        sortable
        searchable
        searchPlaceholder="Search campaigns\u2026"
        onSearch={debouncedSearch}
        pagination
        pageSize={20}
        totalItems={total}
        currentPage={page}
        onPageChange={setPage}
        onRowClick={(row) => setSelectedCampaignId(row.id)}
        emptyMessage="No campaigns found yet."
      />

      <SlideOverPanel isOpen={!!selectedCampaignId} onClose={() => setSelectedCampaignId(null)} title="Campaign Detail" width={760}>
        {selectedCampaignId && <CampaignDetailPanel campaignId={selectedCampaignId} onUpdated={fetchData} />}
      </SlideOverPanel>

      <SlideOverPanel isOpen={createOpen} onClose={() => setCreateOpen(false)} title="New Campaign" width={520}>
        <CampaignCreatePanel onCreated={() => { setCreateOpen(false); void fetchData(); }} onCancel={() => setCreateOpen(false)} />
      </SlideOverPanel>
    </>
  );
}

function ContentCalendarTab({ userId }: { userId: string }): JSX.Element {
  const [searchParams, setSearchParams] = useSearchParams();
  const [anchorDate, setAnchorDate] = useState(() => new Date());
  const [calendar, setCalendar] = useState<ContentCalendarDay[]>([]);
  const [list, setList] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedContentId, setSelectedContentId] = useState<string | null>(null);
  const [createDate, setCreateDate] = useState<string | null>(null);
  const [draggedContentId, setDraggedContentId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [autoScheduling, setAutoScheduling] = useState(false);

  const month = anchorDate.getMonth() + 1;
  const year = anchorDate.getFullYear();

  const fetchData = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const monthString = String(month).padStart(2, '0');
      const startDate = `${year}-${monthString}-01`;
      const endDate = new Date(year, month, 0).toISOString().slice(0, 10);
      const [calendarRes, listRes] = await Promise.all([
        marketingAPI.getCalendarView(userId, month, year),
        marketingAPI.listContent(userId, { dateFrom: startDate, dateTo: endDate, pageSize: '100' }),
      ]);
      setCalendar(calendarRes);
      setList(listRes.data);
    } finally {
      setLoading(false);
    }
  }, [month, userId, year]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const contentIdFromUrl = searchParams.get('contentId');
  useEffect(() => {
    if (contentIdFromUrl) setSelectedContentId(contentIdFromUrl);
  }, [contentIdFromUrl]);

  const calendarMap = useMemo(() => {
    const map = new Map<string, ContentItem[]>();
    calendar.forEach((day) => map.set(day.date, day.items));
    return map;
  }, [calendar]);

  const gridDays = useMemo(() => {
    const start = startOfCalendarMonth(year, month - 1);
    return Array.from({ length: 35 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      const key = date.toISOString().slice(0, 10);
      return { date: key, inMonth: date.getMonth() === month - 1, items: calendarMap.get(key) ?? [] };
    });
  }, [calendarMap, month, year]);

  const weekDays = useMemo(() => {
    const start = startOfCalendarWeek(anchorDate);
    return Array.from({ length: 7 }, (_, i) => {
      const date = new Date(start);
      date.setDate(start.getDate() + i);
      const key = date.toISOString().slice(0, 10);
      return { date: key, inMonth: date.getMonth() === month - 1, items: calendarMap.get(key) ?? [] };
    });
  }, [calendarMap, anchorDate, month]);

  const handleAutoSchedule = async (contentId: string) => {
    setAutoScheduling(true);
    try {
      const bestTimes = await marketingAPI.getBestTimesToPost(userId, { topN: 1 });
      const slot = bestTimes.data.topSlots[0];
      if (!slot) { toast.error('No optimal slot found'); return; }
      const now = new Date();
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const targetDayIdx = dayNames.indexOf(slot.day);
      const currentDay = now.getDay();
      let daysAhead = targetDayIdx - currentDay;
      if (daysAhead <= 0) daysAhead += 7;
      const targetDate = new Date(now);
      targetDate.setDate(now.getDate() + daysAhead);
      const dateStr = targetDate.toISOString().slice(0, 10);
      const timeStr = `${String(slot.hour).padStart(2, '0')}:00`;
      await marketingAPI.scheduleContent(userId, contentId, dateStr, timeStr);
      toast.success(`Scheduled for ${slot.day} at ${slot.timeSlot}`, { description: slot.reason });
      await fetchData();
    } catch (e) {
      toast.error('Auto-schedule failed', { description: e instanceof Error ? e.message : 'Unknown' });
    } finally {
      setAutoScheduling(false);
    }
  };

  const handleDrop = async (dayDate: string) => {
    if (!draggedContentId) return;
    try {
      await marketingAPI.scheduleContent(userId, draggedContentId, dayDate);
      setDraggedContentId(null);
      toast.success('Rescheduled');
      await fetchData();
    } catch { toast.error('Failed to reschedule'); }
  };

  const contentColumns = useMemo<ColumnDef<ContentItem>[]>(() => [
    { key: 'title', header: 'Title', render: (_v, row) => (<div className="flex items-center gap-2">{channelIcon(row.channel)}<span className="font-medium text-app-text">{row.title}</span></div>) },
    { key: 'content_type', header: 'Type', render: (v) => <Badge variant={contentVariant(String(v))}>{String(v)}</Badge> },
    { key: 'channel', header: 'Channel', render: (v) => <span className={cn('inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium', channelBg(String(v)))}>{channelIcon(String(v))}{String(v)}</span> },
    { key: 'status', header: 'Status', render: (v) => <Badge variant="default">{String(v)}</Badge> },
    { key: 'scheduled_date', header: 'Scheduled', render: (v, row) => v ? <span className="text-slate-300">{String(v)}{row.scheduled_time ? ` \u00B7 ${row.scheduled_time}` : ''}</span> : <button type="button" onClick={(e) => { e.stopPropagation(); void handleAutoSchedule(row.id); }} disabled={autoScheduling} className="inline-flex items-center gap-1 rounded-md bg-cyan-500/10 border border-cyan-500/20 px-2 py-0.5 text-[10px] font-medium text-cyan-300 hover:bg-cyan-500/20 disabled:opacity-40"><Zap className="h-3 w-3" />Auto-schedule</button> },
    { key: 'campaign_name', header: 'Campaign' },
  ], [autoScheduling]);

  function renderCalendarItem(item: ContentItem): JSX.Element {
    return (
      <button key={item.id} draggable onDragStart={() => setDraggedContentId(item.id)} onClick={(e) => { e.stopPropagation(); setSelectedContentId(item.id); }} className="w-full text-left group">
        <div className={cn('rounded-md border px-2 py-1 text-[10px] transition-all', channelBg(item.channel), 'hover:ring-1 hover:ring-white/20')}>
          <div className="flex items-center gap-1">{channelIcon(item.channel)}<span className="truncate font-medium">{item.title}</span></div>
          {item.scheduled_time && <div className="mt-0.5 flex items-center gap-1 text-[8px] opacity-70"><Clock className="h-2.5 w-2.5" />{item.scheduled_time}</div>}
        </div>
      </button>
    );
  }

  function renderCalendarCell(day: { date: string; inMonth: boolean; items: ContentItem[] }): JSX.Element {
    const isToday = day.date === todayKey;
    const hasWarning = day.items.length >= 3;
    return (
      <div key={day.date} className={cn('min-h-[120px] border-r border-b border-white/[0.06] p-1.5 transition-colors', day.inMonth ? 'bg-[#0c0f14]' : 'bg-[#080a0e] opacity-50', draggedContentId && 'hover:bg-cyan-500/5')} onDragOver={(e) => e.preventDefault()} onDrop={() => void handleDrop(day.date)} onClick={(e) => { if (e.target === e.currentTarget) setCreateDate(day.date); }}>
        <div className="flex items-center justify-between mb-1">
          <span className={cn('inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-medium', isToday ? 'bg-cyan-500 text-white' : 'text-slate-500')}>{new Date(day.date + 'T12:00:00').getDate()}</span>
          {hasWarning && <AlertTriangle className="h-3 w-3 text-amber-400/80" />}
        </div>
        <div className="space-y-0.5">
          {day.items.slice(0, 4).map(renderCalendarItem)}
          {day.items.length > 4 && <p className="text-[8px] text-slate-600 text-center">+{day.items.length - 4} more</p>}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="rounded-xl border border-white/10 bg-white/[0.03] overflow-hidden mb-6">
        <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
          <div className="flex items-center gap-2">
            <button title="Previous" onClick={() => { if (viewMode === 'week') { setAnchorDate((c) => { const d = new Date(c); d.setDate(d.getDate() - 7); return d; }); } else { setAnchorDate((c) => new Date(c.getFullYear(), c.getMonth() - 1, 1)); } }} className="rounded-lg border border-white/[0.08] bg-white/[0.04] p-1.5 text-slate-400 hover:bg-white/[0.08] hover:text-slate-200"><ChevronLeft className="h-4 w-4" /></button>
            <h2 className="min-w-[180px] text-center text-sm font-semibold text-slate-100">
              {viewMode === 'week'
                ? `${weekDays[0] ? new Date(weekDays[0].date + 'T12:00:00').toLocaleDateString('en', { month: 'short', day: 'numeric' }) : ''} \u2013 ${weekDays[6] ? new Date(weekDays[6].date + 'T12:00:00').toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' }) : ''}`
                : anchorDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
            </h2>
            <button title="Next" onClick={() => { if (viewMode === 'week') { setAnchorDate((c) => { const d = new Date(c); d.setDate(d.getDate() + 7); return d; }); } else { setAnchorDate((c) => new Date(c.getFullYear(), c.getMonth() + 1, 1)); } }} className="rounded-lg border border-white/[0.08] bg-white/[0.04] p-1.5 text-slate-400 hover:bg-white/[0.08] hover:text-slate-200"><ChevronRight className="h-4 w-4" /></button>
            <button onClick={() => setAnchorDate(new Date())} className="rounded-lg border border-white/[0.08] bg-white/[0.04] px-2.5 py-1.5 text-[10px] font-medium text-slate-400 hover:bg-white/[0.08] hover:text-slate-200">Today</button>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="flex rounded-lg border border-white/[0.08] bg-white/[0.02] p-0.5">
              {([{ id: 'month' as const, icon: CalendarDays, label: 'Month' }, { id: 'week' as const, icon: LayoutGrid, label: 'Week' }, { id: 'list' as const, icon: List, label: 'List' }]).map(({ id, icon: Icon, label }) => (
                <button key={id} type="button" onClick={() => setViewMode(id)} title={label} className={cn('flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium transition-colors', viewMode === id ? 'bg-white/[0.08] text-slate-100' : 'text-slate-500 hover:text-slate-300')}><Icon className="h-3.5 w-3.5" />{label}</button>
              ))}
            </div>
          </div>
        </div>

        {viewMode === 'month' && (
          <div>
            <div className="grid grid-cols-7 border-b border-white/[0.06]">
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((l) => <div key={l} className="border-r border-white/[0.06] px-2 py-1.5 text-[10px] uppercase tracking-wider text-slate-600 last:border-r-0">{l}</div>)}
            </div>
            <div className="grid grid-cols-7">{gridDays.map(renderCalendarCell)}</div>
          </div>
        )}

        {viewMode === 'week' && (
          <div>
            <div className="grid grid-cols-7 border-b border-white/[0.06]">
              {weekDays.map((day) => { const d = new Date(day.date + 'T12:00:00'); const isToday = day.date === todayKey; return (<div key={day.date} className="border-r border-white/[0.06] px-2 py-2 last:border-r-0 text-center"><div className="text-[10px] uppercase tracking-wider text-slate-600">{d.toLocaleDateString('en', { weekday: 'short' })}</div><div className={cn('mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium', isToday ? 'bg-cyan-500 text-white' : 'text-slate-300')}>{d.getDate()}</div></div>); })}
            </div>
            <div className="grid grid-cols-7 min-h-[300px]">
              {weekDays.map((day) => (<div key={day.date} className={cn('border-r border-white/[0.06] p-2 last:border-r-0', draggedContentId && 'hover:bg-cyan-500/5')} onDragOver={(e) => e.preventDefault()} onDrop={() => void handleDrop(day.date)} onClick={(e) => { if (e.target === e.currentTarget) setCreateDate(day.date); }}><div className="space-y-1">{day.items.map(renderCalendarItem)}</div>{day.items.length === 0 && <p className="mt-8 text-center text-[9px] text-slate-700">Click to add</p>}</div>))}
            </div>
          </div>
        )}

        {viewMode === 'list' && (
          <div className="p-4">
            <DataTable data={list} columns={contentColumns} isLoading={loading} onRowClick={(row) => setSelectedContentId(row.id)} emptyMessage="No content scheduled for this month." />
          </div>
        )}
      </div>

      {viewMode !== 'list' && (
        <div className="mb-6 grid grid-cols-4 gap-3">
          {[
            { label: 'Total posts', value: list.length, icon: CalendarDays, color: 'text-cyan-400' },
            { label: 'Instagram', value: list.filter((c) => (c.channel ?? '').toLowerCase() === 'instagram').length, icon: Instagram, color: 'text-pink-400' },
            { label: 'Scheduled', value: list.filter((c) => c.scheduled_date).length, icon: Clock, color: 'text-emerald-400' },
            { label: 'Needs scheduling', value: list.filter((c) => !c.scheduled_date && c.status !== 'published').length, icon: Sparkles, color: 'text-amber-400' },
          ].map((stat) => (
            <div key={stat.label} className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-[#0c0f14] px-4 py-3">
              <stat.icon className={cn('h-5 w-5', stat.color)} />
              <div><p className="text-lg font-semibold text-slate-100">{stat.value}</p><p className="text-[10px] text-slate-500">{stat.label}</p></div>
            </div>
          ))}
        </div>
      )}

      {viewMode !== 'list' && (
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-slate-200 mb-3">Content List</h3>
          <DataTable data={list} columns={contentColumns} isLoading={loading} onRowClick={(row) => setSelectedContentId(row.id)} emptyMessage="No content scheduled for this month." />
        </div>
      )}

      <SlideOverPanel isOpen={!!selectedContentId} onClose={() => { setSelectedContentId(null); setSearchParams((prev) => { const next = new URLSearchParams(prev); next.delete('contentId'); return next; }); }} title="Content Detail" width={1200}>
        {selectedContentId && <ContentDetailPanel contentId={selectedContentId} onUpdated={fetchData} />}
      </SlideOverPanel>

      <SlideOverPanel isOpen={!!createDate} onClose={() => setCreateDate(null)} title="Create Content" width={560}>
        <ContentCreatePanel initialDate={createDate ?? undefined} onCreated={() => { setCreateDate(null); void fetchData(); }} onCancel={() => setCreateDate(null)} />
      </SlideOverPanel>
    </>
  );
}
