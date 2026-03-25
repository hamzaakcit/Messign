import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { Clock } from 'lucide-react';
import type { ExecutiveDashboard, ExecutiveChartData } from '@/lib/executiveApi';
import { DepartmentCard } from '../DepartmentCard';

interface TimeCardProps {
  data: ExecutiveDashboard['people'];
  chartData: ExecutiveChartData['utilizationTrend'] | undefined;
  pendingCount: number;
  onAction: () => void;
}

function utilizationHasVariation(rows: ExecutiveChartData['utilizationTrend']): boolean {
  if (rows.length < 2) return false;
  const v0 = rows[0].value;
  return rows.some((d) => d.value !== v0);
}

export function TimeCard({ data, chartData, pendingCount, onAction }: TimeCardProps): JSX.Element {
  const last14 = chartData?.slice(-14) ?? [];
  const showChart = last14.length > 0 && utilizationHasVariation(last14);

  return (
    <DepartmentCard
      id="time"
      title="Time Tracking"
      icon={<Clock className="w-4 h-4" />}
      iconColor="#06b6d4"
      pendingCount={pendingCount}
      metrics={[
        { label: 'Utilization', value: `${data.avgUtilization.toFixed(0)}%` },
        { label: 'Pending Sheets', value: data.pendingTimesheets },
        { label: 'Employees', value: data.totalEmployees },
        { label: 'New Hires', value: data.newHiresThisMonth },
      ]}
      chart={
        showChart ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={last14}>
              <XAxis dataKey="date" tick={false} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ background: '#1e293b', border: 'none', borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: '#94a3b8' }}
                formatter={(v: number) => [`${v.toFixed(1)}h`, 'Hours']}
              />
              <Bar dataKey="value" fill="#06b6d4" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : last14.length > 0 ? (
          <div className="flex h-full items-center justify-center text-[11px] text-app-muted">No trend yet</div>
        ) : undefined
      }
      actionLabel="Approve Timesheets"
      onAction={onAction}
    />
  );
}
