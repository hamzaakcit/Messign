import { useCallback, useEffect, useMemo, useState } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Activity, Clock3, Percent, Wallet } from 'lucide-react';
import { DoraInsightBar } from '@/components/dora/DoraInsightBar';
import { DataTable, type ColumnDef } from '@/components/ui/DataTable';
import { KPICard } from '@/components/finance/KPICard';
import { Button } from '@/components/ui/Button';
import { useAuthStore } from '@/stores/authStore';
import { timeApi } from '@/lib/timeApi';
import { cn } from '@/lib/utils';

type Tab = 'timesheet' | 'entries' | 'utilization';

interface WeeklyGrid {
  rows: Array<{
    project: { id: string | null; name: string };
    task: { id: string | null; title: string };
    entries: { mon: number; tue: number; wed: number; thu: number; fri: number; sat: number; sun: number };
    total: number;
    billable: boolean;
  }>;
  totalByDay: { mon: number; tue: number; wed: number; thu: number; fri: number; sat: number; sun: number };
  grandTotal: number;
}

const tabs: Array<{ id: Tab; label: string }> = [
  { id: 'timesheet', label: 'Timesheet' },
  { id: 'entries', label: 'My Entries' },
  { id: 'utilization', label: 'Utilization' },
];

function mondayOf(date: Date): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay();
  const diff = (day + 6) % 7;
  d.setUTCDate(d.getUTCDate() - diff);
  return d;
}

