import { useEffect, useMemo, useState } from 'react';
import { reportsAPI, type ReportResult } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';

const PERIOD_OPTIONS = ['this_month', 'this_quarter', 'this_year', 'custom'] as const;

function defaultPeriod(mode: typeof PERIOD_OPTIONS[number]) {
  const to = new Date();
  const from = new Date();
  if (mode === 'this_month') from.setDate(1);
  if (mode === 'this_quarter') from.setMonth(Math.floor(to.getMonth() / 3) * 3, 1);
  if (mode === 'this_year') from.setMonth(0, 1);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

export function ReportHubPage() {
  const user = useAuthStore((s) => s.user);
  const userId = user?.authUserId || user?.id || '';
  const [types, setTypes] = useState<Array<{ type: string; description: string; permission: string }>>([]);
  const [selectedType, setSelectedType] = useState<string>('');
  const [periodMode, setPeriodMode] = useState<typeof PERIOD_OPTIONS[number]>('this_month');
  const [from, setFrom] = useState(defaultPeriod('this_month').from);
  const [to, setTo] = useState(defaultPeriod('this_month').to);
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<ReportResult | null>(null);

  useEffect(() => {
    if (!userId) return;
    reportsAPI.getTypes(userId).then((rows) => {
      setTypes(rows);
      if (rows.length && !selectedType) setSelectedType(rows[0].type);
    });
  }, [userId]);

  useEffect(() => {
    if (periodMode === 'custom') return;
    const p = defaultPeriod(periodMode);
    setFrom(p.from);
    setTo(p.to);
  }, [periodMode]);

  const grouped = useMemo(() => {
    const categories: Record<string, string[]> = {
      Executive: ['executive_summary', 'cross_module_correlation', 'department_comparison'],
      Sales: ['sales_pipeline', 'sales_forecast', 'customer_health'],
      Finance: ['financial_overview', 'budget_health', 'expense_report', 'invoice_aging', 'time_billing'],
      Operations: ['support_performance', 'marketing_roi', 'recruitment_funnel', 'team_utilization', 'okr_progress', 'dora_automation_summary'],
    };
    return Object.entries(categories).map(([name, ids]) => ({
      name,
      items: types.filter((t) => ids.includes(t.type)),
    }));
  }, [types]);

  const generate = async () => {
    if (!userId || !selectedType) return;
    setLoading(true);
    try {
      const res = await reportsAPI.generate(userId, {
        type: selectedType,
        format: 'json',
        period: { from, to },
      });
      setReport(res);
    } finally {
      setLoading(false);
    }
  };

  const exportCsv = async () => {
    if (!userId || !selectedType) return;
    const blob = await reportsAPI.exportCsv(userId, { type: selectedType, format: 'csv', period: { from, to } });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedType}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportPdf = async () => {
    if (!userId || !selectedType) return;
    const blob = await reportsAPI.exportPdf(userId, { type: selectedType, format: 'pdf', period: { from, to } });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedType}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="h-[calc(100vh-64px)] overflow-y-auto p-4 md:p-6 bg-app space-y-4">
      <div className="rounded-xl border border-app bg-app-card p-5">
        <h1 className="text-2xl font-bold text-app">Report Hub</h1>
        <p className="text-sm text-app-muted mt-1">Generate and export reports across all modules</p>
      </div>

      <div className="rounded-xl border border-app bg-app-card p-4">
        <div className="text-sm font-semibold text-app mb-3">Report Type Grid</div>
        <div className="space-y-4">
          {grouped.map((group) => (
            <div key={group.name}>
              <div className="text-xs uppercase tracking-wide text-app-muted mb-2">{group.name}</div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                {group.items.map((item) => (
                  <button
                    key={item.type}
                    className={`text-left rounded-lg border p-3 ${
                      selectedType === item.type ? 'border-blue-500 bg-blue-500/10' : 'border-app bg-app hover:bg-app-hover'
                    }`}
                    onClick={() => setSelectedType(item.type)}
                  >
                    <div className="font-medium text-app">{item.type.replace(/_/g, ' ')}</div>
                    <div className="text-xs text-app-muted mt-1">{item.description}</div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-app bg-app-card p-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-3 items-end">
        <div>
          <label className="text-xs text-app-muted">Period</label>
          <select className="mt-1 w-full rounded border border-app bg-app p-2 text-sm" value={periodMode} onChange={(e) => setPeriodMode(e.target.value as any)}>
            {PERIOD_OPTIONS.map((p) => <option key={p} value={p}>{p.replace(/_/g, ' ')}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-app-muted">From</label>
          <input className="mt-1 w-full rounded border border-app bg-app p-2 text-sm" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label className="text-xs text-app-muted">To</label>
          <input className="mt-1 w-full rounded border border-app bg-app p-2 text-sm" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <button onClick={generate} disabled={loading || !selectedType} className="rounded border border-blue-500 bg-blue-500/20 text-blue-100 px-3 py-2 text-sm">
          {loading ? 'Generating...' : 'Generate Report'}
        </button>
        <button onClick={exportCsv} disabled={!selectedType} className="rounded border border-app px-3 py-2 text-sm text-app hover:bg-app-hover">
          Export CSV
        </button>
        <button onClick={exportPdf} disabled={!selectedType} className="rounded border border-app px-3 py-2 text-sm text-app hover:bg-app-hover">
          Export PDF
        </button>
      </div>

      {report && (
        <div className="rounded-xl border border-app bg-app-card p-4 space-y-3">
          <div>
            <div className="text-lg font-semibold text-app">{report.title}</div>
            <div className="text-xs text-app-muted">Generated {new Date(report.generatedAt).toLocaleString()}</div>
          </div>
          {report.aiSummary && (
            <div className="rounded-lg border border-indigo-500/30 bg-gradient-to-r from-indigo-700/20 to-blue-700/10 p-3 text-sm text-indigo-100">
              {report.aiSummary}
            </div>
          )}
          <div className="space-y-3">
            {report.sections.map((section, idx) => (
              <div key={`${section.title}-${idx}`} className="rounded border border-app bg-app p-3">
                <div className="text-sm font-medium text-app mb-2">{section.title}</div>
                <pre className="text-xs text-app-muted whitespace-pre-wrap overflow-x-auto">{JSON.stringify(section.data, null, 2)}</pre>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
