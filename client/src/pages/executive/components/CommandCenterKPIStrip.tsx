import { useMemo } from 'react';
import { AreaChart, Area, ResponsiveContainer } from 'recharts';
import {
  TrendingUp, Briefcase, HeadphonesIcon, Target,
  Clock, PiggyBank, Users, Heart,
} from 'lucide-react';
import type { ExecutiveDashboard, ExecutiveChartData } from '@/lib/executiveApi';

interface KPIItem {
  /** DOM id suffix for `dept-${scrollTargetId}` scroll targets */
  scrollTargetId: string;
  label: string;
  value: string;
  icon: React.ReactNode;
  color: string;
  sparkData: { v: number }[];
}

interface CommandCenterKPIStripProps {
  data: ExecutiveDashboard;
  chartData: ExecutiveChartData | null;
  onKPIClick: (sectionId: string) => void;
}

function formatCurrency(val: number): string {
  if (val >= 1_000_000) return `€${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `€${(val / 1_000).toFixed(0)}k`;
  return `€${val.toFixed(0)}`;
}

function sparkHasVariation(sparkData: { v: number }[]): boolean {
  if (sparkData.length < 2) return false;
  const first = sparkData[0]?.v ?? 0;
  return sparkData.some((d) => (d.v ?? 0) !== first);
}

export function CommandCenterKPIStrip({ data, chartData, onKPIClick }: CommandCenterKPIStripProps): JSX.Element {
  const kpis = useMemo<KPIItem[]>(() => {
    const revSpark = chartData?.revenueTrend.map((d) => ({ v: d.value })) ?? [];
    const expSpark = chartData?.expenseTrend.map((d) => ({ v: d.value })) ?? [];
    const tktSpark = chartData?.ticketTrend.map((d) => ({ v: d.opened })) ?? [];
    const ldSpark = chartData?.leadsTrend.map((d) => ({ v: d.value })) ?? [];
    const utilSpark = chartData?.utilizationTrend.map((d) => ({ v: d.value })) ?? [];

    return [
      {
        scrollTargetId: 'sales',
        label: 'Revenue YTD',
        value: formatCurrency(data.revenue.totalYTD),
        icon: <TrendingUp className="w-4 h-4" />,
        color: '#10b981',
        sparkData: revSpark,
      },
      {
        scrollTargetId: 'pipeline',
        label: 'Pipeline',
        value: formatCurrency(data.revenue.weightedPipeline),
        icon: <Briefcase className="w-4 h-4" />,
        color: '#3b82f6',
        sparkData: revSpark.slice(-14),
      },
      {
        scrollTargetId: 'support',
        label: 'Open Tickets',
        value: `${data.support.openTickets}`,
        icon: <HeadphonesIcon className="w-4 h-4" />,
        color: '#f59e0b',
        sparkData: tktSpark,
      },
      {
        scrollTargetId: 'okr',
        label: 'OKR Progress',
        value: `${data.okrs.overallProgress.toFixed(0)}%`,
        icon: <Target className="w-4 h-4" />,
        color: '#8b5cf6',
        sparkData: [],
      },
      {
        scrollTargetId: 'time',
        label: 'Utilization',
        value: `${data.people.avgUtilization.toFixed(0)}%`,
        icon: <Clock className="w-4 h-4" />,
        color: '#06b6d4',
        sparkData: utilSpark,
      },
      {
        scrollTargetId: 'finance',
        label: 'Budget Health',
        value: `${data.finance.budgetHealthAvg.toFixed(0)}%`,
        icon: <PiggyBank className="w-4 h-4" />,
        color: '#10b981',
        sparkData: expSpark.slice(-14),
      },
      {
        scrollTargetId: 'hr',
        label: 'Open Positions',
        value: `${data.people.openPositions}`,
        icon: <Users className="w-4 h-4" />,
        color: '#ec4899',
        sparkData: ldSpark.slice(-14),
      },
      {
        scrollTargetId: 'culture',
        label: 'Culture Score',
        value: data.culture ? `${data.culture.healthScore.toFixed(0)}` : 'N/A',
        icon: <Heart className="w-4 h-4" />,
        color: '#f43f5e',
        sparkData: [],
      },
    ];
  }, [data, chartData]);

  return (
    <div data-testid="executive-kpis" className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
      {kpis.map((kpi, i) => {
        const showSpark =
          kpi.sparkData.length > 2 && sparkHasVariation(kpi.sparkData);
        return (
          <button
            key={`${kpi.scrollTargetId}-${i}`}
            type="button"
            data-testid={`kpi-${kpi.label.replace(/\s/g, '-').toLowerCase()}`}
            onClick={() => onKPIClick(kpi.scrollTargetId)}
            className="group min-w-[160px] flex-shrink-0 rounded-lg border border-app bg-app-card p-3
                       hover:border-primary-500/40 hover:bg-app-hover transition-all cursor-pointer"
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-app-muted">{kpi.label}</span>
              <span style={{ color: kpi.color }}>{kpi.icon}</span>
            </div>
            <div className="text-lg font-bold text-app">{kpi.value}</div>
            {showSpark ? (
              <div className="h-6 mt-1">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={kpi.sparkData}>
                    <defs>
                      <linearGradient id={`spark-${i}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={kpi.color} stopOpacity={0.3} />
                        <stop offset="100%" stopColor={kpi.color} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <Area
                      type="monotone"
                      dataKey="v"
                      stroke={kpi.color}
                      strokeWidth={1.5}
                      fill={`url(#spark-${i})`}
                      dot={false}
                      isAnimationActive={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : kpi.sparkData.length > 2 ? (
              <p className="mt-1 h-6 text-[10px] text-app-muted leading-tight">No trend yet</p>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
