import { Area, AreaChart, ResponsiveContainer } from 'recharts';
import { cn } from '@/lib/utils';
import type { DashboardMetrics } from '@/lib/marketingApi';
import { marketingShell } from '@/pages/marketing/lib/marketingShellTheme';

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-IE', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(value || 0);
}

interface SparkChipProps {
  label: string;
  value: string | number;
  sparkData?: Array<{ v: number }>;
  color?: string;
}

export function SparkChip({
  label,
  value,
  sparkData,
  color = marketingShell.sparkChart.default,
}: SparkChipProps): JSX.Element {
  return (
    <div className="flex min-w-0 items-center gap-1.5 rounded-lg border border-white/[0.08] bg-app-surface-tertiary px-2 py-1.5 sm:h-9 sm:gap-2 sm:px-3 sm:h-10">
      <div className="min-w-0 flex-1">
        <p className="truncate text-[10px] leading-none text-app-muted">{label}</p>
        <p className="truncate text-xs font-semibold leading-tight text-app-text sm:text-sm">{value}</p>
      </div>
      {sparkData && sparkData.length > 1 && (
        <div className="hidden h-5 min-h-[22px] w-10 min-w-[40px] shrink-0 sm:block sm:h-6 sm:w-14">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={sparkData} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id={`spark-${label}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="v"
                stroke={color}
                strokeWidth={1.5}
                fill={`url(#spark-${label})`}
                dot={false}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

export interface MarketingMetricChipsProps {
  metrics: DashboardMetrics | null;
  loading?: boolean;
  /** Compact grid for the Lucy bento column (2×2). Default: full strip layout */
  variant?: 'strip' | 'bento';
  className?: string;
}

/**
 * Reusable MQL / CPL / ROI / Open Rate chips (same data as SparkBar).
 */
export function MarketingMetricChips({
  metrics,
  loading = false,
  variant = 'strip',
  className,
}: MarketingMetricChipsProps): JSX.Element {
  const leadSpark = metrics?.monthlyTrend.map((t) => ({ v: t.leads })) ?? [];
  const spendSpark = metrics?.monthlyTrend.map((t) => ({ v: t.spend })) ?? [];

  const gridClass =
    variant === 'bento'
      ? 'grid grid-cols-2 gap-1.5'
      : 'grid w-full min-w-0 grid-cols-2 gap-2 xl:grid-cols-4';

  if (loading) {
    return (
      <div className={cn(gridClass, className)}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-14 animate-pulse rounded-lg bg-app-surface-tertiary sm:h-9 md:h-10" />
        ))}
      </div>
    );
  }

  return (
    <div className={cn(gridClass, 'min-w-0', variant === 'strip' && 'flex-1', className)}>
      <SparkChip
        label="MQLs"
        value={metrics?.mqls ?? 0}
        sparkData={leadSpark}
        color={marketingShell.sparkChart.mql}
      />
      <SparkChip
        label="CPL"
        value={formatCurrency(metrics?.cpl ?? 0)}
        sparkData={spendSpark}
        color={marketingShell.sparkChart.cpl}
      />
      <SparkChip label="ROI" value={`${(metrics?.roi ?? 0).toFixed(1)}x`} color={marketingShell.sparkChart.roi} />
      <SparkChip
        label="Open Rate"
        value={`${(metrics?.emailOpenRate ?? 0).toFixed(1)}%`}
        color={marketingShell.sparkChart.openRate}
      />
    </div>
  );
}
