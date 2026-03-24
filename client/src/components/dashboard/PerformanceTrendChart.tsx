import { useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { useDashboardStore } from '@/stores/dashboardStore';
import { useTrendData } from '@/hooks/useTrendData';
import { cn } from '@/lib/utils';

const REVENUE_COLOR = '#2dd4bf';
const SMS_COLOR = '#3b82f6';
const MAIL_COLOR = '#a855f7';

const METRIC_CONFIG = {
  revenue: {
    name: 'Revenue',
    color: REVENUE_COLOR,
    formatValue: (v: number) => (v >= 1 ? `$${v.toFixed(2)}M` : `$${(v * 1000).toFixed(0)}K`),
  },
  sms: {
    name: 'SMS',
    color: SMS_COLOR,
    formatValue: (v: number) => `${Math.round(v)}M`,
  },
  mail: {
    name: 'Mail',
    color: MAIL_COLOR,
    formatValue: (v: number) => `${Math.round(v)}M`,
  },
} as const;

const RANGE_LABELS: Record<string, string> = {
  '7d': '7 Days',
  '90d': '90 Days',
  '12m': '12 Months',
  '3y': '3 Years',
};

const RANGE_SUBTITLES: Record<string, string> = {
  '7d': 'Last 7 days',
  '90d': 'Last 90 days',
  '12m': 'Last 12 months',
  '3y': 'Last 3 years',
};

function ChartTooltip({
  active,
  payload,
  label,
  metric,
}: {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
  metric: 'revenue' | 'sms' | 'mail';
}) {
  if (!active || !payload?.length || !label) return null;
  const config = METRIC_CONFIG[metric];
  const value = payload[0]?.value ?? 0;
  return (
    <div
      className="rounded-xl border border-app-border bg-[rgba(20,20,28,0.95)] px-4 py-4 shadow-[0_8px_32px_rgba(0,0,0,0.5)] backdrop-blur-md min-w-[160px]"
      role="tooltip"
    >
      <p className="text-sm font-semibold text-app-text/80 mb-2">{label}</p>
      <div className="flex items-center justify-between gap-4">
        <span className="text-[13px] text-app-text/60">{config.name}</span>
        <span className="text-base font-bold text-app-text" style={{ color: config.color }}>
          {config.formatValue(value)}
        </span>
      </div>
    </div>
  );
}

export function PerformanceTrendChart() {
  const activeMetric = useDashboardStore((s) => s.activeMetric);
  const activeEntity = useDashboardStore((s) => s.activeEntity);
  const activeEntityName = useDashboardStore((s) => s.activeEntityName);
  const timeRange = useDashboardStore((s) => s.timeRange);
  const setTimeRange = useDashboardStore((s) => s.setTimeRange);
  const clearEntitySelection = useDashboardStore((s) => s.clearEntitySelection);
  const { data, loading, error } = useTrendData();

  const config = METRIC_CONFIG[activeMetric];
  const gradientId = useMemo(() => `bar-gradient-${activeMetric}`, [activeMetric]);
  const isDense = data.length > 20;
  const barCategoryGap = isDense ? 2 : 24;
  const xAxisInterval = isDense ? Math.max(0, Math.floor(data.length / 12) - 1) : 0;

  const chartTitle = useMemo(() => {
    const entityLabel = activeEntity === 'company' ? 'Company' : (activeEntityName ?? 'Member');
    const metricLabel = config.name;
    return `${entityLabel} ${metricLabel} Trend`;
  }, [activeEntity, activeEntityName, config.name]);

  const yAxisFormatter = useCallback(
    (v: number) => {
      if (activeMetric === 'revenue') {
        if (v >= 1) return `$${v}M`;
        if (v >= 0.1) return `$${v.toFixed(1)}M`;
        return `$${(v * 1000).toFixed(0)}K`;
      }
      return v >= 100 ? `${Math.round(v)}M` : `${v}`;
    },
    [activeMetric]
  );

  return (
    <motion.div
      layout
      transition={{ duration: 0.2 }}
      className="flex flex-col min-h-0 overflow-hidden h-full"
      role="region"
      aria-label={`Performance trend: ${config.name}`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3 shrink-0">
        <div className="flex items-center gap-2 flex-wrap">
          <div>
            <h3 className="text-sm font-semibold text-app-text">{chartTitle}</h3>
            <p className="text-xs text-app-muted mt-0.5">{RANGE_SUBTITLES[timeRange]}</p>
          </div>
          {activeEntity !== 'company' && (
            <button
              type="button"
              onClick={clearEntitySelection}
              className="text-xs px-2 py-1 rounded-md bg-app-surface-tertiary text-app-muted hover:text-app-text hover:bg-app-hover transition-colors"
            >
              Clear selection
            </button>
          )}
        </div>
        <div
          className="flex flex-wrap rounded-full p-1 bg-app-surface-tertiary border border-app-border gap-0.5"
          role="group"
          aria-label="Time period"
        >
          {(['7d', '90d', '12m'] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setTimeRange(r)}
              className={cn(
                'px-2.5 py-1.5 text-xs font-medium rounded-full transition-all duration-200',
                timeRange === r
                  ? 'bg-indigo-500/20 border border-indigo-500/40 text-app-text'
                  : 'text-app-text/50 hover:bg-app-hover'
              )}
            >
              {RANGE_LABELS[r]}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 min-h-[180px] w-full">
        {loading ? (
          <div className="h-full w-full flex items-center justify-center bg-app-surface-tertiary rounded-lg animate-pulse">
            <div className="flex flex-col items-center gap-2">
              <div className="w-8 h-8 border-2 border-app-border-strong border-t-primary-500 rounded-full animate-spin" />
              <p className="text-xs text-app-muted">Loading chart...</p>
            </div>
          </div>
        ) : error ? (
          <div className="h-full w-full flex items-center justify-center">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        ) : data.length === 0 ? (
          <div className="h-full w-full flex items-center justify-center">
            <p className="text-sm text-app-muted">No data available</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              margin={{ top: 24, right: 24, bottom: 24, left: 24 }}
              barCategoryGap={isDense ? `${barCategoryGap}%` : '24%'}
              barGap={isDense ? 1 : 0}
            >
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={config.color} stopOpacity={1} />
                  <stop offset="100%" stopColor={config.color} stopOpacity={0.2} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="rgba(255,255,255,0.08)"
                horizontal
                vertical={false}
              />
              <XAxis
                dataKey="period"
                tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: isDense ? 10 : 13 }}
                axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
                tickLine={false}
                interval={xAxisInterval}
              />
              <YAxis
                tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 13 }}
                axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
                tickLine={false}
                tickFormatter={yAxisFormatter}
                width={48}
              />
              <Tooltip
                content={(props) => (
                  <ChartTooltip {...props} metric={activeMetric} payload={props.payload as Array<{ value: number }>} />
                )}
                cursor={{ fill: 'rgba(255,255,255,0.05)' }}
              />
              <Bar
                dataKey="value"
                name={config.name}
                fill={`url(#${gradientId})`}
                radius={[4, 4, 0, 0]}
                maxBarSize={56}
                isAnimationActive
                animationDuration={500}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </motion.div>
  );
}