function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function TimeTrackingPage() {
  const { user } = useAuthStore();
  const userId = user?.authUserId || user?.id || '';
  const [tab, setTab] = useState<Tab>('timesheet');
  const [weekStart, setWeekStart] = useState(() => fmt(mondayOf(new Date())));
  const [weeklyGrid, setWeeklyGrid] = useState<WeeklyGrid | null>(null);
  const [timesheet, setTimesheet] = useState<any>(null);
  const [entries, setEntries] = useState<any[]>([]);
  const [utilization, setUtilization] = useState<any>(null);
  const [teamUtilization, setTeamUtilization] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const loadWeek = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const [grid, sheet] = await Promise.all([
        timeApi.getWeeklyGrid(userId, weekStart) as Promise<WeeklyGrid>,
        timeApi.getCurrentTimesheet(userId, weekStart) as Promise<any>,
      ]);
      setWeeklyGrid(grid);
      setTimesheet(sheet);
    } finally {
      setLoading(false);
    }
  }, [userId, weekStart]);

  const loadEntries = useCallback(async () => {
    if (!userId) return;
    const result = await timeApi.listEntries(userId, { page: 1, pageSize: 100 }) as any;
    setEntries(Array.isArray(result?.data) ? result.data : []);
  }, [userId]);

  const loadUtilization = useCallback(async () => {
    if (!userId) return;
    const [me, team] = await Promise.all([
      timeApi.getMyUtilization(userId) as Promise<any>,
      timeApi.getTeamUtilization(userId) as Promise<any[]>,
    ]);
    setUtilization(me);
    setTeamUtilization(Array.isArray(team) ? team : []);
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    void loadWeek();
    void loadEntries();
    void loadUtilization();
  }, [userId, loadWeek, loadEntries, loadUtilization]);

  const weeklyRangeLabel = useMemo(() => {
    const start = new Date(`${weekStart}T00:00:00Z`);
    const end = new Date(start);
    end.setUTCDate(start.getUTCDate() + 6);
    return `${start.toLocaleDateString()} - ${end.toLocaleDateString()}`;
  }, [weekStart]);

  const trendData = useMemo(() => {
    if (!utilization) return [];
    const days = Number(utilization.daysLogged ?? 0);
    if (days <= 0) return [];
    const avgBillable = Number(utilization.billableHours ?? 0) / days;
    const avgNonBillable = Number(utilization.nonBillableHours ?? 0) / days;
    return Array.from({ length: 14 }).map((_, i) => ({
      day: `D${i + 1}`,
      billable: Number(avgBillable.toFixed(2)),
      nonBillable: Number(avgNonBillable.toFixed(2)),
    }));
  }, [utilization]);

  const entryColumns = useMemo<ColumnDef<any>[]>(() => [
    { key: 'date', header: 'Date', sortable: true },
    { key: 'projectName', header: 'Project' },
    { key: 'taskTitle', header: 'Task' },
    { key: 'categoryName', header: 'Category' },
    { key: 'hours', header: 'Hours', sortable: true },
    { key: 'isBillable', header: 'Billable', render: (_v, row) => (row.isBillable ? 'Yes' : 'No') },
    { key: 'billingRate', header: 'Rate', render: (_v, row) => (row.billingRate ? `€${Number(row.billingRate).toFixed(2)}` : '-') },
    { key: 'billableAmount', header: 'Amount', render: (_v, row) => `€${Number(row.billableAmount ?? 0).toFixed(2)}` },
    { key: 'status', header: 'Status' },
    { key: 'description', header: 'Description' },
  ], []);

  const submitTimesheet = async () => {
    if (!userId || !timesheet?.id) return;
    await timeApi.submitTimesheet(userId, timesheet.id);
    await loadWeek();
    await loadEntries();
    await loadUtilization();
  };

  return (
    <div className="flex h-full flex-col bg-app px-6 py-5">
      <DoraInsightBar
        module="time"
        fallback="Dora tracks your utilization and suggests optimal time allocation."
        className="mb-4"
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KPICard title="Hours This Week" value={Number(weeklyGrid?.grandTotal ?? 0).toFixed(2)} icon={Clock3} />
        <KPICard title="Billable Hours" value={Number(utilization?.billableHours ?? 0).toFixed(2)} icon={Activity} />
        <KPICard title="Utilization %" value={`${Number(utilization?.utilizationPercent ?? 0).toFixed(1)}%`} icon={Percent} />
        <KPICard title="Billable Revenue" value={`€${Number(utilization?.billableRevenue ?? 0).toFixed(2)}`} icon={Wallet} />
      </div>

      <div className="mt-4 flex items-center gap-2 border-b border-app-border">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={cn(
              'px-3 py-2 text-sm',
              tab === item.id ? 'border-b-2 border-primary-500 text-app' : 'text-app-muted hover:text-app',
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="mt-4 min-h-0 flex-1 overflow-auto">
        {tab === 'timesheet' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-xl border border-app-border bg-app-card p-3">
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  onClick={() => {
                    const prev = new Date(`${weekStart}T00:00:00Z`);
                    prev.setUTCDate(prev.getUTCDate() - 7);
                    setWeekStart(fmt(prev));
                  }}
                >
                  Previous Week
                </Button>
                <span className="text-sm text-app">{weeklyRangeLabel}</span>
                <Button
                  variant="secondary"
                  onClick={() => {
                    const next = new Date(`${weekStart}T00:00:00Z`);
                    next.setUTCDate(next.getUTCDate() + 7);
                    setWeekStart(fmt(next));
                  }}
                >
                  Next Week
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full border border-app-border px-2 py-1 text-xs text-app-muted">
                  {timesheet?.status ?? 'draft'}
                </span>
                <Button onClick={submitTimesheet} disabled={!timesheet?.id || timesheet?.status === 'submitted'}>
                  Submit Timesheet
                </Button>
              </div>
            </div>

            <div className="overflow-x-auto rounded-xl border border-app-border bg-app-card p-3">
              <table className="w-full min-w-[980px] text-sm">
                <thead>
                  <tr className="text-left text-app-muted">
                    <th className="py-2">Project / Task</th>
                    <th>Mon</th><th>Tue</th><th>Wed</th><th>Thu</th><th>Fri</th><th>Sat</th><th>Sun</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {(weeklyGrid?.rows ?? []).map((row, idx) => (
                    <tr key={`${row.project.id ?? 'none'}-${row.task.id ?? 'none'}-${idx}`} className="border-t border-app-border/60">
                      <td className="py-2">
                        <div className="text-app">{row.project.name}</div>
                        <div className="text-xs text-app-muted">{row.task.title}</div>
                      </td>
                      <td className={cn(row.billable ? 'text-blue-300' : 'text-app-muted')}>{row.entries.mon || '-'}</td>
                      <td className={cn(row.billable ? 'text-blue-300' : 'text-app-muted')}>{row.entries.tue || '-'}</td>
                      <td className={cn(row.billable ? 'text-blue-300' : 'text-app-muted')}>{row.entries.wed || '-'}</td>
                      <td className={cn(row.billable ? 'text-blue-300' : 'text-app-muted')}>{row.entries.thu || '-'}</td>
                      <td className={cn(row.billable ? 'text-blue-300' : 'text-app-muted')}>{row.entries.fri || '-'}</td>
                      <td className={cn(row.billable ? 'text-blue-300' : 'text-app-muted')}>{row.entries.sat || '-'}</td>
                      <td className={cn(row.billable ? 'text-blue-300' : 'text-app-muted')}>{row.entries.sun || '-'}</td>
                      <td className="font-medium text-app">{row.total}</td>
                    </tr>
                  ))}
                  <tr className="border-t border-app-border font-medium">
                    <td className="py-2 text-app">Totals</td>
                    <td>{weeklyGrid?.totalByDay.mon ?? 0}</td>
                    <td>{weeklyGrid?.totalByDay.tue ?? 0}</td>
                    <td>{weeklyGrid?.totalByDay.wed ?? 0}</td>
                    <td>{weeklyGrid?.totalByDay.thu ?? 0}</td>
                    <td>{weeklyGrid?.totalByDay.fri ?? 0}</td>
                    <td>{weeklyGrid?.totalByDay.sat ?? 0}</td>
                    <td>{weeklyGrid?.totalByDay.sun ?? 0}</td>
                    <td>{weeklyGrid?.grandTotal ?? 0}</td>
                  </tr>
                </tbody>
              </table>
              {loading && <div className="mt-3 text-xs text-app-muted">Loading timesheet...</div>}
            </div>
          </div>
        )}

        {tab === 'entries' && (
          <div className="rounded-xl border border-app-border bg-app-card p-3">
            <DataTable
              data={entries}
              columns={entryColumns}
              emptyMessage="No time entries yet."
              pagination
              pageSize={20}
            />
          </div>
        )}

        {tab === 'utilization' && (
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="rounded-xl border border-app-border bg-app-card p-4 lg:col-span-2">
              <h3 className="mb-3 text-sm font-semibold text-app">Daily billable vs non-billable</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
                    <XAxis dataKey="day" stroke="#94A3B8" />
                    <YAxis stroke="#94A3B8" />
                    <Tooltip />
                    <Bar dataKey="billable" stackId="a" fill="#3B82F6" />
                    <Bar dataKey="nonBillable" stackId="a" fill="#64748B" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="rounded-xl border border-app-border bg-app-card p-4">
              <h3 className="mb-3 text-sm font-semibold text-app">Utilization Gauge</h3>
              <div className="flex h-64 flex-col items-center justify-center">
                <div className="text-4xl font-semibold text-app">{Number(utilization?.utilizationPercent ?? 0).toFixed(1)}%</div>
                <div className="mt-2 text-xs text-app-muted">Target: 75%</div>
              </div>
            </div>

            <div className="rounded-xl border border-app-border bg-app-card p-4 lg:col-span-3">
              <h3 className="mb-3 text-sm font-semibold text-app">Team Utilization</h3>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={teamUtilization}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
                    <XAxis dataKey="fullName" stroke="#94A3B8" />
                    <YAxis stroke="#94A3B8" />
                    <Tooltip />
                    <Area type="monotone" dataKey="utilizationPercent" stroke="#10B981" fill="#10B98122" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
