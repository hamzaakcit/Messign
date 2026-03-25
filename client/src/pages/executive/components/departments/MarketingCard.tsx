import { AreaChart, Area, XAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { Megaphone } from 'lucide-react';
import type { ExecutiveDashboard, ExecutiveChartData } from '@/lib/executiveApi';
import { DepartmentCard } from '../DepartmentCard';

interface MarketingCardProps {
  data: ExecutiveDashboard['marketing'];
  chartData: ExecutiveChartData['leadsTrend'] | undefined;
  onAction: () => void;
}

export function MarketingCard({ data, chartData, onAction }: MarketingCardProps): JSX.Element {
  const last14 = chartData?.slice(-14) ?? [];

  return (
    <DepartmentCard
      id="marketing"
      title="Marketing"
      icon={<Megaphone className="w-4 h-4" />}
      iconColor="#8b5cf6"
      metrics={[
        { label: 'MQLs', value: data.mqls },
        { label: 'Campaigns', value: data.activeCampaigns },
        { label: 'Avg ROI', value: `${data.avgROI.toFixed(1)}x` },
        { label: 'Leads/mo', value: data.leadsThisMonth },
      ]}
      chart={
        last14.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={last14}>
              <defs>
                <linearGradient id="mktGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="date" tick={false} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ background: '#1e293b', border: 'none', borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: '#94a3b8' }}
                formatter={(v: number) => [v, 'Leads']}
              />
              <Area type="monotone" dataKey="value" stroke="#8b5cf6" fill="url(#mktGrad)" strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        ) : undefined
      }
      actionLabel="Manage Campaigns"
      onAction={onAction}
    />
  );
}
