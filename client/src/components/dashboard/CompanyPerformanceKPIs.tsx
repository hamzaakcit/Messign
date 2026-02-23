import { useMemo } from 'react';
import type { CompanyMetrics, PerformanceChartDataPoint, ActiveMetric } from '@/types/dashboard';
import { DollarSign, MessageSquare, Mail } from 'lucide-react';
import { LineChart, Line, ResponsiveContainer } from 'recharts';
import { useCountUp } from '@/hooks/useCountUp';
import { cn } from '@/lib/utils';

// High-Performance SaaS colors: Green/Teal Revenue, Blue SMS, Purple Mail
const METRIC_CONFIG = {
  revenue: {
    id: 'revenue' as const,
    label: 'Revenue',
    icon: DollarSign,
    color: '#14b8a6', // teal
    dataKey: 'revenue',
    format: (n: number) => `$${n >= 1 ? n.toFixed(2) + 'M' : (n * 1000).toFixed(0) + 'K'}`,
    formatRaw: (n: number) => (n >= 1 ? `${n.toFixed(2)}M` : `$${(n * 1000).toFixed(0)}K`),
    unit: '',
  },
  sms: {
    id: 'sms' as const,
    label: 'SMS Attempts',
    icon: MessageSquare,
    color: '#3b82f6', // blue
    dataKey: 'smsAttempts',
    format: (n: number) => `${Math.round(n)}M`,
    formatRaw: (n: number) => `${Math.round(n)}M`,
    unit: 'M',
  },
  mail: {
    id: 'mail' as const,
    label: 'Mail Attempts',
    icon: Mail,
    color: '#a855f7', // purple
    dataKey: 'mailAttempts',
    format: (n: number) => `${Math.round(n)}M`,
    formatRaw: (n: number) => `${Math.round(n)}M`,
    unit: 'M',
  },
} as const;

interface CompanyPerformanceKPIsProps {
  metrics: CompanyMetrics;
  monthlyData: PerformanceChartDataPoint[];
  activeMetric: ActiveMetric;
  onMetricSelect: (id: ActiveMetric) => void;
}

function getMetricValue(metrics: CompanyMetrics, id: ActiveMetric): number {
  if (id === 'revenue') {
    const v = metrics.revenue.value;
    return v >= 1_000_000 ? v / 1_000_000 : v >= 1_000 ? v / 1_000 : v;
  }
  if (id === 'sms') return metrics.smsAttempts.value;
  if (id === 'mail') return metrics.mailAttempts.value;
  return 0;
}

function getMetricChange(metrics: CompanyMetrics, id: ActiveMetric): number {
  if (id === 'revenue') return metrics.revenue.changePercent;
  if (id === 'sms') return metrics.smsAttempts.changePercent;
  if (id === 'mail') return metrics.mailAttempts.changePercent;
  return 0;
}

export function CompanyPerformanceKPIs({
  metrics,
  monthlyData,
  activeMetric,
  onMetricSelect,
}: CompanyPerformanceKPIsProps) {
  const configs = useMemo(
    () => [METRIC_CONFIG.revenue, METRIC_CONFIG.sms, METRIC_CONFIG.mail],
    []
  );

  const revenueValue = getMetricValue(metrics, 'revenue');
  const smsValue = getMetricValue(metrics, 'sms');
  const mailValue = getMetricValue(metrics, 'mail');
  const animatedRevenue = useCountUp(revenueValue, 1200, true, revenueValue >= 1 ? 2 : 0);
  const animatedSms = useCountUp(smsValue, 1200, true, 0);
  const animatedMail = useCountUp(mailValue, 1200, true, 0);

  const animatedValues = { revenue: animatedRevenue, sms: animatedSms, mail: animatedMail };

  return (
    <div
      className="grid grid-cols-1 md:grid-cols-3 gap-4"
      role="tablist"
      aria-label="Company performance metrics"
    >
      {configs.map((config) => {
        const change = getMetricChange(metrics, config.id);
        const isActive = activeMetric === config.id;
        const sparklineData = monthlyData.map((d) => ({
          value: (d[config.dataKey] as number) ?? 0,
        }));
        const Icon = config.icon;
        const animatedValue = animatedValues[config.id];

        return (
          <button
            key={config.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-label={`${config.label}: ${config.format(animatedValue)}. Select to view chart`}
            onClick={() => onMetricSelect(config.id)}
            className={cn(
              'relative rounded-xl p-4 text-left overflow-hidden',
              'border transition-all duration-200',
              'focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 focus:ring-offset-dark-900',
              'border-gray-800/50 bg-gray-900/40 backdrop-blur-md',
              isActive
                ? 'border-[var(--card-color)] shadow-[0_0_24px_var(--card-glow)] bg-white/[0.06]'
                : 'hover:border-white/20 hover:bg-white/[0.05]'
            )}
            style={
              isActive
                ? {
                    ['--card-color' as string]: config.color,
                    ['--card-glow' as string]: `${config.color}40`,
                  }
                : undefined
            }
          >
            {/* Tiny sparkline behind content */}
            <div className="absolute inset-0 flex items-end justify-center pointer-events-none opacity-30">
              <ResponsiveContainer width="100%" height="50%">
                <LineChart data={sparklineData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke={config.color}
                    strokeWidth={1.5}
                    dot={false}
                    isAnimationActive
                    animationDuration={600}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="relative z-10">
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center mb-2"
                style={{ backgroundColor: `${config.color}20` }}
              >
                <Icon className="w-4 h-4" style={{ color: config.color }} aria-hidden />
              </div>
              <p
                className="text-xl md:text-2xl font-bold text-white tracking-tight"
                style={{ letterSpacing: '-0.02em' }}
              >
                {config.format(animatedValue)}
              </p>
              <p className="mt-0.5 text-xs font-medium text-white/70">{config.label}</p>
              <p className="mt-0.5 text-xs text-white/50">
                {change >= 0 ? '+' : ''}{change}% vs last quarter
              </p>
            </div>
          </button>
        );
      })}
    </div>
  );
}
