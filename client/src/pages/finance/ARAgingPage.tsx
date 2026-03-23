import { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { financeAPI, type AgingReport } from '@/lib/financeApi';
import { cn } from '@/lib/utils';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const BUCKET_LABELS: Record<string, string> = {
  current: 'Current',
  days_1_30: '1-30 Days',
  days_31_60: '31-60 Days',
  days_61_90: '61-90 Days',
  days_90_plus: '90+ Days',
};

const BUCKET_COLORS = ['#22c55e', '#3b82f6', '#f59e0b', '#f97316', '#ef4444'];

export function ARAgingPage() {
  const { user } = useAuthStore();
  const [report, setReport] = useState<AgingReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedClient, setExpandedClient] = useState<string | null>(null);

  const fetchReport = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const data = await financeAPI.getARAging(user.id);
      setReport(data);
    } catch (err) {
      console.error('Failed to load AR aging:', err);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { fetchReport(); }, [fetchReport]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-5 gap-4">
          {[1, 2, 3, 4, 5].map(i => <div key={i} className="h-20 rounded-xl bg-white/5 animate-pulse" />)}
        </div>
        <div className="h-64 rounded-xl bg-white/5 animate-pulse" />
      </div>
    );
  }

  if (!report) return <p className="text-app-muted text-center py-12">No AR aging data available</p>;

  const chartData = Object.entries(BUCKET_LABELS).map(([key, label]) => ({
    name: label,
    amount: (report.totals as Record<string, number>)[key] || 0,
  }));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        {Object.entries(BUCKET_LABELS).map(([key, label], i) => (
          <div key={key} className="rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs text-app-muted">{label}</p>
            <p className="text-xl font-bold text-app-text" style={{ color: BUCKET_COLORS[i] }}>
              ${((report.totals as Record<string, number>)[key] || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </p>
          </div>
        ))}
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <p className="text-xs text-app-muted">Total AR</p>
          <p className="text-xl font-bold text-app-text">${report.totals.grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
        </div>
      </div>

      <div className="rounded-xl border border-white/10 bg-white/5 p-5">
        <h3 className="text-sm font-semibold text-app-text mb-4">Aging Distribution</h3>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={chartData}>
            <XAxis dataKey="name" tick={{ fill: '#9ca3af', fontSize: 12 }} />
            <YAxis tick={{ fill: '#9ca3af', fontSize: 12 }} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
            <Tooltip
              contentStyle={{ background: '#1f2937', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }}
              formatter={(v: number) => [`$${v.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, 'Amount']}
            />
            <Bar dataKey="amount" radius={[4, 4, 0, 0]}>
              {chartData.map((_, i) => <Cell key={i} fill={BUCKET_COLORS[i]} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="rounded-xl border border-white/10 bg-white/5 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-app-muted text-xs border-b border-white/10">
              <th className="text-left px-4 py-3 font-medium w-8"></th>
              <th className="text-left px-4 py-3 font-medium">Client</th>
              <th className="text-right px-4 py-3 font-medium">Current</th>
              <th className="text-right px-4 py-3 font-medium">1-30</th>
              <th className="text-right px-4 py-3 font-medium">31-60</th>
              <th className="text-right px-4 py-3 font-medium">61-90</th>
              <th className="text-right px-4 py-3 font-medium">90+</th>
              <th className="text-right px-4 py-3 font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {report.buckets.map((bucket: any) => (
              <>
                <tr
                  key={bucket.name}
                  className="border-t border-white/5 hover:bg-white/5 cursor-pointer transition-colors"
                  onClick={() => setExpandedClient(expandedClient === bucket.name ? null : bucket.name)}
                >
                  <td className="px-4 py-3">
                    {expandedClient === bucket.name ? <ChevronDown className="h-4 w-4 text-app-muted" /> : <ChevronRight className="h-4 w-4 text-app-muted" />}
                  </td>
                  <td className="px-4 py-3 text-app-text font-medium">{bucket.name}</td>
                  <td className="px-4 py-3 text-right font-mono">{bucket.current > 0 ? `$${bucket.current.toFixed(2)}` : '-'}</td>
                  <td className="px-4 py-3 text-right font-mono">{bucket.days_1_30 > 0 ? `$${bucket.days_1_30.toFixed(2)}` : '-'}</td>
                  <td className="px-4 py-3 text-right font-mono">{bucket.days_31_60 > 0 ? `$${bucket.days_31_60.toFixed(2)}` : '-'}</td>
                  <td className="px-4 py-3 text-right font-mono">{bucket.days_61_90 > 0 ? `$${bucket.days_61_90.toFixed(2)}` : '-'}</td>
                  <td className="px-4 py-3 text-right font-mono text-red-400">{bucket.days_90_plus > 0 ? `$${bucket.days_90_plus.toFixed(2)}` : '-'}</td>
                  <td className="px-4 py-3 text-right font-mono font-semibold text-app-text">${bucket.total.toFixed(2)}</td>
                </tr>
                {expandedClient === bucket.name && (
                  <tr key={`${bucket.name}-invoices`}>
                    <td colSpan={8} className="px-8 py-3 bg-white/[0.02]">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-app-muted">
                            <th className="text-left py-1 font-medium">Invoice #</th>
                            <th className="text-right py-1 font-medium">Total</th>
                            <th className="text-right py-1 font-medium">Paid</th>
                            <th className="text-right py-1 font-medium">Outstanding</th>
                            <th className="text-left py-1 font-medium">Due Date</th>
                            <th className="text-left py-1 font-medium">Bucket</th>
                          </tr>
                        </thead>
                        <tbody>
                          {bucket.invoices.map((inv: any) => (
                            <tr key={inv.id} className="border-t border-white/5">
                              <td className="py-1.5 font-mono">{inv.invoice_number}</td>
                              <td className="py-1.5 text-right font-mono">${inv.grand_total.toFixed(2)}</td>
                              <td className="py-1.5 text-right font-mono">${inv.amount_paid.toFixed(2)}</td>
                              <td className="py-1.5 text-right font-mono text-app-text">${inv.outstanding.toFixed(2)}</td>
                              <td className="py-1.5">{inv.due_date?.split('T')[0] || '-'}</td>
                              <td className="py-1.5">
                                <span className={cn('px-1.5 py-0.5 rounded text-xs',
                                  inv.aging_bucket === 'current' ? 'text-green-400 bg-green-500/20' :
                                  inv.aging_bucket === 'days_90_plus' ? 'text-red-400 bg-red-500/20' :
                                  'text-yellow-400 bg-yellow-500/20'
                                )}>
                                  {BUCKET_LABELS[inv.aging_bucket] || inv.aging_bucket}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </td>
                  </tr>
                )}
              </>
            ))}
            {report.buckets.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-12 text-center text-app-muted">No outstanding receivables</td></tr>
            )}
            {report.buckets.length > 0 && (
              <tr className="border-t-2 border-white/10 font-semibold">
                <td></td>
                <td className="px-4 py-3 text-app-text">Total</td>
                <td className="px-4 py-3 text-right font-mono">${report.totals.current.toFixed(2)}</td>
                <td className="px-4 py-3 text-right font-mono">${report.totals.days_1_30.toFixed(2)}</td>
                <td className="px-4 py-3 text-right font-mono">${report.totals.days_31_60.toFixed(2)}</td>
                <td className="px-4 py-3 text-right font-mono">${report.totals.days_61_90.toFixed(2)}</td>
                <td className="px-4 py-3 text-right font-mono text-red-400">${report.totals.days_90_plus.toFixed(2)}</td>
                <td className="px-4 py-3 text-right font-mono text-app-text">${report.totals.grandTotal.toFixed(2)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
