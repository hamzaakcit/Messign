import { useMemo } from 'react';
import { Banknote, Receipt } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { DoraWidgetShell } from './DoraWidgetShell';

interface ClaimRow {
  id?: string;
  title?: string;
  amount?: number;
  original_amount?: number;
  status?: string;
  created_at?: string;
}

interface ReimbursementAggregatesShape {
  count: number;
  totalAmount: number;
  byStatus: Record<string, number>;
  byMonth: Record<string, number>;
}

interface ReimbursementClaimsData {
  claims?: ClaimRow[];
  aggregates?: ReimbursementAggregatesShape | null;
  filter?: string;
}

function parseData(data: unknown): ReimbursementClaimsData {
  if (!data || typeof data !== 'object') return {};
  const o = data as Record<string, unknown>;
  return {
    claims: Array.isArray(o.claims) ? (o.claims as ClaimRow[]) : [],
    aggregates: (o.aggregates as ReimbursementAggregatesShape) ?? null,
    filter: typeof o.filter === 'string' ? o.filter : undefined,
  };
}

function amountOf(c: ClaimRow): number {
  const n = c.amount ?? c.original_amount;
  const v = typeof n === 'number' ? n : Number(n ?? 0);
  return Number.isFinite(v) ? v : 0;
}

export default function ReimbursementClaimsWidget({ data }: { data: unknown }): JSX.Element {
  const parsed = parseData(data);
  const claims = parsed.claims ?? [];
  const aggregates = parsed.aggregates;
  const filter = parsed.filter ?? 'all';

  const total = aggregates?.totalAmount ?? claims.reduce((s, c) => s + amountOf(c), 0);
  const count = aggregates?.count ?? claims.length;

  const monthChart = useMemo(() => {
    const src = aggregates?.byMonth ?? {};
    const keys = Object.keys(src).sort();
    return keys.map((k) => ({ month: k, count: src[k] ?? 0 }));
  }, [aggregates]);

  const subtitle =
    filter === 'pending'
      ? `${count} outstanding · $${total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : `${count} claim(s) · $${total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  if (claims.length === 0) {
    return (
      <DoraWidgetShell
        title="Reimbursements"
        icon={<Receipt size={14} className="text-emerald-400" />}
        subtitle={filter === 'pending' ? 'Nothing pending' : 'No claims'}
        accentGradient="linear-gradient(90deg, #10b981, #0ea5e9)"
      >
        <p className="text-sm text-app-text/50">
          {filter === 'pending'
            ? 'You have no outstanding reimbursement claims.'
            : 'No reimbursement claims match this filter.'}
        </p>
      </DoraWidgetShell>
    );
  }

  return (
    <DoraWidgetShell
      title="Reimbursements"
      icon={<Receipt size={14} className="text-emerald-400" />}
      subtitle={subtitle}
      accentGradient="linear-gradient(90deg, #10b981, #0ea5e9)"
    >
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-app-border/70 bg-app-bg/30 px-3 py-2">
            <div className="text-[10px] uppercase tracking-wider text-app-muted">Claims</div>
            <div className="text-lg font-bold text-app-text tabular-nums flex items-center gap-1">
              <Receipt size={16} className="text-emerald-400" />
              {count}
            </div>
          </div>
          <div className="rounded-xl border border-app-border/70 bg-app-bg/30 px-3 py-2">
            <div className="text-[10px] uppercase tracking-wider text-app-muted">Total amount</div>
            <div className="text-lg font-bold text-app-text tabular-nums flex items-center gap-1">
              <Banknote size={16} className="text-sky-400" />$
              {total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
        </div>

        {monthChart.length > 0 && (
          <div className="rounded-xl border border-app-border/60 p-2" style={{ minHeight: 140 }}>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-app-muted mb-1 px-1">
              Claims by month
            </p>
            <div style={{ height: 120 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthChart} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.1)" />
                  <XAxis dataKey="month" tick={{ fontSize: 9, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 9, fill: '#94a3b8' }} allowDecimals={false} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{
                      background: 'rgba(15,23,42,0.95)',
                      border: '1px solid rgba(148,163,184,0.15)',
                      borderRadius: 8,
                      fontSize: 11,
                    }}
                  />
                  <Bar dataKey="count" fill="#10b981" radius={[4, 4, 0, 0]} name="Claims" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
          {claims.map((c, i) => (
            <div
              key={`${c.id ?? 'c'}-${i}`}
              className="rounded-lg border border-app-border/50 bg-app-surface-tertiary/60 px-3 py-2"
            >
              <div className="flex justify-between gap-2 items-start">
                <div className="min-w-0">
                  <div className="font-medium text-app-text text-sm">{c.title ?? 'Claim'}</div>
                  <p className="text-[10px] text-app-muted mt-0.5 uppercase">{c.status ?? '—'}</p>
                </div>
                <div className="text-sm font-semibold text-app-text tabular-nums shrink-0">
                  ${amountOf(c).toFixed(2)}
                </div>
              </div>
              {c.created_at ? (
                <p className="text-[10px] text-app-muted/70 mt-1">
                  {new Date(c.created_at).toLocaleDateString()}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </DoraWidgetShell>
  );
}
