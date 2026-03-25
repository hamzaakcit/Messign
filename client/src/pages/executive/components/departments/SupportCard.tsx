import { LineChart, Line, XAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { HeadphonesIcon } from 'lucide-react';
import type { ExecutiveDashboard, ExecutiveChartData } from '@/lib/executiveApi';
import { DepartmentCard } from '../DepartmentCard';

interface SupportCardProps {
  data: ExecutiveDashboard['support'];
  chartData: ExecutiveChartData['ticketTrend'] | undefined;
  onAction: () => void;
}

function ticketTrendHasVariation(rows: ExecutiveChartData['ticketTrend']): boolean {
  if (rows.length < 2) return false;
  const a = rows[0];
  return rows.some(
    (d) => d.opened !== a.opened || d.resolved !== a.resolved,
  );
}

export function SupportCard({ data, chartData, onAction }: SupportCardProps): JSX.Element {
  const last14 = chartData?.slice(-14) ?? [];
  const showChart = last14.length > 0 && ticketTrendHasVariation(last14);

  return (
    <DepartmentCard
      id="support"
      title="Support"
      icon={<HeadphonesIcon className="w-4 h-4" />}
      iconColor="#f59e0b"
      metrics={[
        { label: 'Open Tickets', value: data.openTickets },
        { label: 'CSAT', value: data.csatScore.toFixed(1) },
        { label: 'SLA', value: `${data.slaCompliance.toFixed(0)}%` },
        { label: 'At Risk', value: data.atRiskCustomers },
      ]}
      chart={
        showChart ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={last14}>
              <XAxis dataKey="date" tick={false} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ background: '#1e293b', border: 'none', borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: '#94a3b8' }}
              />
              <Line type="monotone" dataKey="opened" stroke="#f59e0b" strokeWidth={2} dot={false} name="Opened" />
              <Line type="monotone" dataKey="resolved" stroke="#10b981" strokeWidth={2} dot={false} name="Resolved" />
            </LineChart>
          </ResponsiveContainer>
        ) : last14.length > 0 ? (
          <div className="flex h-full items-center justify-center text-[11px] text-app-muted">No trend yet</div>
        ) : undefined
      }
      actionLabel="Manage Tickets"
      onAction={onAction}
    />
  );
}
