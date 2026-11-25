import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  AlertTriangle,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  Instagram,
  LayoutGrid,
  List,
  Mail,
  Megaphone,
  Sparkles,
} from 'lucide-react';
import { DataTable, type ColumnDef } from '@/components/ui/DataTable';
import { SlideOverPanel } from '@/components/ui/SlideOverPanel';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';
import {
  marketingAPI,
  type ContentCalendarDay,
  type ContentItem,
} from '@/lib/marketingApi';
import { ContentDetailPanel } from '../components/ContentDetailPanel';
import { calendarChip } from '../lib/calendarChip';
import { localDateKey, monthGridLength, monthRange, readyToSchedule, scheduleDropRule, trayLabel } from '../lib/calendarSchedule';

type ViewMode = 'month' | 'week' | 'list';

/** The slide-over chrome in the shop counter's paper colours. */
const PAPER_PANEL_VARS = { '--app-sidebar': '#f4efe8', '--app-border': '#e7e0d6' } as React.CSSProperties;

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
  if (c === 'instagram') return <Instagram className="h-3 w-3 text-pink-600" />;
  if (c === 'email') return <Mail className="h-3 w-3 text-green-700" />;
  return <Megaphone className="h-3 w-3 text-[#78716c]" />;
}

function channelBg(channel?: string | null): string {
  const c = (channel ?? '').toLowerCase();
  if (c === 'instagram') return 'bg-[#fdf2f8] text-[#9d174d] border-[#fbcfe8]';
  if (c === 'email') return 'bg-[#ecfdf5] text-[#065f46] border-[#a7f3d0]';
  return 'bg-[#f4efe8] text-[#44403c] border-[#e7e0d6]';
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

const todayKey = localDateKey(new Date());

export function ContentCalendarTab(): JSX.Element {
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuthStore();
  const userId = user?.authUserId || user?.id || '';

  const [anchorDate, setAnchorDate] = useState(() => new Date());
  const [calendar, setCalendar] = useState<ContentCalendarDay[]>([]);
  const [list, setList] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedContentId, setSelectedContentId] = useState<string | null>(null);
  const [dragged, setDragged] = useState<ContentItem | null>(null);
  const [ready, setReady] = useState<ContentItem[]>([]);
  const [liveSend, setLiveSend] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('month');

  const month = anchorDate.getMonth() + 1;
  const year = anchorDate.getFullYear();

  const fetchData = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const { from: startDate, to: endDate } = monthRange(year, month);
      const [calendarRes, listRes, approvedRes] = await Promise.all([
        marketingAPI.getCalendarView(userId, month, year),
        marketingAPI.listContent(userId, { dateFrom: startDate, dateTo: endDate, pageSize: '100' }),
        marketingAPI.listContent(userId, { status: 'approved', pageSize: '50' }),
      ]);
      setCalendar(calendarRes);
      setList(listRes.data);
      setReady(readyToSchedule(approvedRes.data));
    } finally {
      setLoading(false);
    }
  }, [month, userId, year]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void marketingAPI.instagramPublishMode(userId).then((row) => {
      if (!cancelled) setLiveSend(row.mode === 'live');
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [userId]);

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
    return Array.from({ length: monthGridLength(year, month - 1) }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      const key = localDateKey(date);
      return { date: key, inMonth: date.getMonth() === month - 1, items: calendarMap.get(key) ?? [] };
    });
  }, [calendarMap, month, year]);

  const weekDays = useMemo(() => {
    const start = startOfCalendarWeek(anchorDate);
    return Array.from({ length: 7 }, (_, i) => {
      const date = new Date(start);
      date.setDate(start.getDate() + i);
      const key = localDateKey(date);
      return { date: key, inMonth: date.getMonth() === month - 1, items: calendarMap.get(key) ?? [] };
    });
  }, [calendarMap, anchorDate, month]);

  const handleDrop = async (dayDate: string) => {
    if (!dragged) return;
    const rule = scheduleDropRule(dragged);
    if (!rule.ok) {
      setDragged(null);
      toast.message(rule.message);
      return;
    }
    try {
      await marketingAPI.scheduleContent(userId, dragged.id, dayDate);
      setDragged(null);
      toast.success('Rescheduled');
      await fetchData();
    } catch { toast.error('Failed to reschedule'); }
  };

  const contentColumns = useMemo<ColumnDef<ContentItem>[]>(() => [
    { key: 'title', header: 'Title', render: (_v, row) => (<div className="flex items-center gap-2">{channelIcon(row.channel)}<span className="font-medium text-[#1c1917]">{row.title}</span></div>) },
    { key: 'content_type', header: 'Type', render: (v) => <Badge variant={contentVariant(String(v))}>{String(v)}</Badge> },
    { key: 'channel', header: 'Channel', render: (v) => <span className={cn('inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium', channelBg(String(v)))}>{channelIcon(String(v))}{String(v)}</span> },
    { key: 'status', header: 'Status', render: (v) => <Badge variant="default">{String(v)}</Badge> },
    { key: 'scheduled_date', header: 'Scheduled', render: (v, row) => v ? <span className="text-[#57534e]">{String(v)}{row.scheduled_time ? ` \u00B7 ${row.scheduled_time}` : ''}</span> : <span className="text-app-muted">Not scheduled</span> },
    { key: 'campaign_name', header: 'Campaign' },
  ], []);

  function renderCalendarItem(item: ContentItem): JSX.Element {
    const chip = calendarChip(item);
    const time = item.scheduled_time ? (
      <div className="mt-0.5 flex items-center gap-1 text-[8px] opacity-70"><Clock className="h-2.5 w-2.5" />{item.scheduled_time}</div>
    ) : null;
    if (chip.kind === 'instagram') {
      return (
        <button key={item.id} draggable onDragStart={() => setDragged(item)} onClick={(e) => { e.stopPropagation(); setSelectedContentId(item.id); }} className="w-full text-left group">
          <div className={cn('rounded-md border px-2 py-1 text-[10px] transition-all', channelBg(item.channel), 'hover:ring-1 hover:ring-[#a8a29e]')}>
            <div className="flex items-center gap-1">
              {chip.thumb ? (
                <img src={chip.thumb} alt="" className="h-8 w-8 shrink-0 rounded object-cover" />
              ) : channelIcon(item.channel)}
              <span className="truncate font-medium">{chip.title}</span>
              {chip.format ? (
                <span className="shrink-0 rounded bg-white/70 px-1 py-0.5 text-[8px] uppercase tracking-wide">{chip.format}</span>
              ) : null}
            </div>
            {time}
          </div>
        </button>
      );
    }
    if (chip.kind === 'email') {
      return (
        <button key={item.id} draggable onDragStart={() => setDragged(item)} onClick={(e) => { e.stopPropagation(); setSelectedContentId(item.id); }} className="w-full text-left group">
          <div className={cn('rounded-md border px-2 py-1 text-[10px] transition-all', channelBg(item.channel), 'hover:ring-1 hover:ring-[#a8a29e]')}>
            <div className="text-[8px] uppercase tracking-wide opacity-70">Subject</div>
            <div className="truncate font-medium">{chip.subject}</div>
            {time}
          </div>
        </button>
      );
    }
    return (
      <button key={item.id} draggable onDragStart={() => setDragged(item)} onClick={(e) => { e.stopPropagation(); setSelectedContentId(item.id); }} className="w-full text-left group">
        <div className={cn('rounded-md border px-2 py-1 text-[10px] transition-all', channelBg(item.channel), 'hover:ring-1 hover:ring-[#a8a29e]')}>
          <div className="flex items-center gap-1">{channelIcon(item.channel)}<span className="truncate font-medium">{item.title}</span></div>
          {time}
        </div>
      </button>
    );
  }

  function renderCalendarCell(day: { date: string; inMonth: boolean; items: ContentItem[] }): JSX.Element {
    const isToday = day.date === todayKey;
    const hasWarning = day.items.length >= 3;
    return (
      <div key={day.date} data-testid={`day-${day.date}`} className={cn('min-h-[120px] border-r border-b border-[#e7e0d6] p-1.5 transition-colors', day.inMonth ? 'bg-white' : 'bg-[#f4efe8] opacity-60', dragged && 'hover:bg-[#f4efe8]')} onDragOver={(e) => e.preventDefault()} onDrop={() => void handleDrop(day.date)}>
        <div className="flex items-center justify-between mb-1">
          <span className={cn('inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-medium', isToday ? 'bg-[#1c1917] text-white' : 'text-[#78716c]')}>{new Date(day.date + 'T12:00:00').getDate()}</span>
          {hasWarning && <AlertTriangle className="h-3 w-3 text-amber-400/80" />}
        </div>
        <div className="space-y-0.5">
          {day.items.slice(0, 4).map(renderCalendarItem)}
          {day.items.length > 4 && <p className="text-[8px] text-[#a8a29e] text-center">+{day.items.length - 4} more</p>}
        </div>
      </div>
    );
  }

  return (
    <div data-theme="light" className="flex-1 overflow-y-auto bg-[#f4efe8] px-4 py-3 text-[#1c1917]" style={PAPER_PANEL_VARS}>
      {liveSend ? (
        <p role="status" data-testid="live-send-warning" className="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Live sending is on: a scheduled Instagram post will be published on its day.
        </p>
      ) : null}
      <section className="mb-3 rounded-xl border border-[#e7e0d6] bg-white px-3 py-2" data-testid="ready-tray">
        <h3 className="text-[10px] font-semibold uppercase tracking-wider text-[#78716c]">Ready to schedule</h3>
        {ready.length === 0 ? (
          <p className="mt-1 text-xs text-[#78716c]">Nothing approved yet.</p>
        ) : (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {ready.map((item) => (
              <div key={item.id} className="w-44">{renderCalendarItem({ ...item, title: trayLabel(item) })}</div>
            ))}
          </div>
        )}
      </section>
      <div className="rounded-xl border border-[#e7e0d6] bg-white overflow-hidden mb-4">
        <div className="flex items-center justify-between border-b border-[#e7e0d6] px-4 py-3">
          <div className="flex items-center gap-2">
            <button title="Previous" onClick={() => { if (viewMode === 'week') { setAnchorDate((c) => { const d = new Date(c); d.setDate(d.getDate() - 7); return d; }); } else { setAnchorDate((c) => new Date(c.getFullYear(), c.getMonth() - 1, 1)); } }} className="rounded-lg border border-[#e7e0d6] bg-white p-1.5 text-[#78716c] hover:bg-[#f4efe8] hover:text-[#1c1917]"><ChevronLeft className="h-4 w-4" /></button>
            <h2 className="min-w-[180px] text-center text-sm font-semibold text-[#1c1917]">
              {viewMode === 'week'
                ? `${weekDays[0] ? new Date(weekDays[0].date + 'T12:00:00').toLocaleDateString('en', { month: 'short', day: 'numeric' }) : ''} \u2013 ${weekDays[6] ? new Date(weekDays[6].date + 'T12:00:00').toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' }) : ''}`
                : anchorDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
            </h2>
            <button title="Next" onClick={() => { if (viewMode === 'week') { setAnchorDate((c) => { const d = new Date(c); d.setDate(d.getDate() + 7); return d; }); } else { setAnchorDate((c) => new Date(c.getFullYear(), c.getMonth() + 1, 1)); } }} className="rounded-lg border border-[#e7e0d6] bg-white p-1.5 text-[#78716c] hover:bg-[#f4efe8] hover:text-[#1c1917]"><ChevronRight className="h-4 w-4" /></button>
            <button onClick={() => setAnchorDate(new Date())} className="rounded-lg border border-[#e7e0d6] bg-white px-2.5 py-1.5 text-[10px] font-medium text-[#78716c] hover:bg-[#f4efe8] hover:text-[#1c1917]">Today</button>
          </div>
          <div className="flex rounded-lg border border-[#e7e0d6] bg-[#f4efe8] p-0.5">
            {([{ id: 'month' as const, icon: CalendarDays, label: 'Month' }, { id: 'week' as const, icon: LayoutGrid, label: 'Week' }, { id: 'list' as const, icon: List, label: 'List' }]).map(({ id, icon: Icon, label }) => (
              <button key={id} type="button" onClick={() => setViewMode(id)} title={label} className={cn('flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium transition-colors', viewMode === id ? 'bg-white text-[#1c1917] shadow-sm' : 'text-[#78716c] hover:text-[#1c1917]')}><Icon className="h-3.5 w-3.5" />{label}</button>
            ))}
          </div>
        </div>

        {viewMode === 'month' && (
          <div>
            <div className="grid grid-cols-7 border-b border-[#e7e0d6]">
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((l) => <div key={l} className="border-r border-[#e7e0d6] px-2 py-1.5 text-[10px] uppercase tracking-wider text-[#a8a29e] last:border-r-0">{l}</div>)}
            </div>
            <div className="grid grid-cols-7">{gridDays.map(renderCalendarCell)}</div>
          </div>
        )}

        {viewMode === 'week' && (
          <div>
            <div className="grid grid-cols-7 border-b border-[#e7e0d6]">
              {weekDays.map((day) => { const d = new Date(day.date + 'T12:00:00'); const isToday = day.date === todayKey; return (<div key={day.date} className="border-r border-[#e7e0d6] px-2 py-2 last:border-r-0 text-center"><div className="text-[10px] uppercase tracking-wider text-[#a8a29e]">{d.toLocaleDateString('en', { weekday: 'short' })}</div><div className={cn('mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium', isToday ? 'bg-[#1c1917] text-white' : 'text-[#57534e]')}>{d.getDate()}</div></div>); })}
            </div>
            <div className="grid grid-cols-7 min-h-[300px]">
              {weekDays.map((day) => (<div key={day.date} className={cn('border-r border-[#e7e0d6] p-2 last:border-r-0', dragged && 'hover:bg-[#f4efe8]')} onDragOver={(e) => e.preventDefault()} onDrop={() => void handleDrop(day.date)}><div className="space-y-1">{day.items.map(renderCalendarItem)}</div></div>))}
            </div>
          </div>
        )}

        {viewMode === 'list' && (
          <div className="p-4">
            <DataTable data={list} columns={contentColumns} isLoading={loading} onRowClick={(row) => setSelectedContentId(row.id)} emptyMessage="No content scheduled this month." />
          </div>
        )}
      </div>

      {viewMode !== 'list' && (
        <div className="grid grid-cols-4 gap-2 mb-4">
          {[
            { label: 'Posts', value: list.length, icon: CalendarDays, color: 'text-[#44403c]' },
            { label: 'Instagram', value: list.filter((c) => (c.channel ?? '').toLowerCase() === 'instagram').length, icon: Instagram, color: 'text-pink-600' },
            { label: 'Scheduled', value: list.filter((c) => c.scheduled_date).length, icon: Clock, color: 'text-emerald-700' },
            { label: 'Unscheduled', value: list.filter((c) => !c.scheduled_date && c.status !== 'published').length, icon: Sparkles, color: 'text-amber-700' },
          ].map((stat) => (
            <div key={stat.label} className="flex items-center gap-2 rounded-lg border border-[#e7e0d6] bg-white px-3 py-2">
              <stat.icon className={cn('h-4 w-4', stat.color)} />
              <div>
                <p className="text-sm font-semibold text-[#1c1917]">{stat.value}</p>
                <p className="text-[9px] text-[#78716c]">{stat.label}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <SlideOverPanel isOpen={!!selectedContentId} onClose={() => { setSelectedContentId(null); setSearchParams((prev) => { const next = new URLSearchParams(prev); next.delete('contentId'); return next; }); }} title="Content Detail" width={1200}>
        {selectedContentId && <ContentDetailPanel contentId={selectedContentId} onUpdated={fetchData} />}
      </SlideOverPanel>

    </div>
  );
}
