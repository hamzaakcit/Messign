import { DollarSign, Receipt, TrendingUp, AlertCircle, CheckCircle } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface FinancialSummaryWidgetProps {
  data: Record<string, unknown>;
  title?: string;
  delay?: number;
}

const CATEGORY_COLORS = ['#38bdf8', '#8b5cf6', '#22c55e', '#f59e0b', '#ec4899', '#6366f1', '#06b6d4', '#ef4444'];

function parseNum(val: unknown): number {
  if (typeof val === 'number') return val;
  if (typeof val === 'string') return parseFloat(val) || 0;
  return 0;
}

function formatCurrency(amount: number): string {
  if (amount >= 1000) return `$${(amount / 1000).toFixed(1)}k`;
  return `$${amount.toFixed(2)}`;
}

export function FinancialSummaryWidget({ data, title, delay = 0 }: FinancialSummaryWidgetProps) {
  const reimbursements = data.reimbursements as Record<string, unknown> | null;
  const invoices = data.invoices as Record<string, unknown> | null;
  const topCategories = (data.topCategories as Array<Record<string, unknown>>) || [];

  const reimbTotal = parseNum(reimbursements?.total_amount);
  const reimbCount = parseNum(reimbursements?.total_count);
  const pendingAmount = parseNum(reimbursements?.pending_amount);
  const pendingCount = parseNum(reimbursements?.pending_count);
  const approvedAmount = parseNum(reimbursements?.approved_amount);
  const rejectedCount = parseNum(reimbursements?.rejected_count);

  const invTotal = parseNum(invoices?.total_amount);
  const invCount = parseNum(invoices?.total);
  const invPaid = parseNum(invoices?.paid);
  const invUnpaid = parseNum(invoices?.unpaid);

  const chartData = topCategories.map((c) => ({
    name: String(c.category || c.name || 'Other'),
    amount: parseNum(c.total),
    count: parseNum(c.count),
  }));

  return (
    <div
      className="dora-fade-up dora-glass dora-glow-border"
      style={{
        borderRadius: 'var(--dora-r-widget, 16px)',
        overflow: 'hidden',
        animationDelay: `${delay}s`,
        opacity: delay > 0 ? 0 : undefined,
        marginTop: 12,
      }}
    >
      <div style={{ height: 3, background: 'linear-gradient(90deg, #22c55e, #38bdf8)', opacity: 0.6 }} />

      <div style={{ padding: '16px 18px' }}>
        {title && (
          <h3
            className="dora-font"
            style={{ fontSize: 13, fontWeight: 600, color: '#f1f5f9', margin: '0 0 14px', display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <DollarSign size={14} color="#22c55e" /> Financial Summary
          </h3>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginBottom: chartData.length > 0 ? 14 : 0 }}>
          {invCount > 0 && (
            <MetricTile
              icon={Receipt}
              label="Invoices"
              value={formatCurrency(invTotal)}
              sub={`${invCount} total`}
              color="#38bdf8"
            />
          )}
          {invCount > 0 && (
            <MetricTile
              icon={invUnpaid > 0 ? AlertCircle : CheckCircle}
              label={invUnpaid > 0 ? 'Unpaid' : 'All Paid'}
              value={String(invUnpaid)}
              sub={`${invPaid} paid`}
              color={invUnpaid > 0 ? '#f59e0b' : '#22c55e'}
            />
          )}
          {reimbCount > 0 && (
            <MetricTile
              icon={TrendingUp}
              label="Reimbursements"
              value={formatCurrency(reimbTotal)}
              sub={`${reimbCount} claims`}
              color="#8b5cf6"
            />
          )}
          {reimbCount > 0 && (
            <MetricTile
              icon={AlertCircle}
              label="Pending"
              value={formatCurrency(pendingAmount)}
              sub={`${pendingCount} claims${rejectedCount > 0 ? `, ${rejectedCount} rejected` : ''}`}
              color="#f59e0b"
            />
          )}
          {reimbCount === 0 && invCount === 0 && (
            <MetricTile
              icon={DollarSign}
              label="Approved"
              value={formatCurrency(approvedAmount)}
              sub="No activity this period"
              color="#22c55e"
            />
          )}
        </div>

        {chartData.length > 0 && (
          <div>
            <p style={{ fontSize: 11, color: '#64748b', fontWeight: 500, marginBottom: 8 }}>
              Top Spending Categories
            </p>
            <ResponsiveContainer width="100%" height={Math.min(chartData.length * 32 + 20, 180)}>
              <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
                <XAxis type="number" tick={{ fontSize: 9, fill: '#475569' }} axisLine={false} tickLine={false} tickFormatter={(v: number) => formatCurrency(v)} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={80} />
                <Tooltip
                  contentStyle={{
                    background: 'rgba(15,23,42,0.9)',
                    border: '1px solid rgba(148,163,184,0.1)',
                    borderRadius: 8,
                    fontSize: 11,
                    color: '#e2e8f0',
                    padding: '6px 10px',
                    backdropFilter: 'blur(12px)',
                  }}
                  formatter={(v: number) => [formatCurrency(v), 'Amount']}
                />
                <Bar dataKey="amount" radius={[0, 4, 4, 0]} barSize={14}>
                  {chartData.map((_, i) => (
                    <Cell key={i} fill={CATEGORY_COLORS[i % CATEGORY_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}

function MetricTile({ icon: Icon, label, value, sub, color }: {
  icon: typeof DollarSign;
  label: string;
  value: string;
  sub?: string;
  color: string;
}) {
  return (
    <div
      className="dora-glass-light dora-glow-border"
      style={{ borderRadius: 'var(--dora-r-card, 14px)', padding: '12px 14px' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <div style={{
          width: 24, height: 24, borderRadius: 6,
          background: `${color}12`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon size={12} color={color} />
        </div>
        <span style={{ fontSize: 10.5, color: '#64748b' }}>{label}</span>
      </div>
      <p className="dora-mono" style={{ fontSize: 18, fontWeight: 700, color: '#f1f5f9', margin: 0, lineHeight: 1 }}>
        {value}
      </p>
      {sub && <p style={{ fontSize: 10, color: '#475569', margin: '3px 0 0' }}>{sub}</p>}
    </div>
  );
}
