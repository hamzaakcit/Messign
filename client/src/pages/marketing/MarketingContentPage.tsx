import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { DoraInsightBar } from '@/components/dora/DoraInsightBar';
import { DataTable, type ColumnDef } from '@/components/ui/DataTable';
import { SlideOverPanel } from '@/components/ui/SlideOverPanel';
import { Badge } from '@/components/ui/Badge';
import { useAuthStore } from '@/stores/authStore';
import { marketingAPI, type ContentCalendarDay, type ContentItem } from '@/lib/marketingApi';
import { MarketingNav } from './components/MarketingNav';
import { ContentCreatePanel } from './components/ContentCreatePanel';
import { ContentDetailPanel } from './components/ContentDetailPanel';

function startOfCalendarMonth(year: number, monthIndex: number) {
  const first = new Date(year, monthIndex, 1);
  const day = (first.getDay() + 6) % 7;
  const start = new Date(first);
  start.setDate(first.getDate() - day);
  return start;
}

function contentVariant(contentType: string): 'default' | 'blue' | 'purple' | 'green' | 'orange' | 'red' {
  if (contentType === 'blog') return 'blue';
  if (contentType === 'social') return 'purple';
  if (contentType === 'email') return 'green';
  if (contentType === 'video') return 'red';
  if (contentType === 'webinar') return 'orange';
  return 'default';
}

export function MarketingContentPage() {
  const { user } = useAuthStore();
  const userId = user?.authUserId || user?.id || '';
  const [anchorDate, setAnchorDate] = useState(() => new Date());
  const [calendar, setCalendar] = useState<ContentCalendarDay[]>([]);
  const [list, setList] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedContentId, setSelectedContentId] = useState<string | null>(null);
  const [createDate, setCreateDate] = useState<string | null>(null);
  const [draggedContentId, setDraggedContentId] = useState<string | null>(null);

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

  useEffect(() => {
    fetchData();
  }, [fetchData]);

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
      return {
        date: key,
        inMonth: date.getMonth() === month - 1,
        items: calendarMap.get(key) ?? [],
      };
    });
  }, [calendarMap, month, year]);

  const columns = useMemo<ColumnDef<ContentItem>[]>(() => [
    {
      key: 'title',
      header: 'Title',
      render: (_value, row) => <span className="font-medium text-app-text">{row.title}</span>,
    },
    {
      key: 'content_type',
      header: 'Type',
      render: (value) => <Badge variant={contentVariant(String(value))}>{String(value)}</Badge>,
    },
    { key: 'channel', header: 'Channel' },
    {
      key: 'status',
      header: 'Status',
      render: (value) => <Badge variant="default">{String(value)}</Badge>,
    },
    { key: 'scheduled_date', header: 'Scheduled' },
    { key: 'campaign_name', header: 'Campaign' },
  ], []);

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[1600px] mx-auto px-6 pt-6 pb-4">
          <MarketingNav />
          <DoraInsightBar module="marketing" />

          <div className="rounded-xl border border-white/10 bg-white/5 p-4 mb-6">
            <div className="flex items-center justify-between mb-4">
              <button onClick={() => setAnchorDate((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))} className="px-3 py-2 rounded-lg text-sm bg-white/5 text-app-text flex items-center gap-1.5">
                <ChevronLeft className="w-4 h-4" />
                Previous
              </button>
              <h2 className="text-xl font-semibold text-app-text">
                {anchorDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
              </h2>
              <button onClick={() => setAnchorDate((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))} className="px-3 py-2 rounded-lg text-sm bg-white/5 text-app-text flex items-center gap-1.5">
                Next
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-7 gap-px bg-white/10 rounded-lg overflow-hidden">
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((label) => (
                <div key={label} className="bg-app-card px-3 py-2 text-xs uppercase tracking-wide text-app-muted">
                  {label}
                </div>
              ))}
              {gridDays.map((day) => (
                <div
                  key={day.date}
                  className={`min-h-32 bg-app-card p-2 ${day.inMonth ? '' : 'opacity-50'}`}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => {
                    if (!draggedContentId) return;
                    void marketingAPI.scheduleContent(userId, draggedContentId, day.date).then(() => {
                      setDraggedContentId(null);
                      void fetchData();
                    });
                  }}
                  onClick={(event) => {
                    if (event.target === event.currentTarget) {
                      setCreateDate(day.date);
                    }
                  }}
                >
                  <div className="text-xs text-app-muted mb-2">{new Date(day.date).getDate()}</div>
                  <div className="space-y-1">
                    {day.items.map((item) => (
                      <button
                        key={item.id}
                        draggable
                        onDragStart={() => setDraggedContentId(item.id)}
                        onClick={(event) => {
                          event.stopPropagation();
                          setSelectedContentId(item.id);
                        }}
                        className="w-full text-left"
                      >
                        <div className={`rounded-md px-2 py-1 text-xs ${contentVariant(item.content_type) === 'blue' ? 'bg-primary-500/15 text-primary-300' : contentVariant(item.content_type) === 'purple' ? 'bg-accent-500/15 text-accent-300' : contentVariant(item.content_type) === 'green' ? 'bg-success-500/15 text-success-400' : contentVariant(item.content_type) === 'red' ? 'bg-danger-500/15 text-danger-400' : 'bg-warning-500/15 text-warning-400'}`}>
                          <div className="truncate">{item.title}</div>
                          <div className="text-[10px] opacity-75">{item.status}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mb-4">
            <h3 className="text-lg font-semibold text-app-text mb-3">Content List</h3>
            <DataTable
              data={list}
              columns={columns}
              isLoading={loading}
              onRowClick={(row) => setSelectedContentId(row.id)}
              emptyMessage="No content scheduled for this month."
            />
          </div>
        </div>
      </div>

      <SlideOverPanel isOpen={!!selectedContentId} onClose={() => setSelectedContentId(null)} title="Content Detail" width={720}>
        {selectedContentId && <ContentDetailPanel contentId={selectedContentId} onUpdated={fetchData} />}
      </SlideOverPanel>

      <SlideOverPanel isOpen={!!createDate} onClose={() => setCreateDate(null)} title="Create Content" width={560}>
        <ContentCreatePanel
          initialDate={createDate ?? undefined}
          onCreated={() => {
            setCreateDate(null);
            void fetchData();
          }}
          onCancel={() => setCreateDate(null)}
        />
      </SlideOverPanel>
    </div>
  );
}
