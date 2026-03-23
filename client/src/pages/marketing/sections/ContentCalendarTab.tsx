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
  Zap,
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
import { ContentCreatePanel } from '../components/ContentCreatePanel';

type ViewMode = 'month' | 'week' | 'list';

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

export function ContentCalendarTab(): JSX.Element {
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuthStore();
  const userId = user?.authUserId || user?.id || '';

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
    { key: 'scheduled_date', header: 'Scheduled', render: (v, row) => v ? <span className="text-slate-300">{String(v)}{row.scheduled_time ? ` \u00B7 ${row.scheduled_time}` : ''}</span> : <button type="button" onClick={(e) => { e.stopPropagation(); void handleAutoSchedule(row.id); }} disabled={autoScheduling} className="inline-flex items-center gap-1 rounded-md bg-cyan-500/10 border border-cyan-500/20 px-2 py-0.5 text-[10px] font-medium text-cyan-300 hover:bg-cyan-500/20 disabled:opacity-40"><Zap className="h-3 w-3" />Auto</button> },
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
    <div className="flex-1 overflow-y-auto px-4 py-3">
      <div className="rounded-xl border border-white/10 bg-white/[0.03] overflow-hidden mb-4">
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
          <div className="flex rounded-lg border border-white/[0.08] bg-white/[0.02] p-0.5">
            {([{ id: 'month' as const, icon: CalendarDays, label: 'Month' }, { id: 'week' as const, icon: LayoutGrid, label: 'Week' }, { id: 'list' as const, icon: List, label: 'List' }]).map(({ id, icon: Icon, label }) => (
              <button key={id} type="button" onClick={() => setViewMode(id)} title={label} className={cn('flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium transition-colors', viewMode === id ? 'bg-white/[0.08] text-slate-100' : 'text-slate-500 hover:text-slate-300')}><Icon className="h-3.5 w-3.5" />{label}</button>
            ))}
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
            <DataTable data={list} columns={contentColumns} isLoading={loading} onRowClick={(row) => setSelectedContentId(row.id)} emptyMessage="No content scheduled this month." />
          </div>
        )}
      </div>

      {viewMode !== 'list' && (
        <div className="grid grid-cols-4 gap-2 mb-4">
          {[
            { label: 'Posts', value: list.length, icon: CalendarDays, color: 'text-cyan-400' },
            { label: 'Instagram', value: list.filter((c) => (c.channel ?? '').toLowerCase() === 'instagram').length, icon: Instagram, color: 'text-pink-400' },
            { label: 'Scheduled', value: list.filter((c) => c.scheduled_date).length, icon: Clock, color: 'text-emerald-400' },
            { label: 'Unscheduled', value: list.filter((c) => !c.scheduled_date && c.status !== 'published').length, icon: Sparkles, color: 'text-amber-400' },
          ].map((stat) => (
            <div key={stat.label} className="flex items-center gap-2 rounded-lg border border-white/[0.06] bg-[#0c0f14] px-3 py-2">
              <stat.icon className={cn('h-4 w-4', stat.color)} />
              <div>
                <p className="text-sm font-semibold text-slate-100">{stat.value}</p>
                <p className="text-[9px] text-slate-500">{stat.label}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <SlideOverPanel isOpen={!!selectedContentId} onClose={() => { setSelectedContentId(null); setSearchParams((prev) => { const next = new URLSearchParams(prev); next.delete('contentId'); return next; }); }} title="Content Detail" width={1200}>
        {selectedContentId && <ContentDetailPanel contentId={selectedContentId} onUpdated={fetchData} />}
      </SlideOverPanel>

      <SlideOverPanel isOpen={!!createDate} onClose={() => setCreateDate(null)} title="Create Content" width={560}>
        <ContentCreatePanel initialDate={createDate ?? undefined} onCreated={() => { setCreateDate(null); void fetchData(); }} onCancel={() => setCreateDate(null)} />
      </SlideOverPanel>
    </div>
  );
}
