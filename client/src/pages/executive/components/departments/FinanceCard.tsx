import { AreaChart, Area, XAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { PiggyBank } from 'lucide-react';
import type { ExecutiveDashboard, ExecutiveChartData } from '@/lib/executiveApi';
import { DepartmentCard } from '../DepartmentCard';

interface FinanceCardProps {
  data: ExecutiveDashboard['finance'];
  chartData: ExecutiveChartData['expenseTrend'] | undefined;
  pendingCount: number;
  onAction: () => void;
}

export function FinanceCard({ data, chartData, pendingCount, onAction }: FinanceCardProps): JSX.Element {
  const last14 = chartData?.slice(-14) ?? [];

  return (
    <DepartmentCard
      id="finance"
      title="Finance"
      icon={<PiggyBank className="w-4 h-4" />}
      iconColor="#10b981"
      pendingCount={pendingCount}
      metrics={[
        { label: 'Expenses QTD', value: `€${(data.totalExpensesQTD / 1000).toFixed(0)}k` },
        { label: 'Pending', value: data.pendingApprovals },
        { label: 'Overdue', value: data.overdueInvoices },
        { label: 'Budget Health', value: `${data.budgetHealthAvg.toFixed(0)}%` },
      ]}
      chart={
        last14.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={last14}>
              <defs>
                <linearGradient id="finGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="date" tick={false} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ background: '#1e293b', border: 'none', borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: '#94a3b8' }}
                formatter={(v: number) => [`€${(v / 1000).toFixed(0)}k`, 'Expenses']}
              />
              <Area type="monotone" dataKey="value" stroke="#10b981" fill="url(#finGrad)" strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        ) : undefined
      }
      actionLabel="Review Approvals"
      onAction={onAction}
    />
  );
}
