import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { TrendingUp } from 'lucide-react';
import type { ExecutiveDashboard, ExecutiveChartData } from '@/lib/executiveApi';
import { DepartmentCard } from '../DepartmentCard';

interface SalesCardProps {
  data: ExecutiveDashboard['revenue'];
  chartData: ExecutiveChartData['revenueTrend'] | undefined;
  onAction: () => void;
}

export function SalesCard({ data, chartData, onAction }: SalesCardProps): JSX.Element {
  const last14 = chartData?.slice(-14) ?? [];

  return (
    <DepartmentCard
      id="sales"
      title="Sales / CRM"
      icon={<TrendingUp className="w-4 h-4" />}
      iconColor="#3b82f6"
      metrics={[
        { label: 'Pipeline', value: `€${(data.pipelineValue / 1000).toFixed(0)}k` },
        { label: 'Deals Won', value: data.dealsWonThisMonth },
        { label: 'Win Rate', value: `${data.winRate.toFixed(0)}%` },
        { label: 'Weighted', value: `€${(data.weightedPipeline / 1000).toFixed(0)}k` },
      ]}
      chart={
        last14.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={last14}>
              <XAxis dataKey="date" tick={false} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ background: '#1e293b', border: 'none', borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: '#94a3b8' }}
                formatter={(v: number) => [`€${(v / 1000).toFixed(0)}k`, 'Revenue']}
              />
              <Bar dataKey="value" fill="#3b82f6" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : undefined
      }
      actionLabel="Manage Deals"
      onAction={onAction}
    />
  );
}
