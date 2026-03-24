import { useMemo } from 'react';
import type { CompanyMetrics } from '@/types/dashboard';
import { DollarSign, MessageSquare, Mail } from 'lucide-react';
import { useCountUp } from '@/hooks/useCountUp';
import { useDashboardStore, type DashboardMetric } from '@/stores/dashboardStore';
import { cn } from '@/lib/utils';

const METRIC_CONFIG = {
  revenue: {
    id: 'revenue' as const,
    label: 'Revenue',
    icon: DollarSign,
    color: '#2dd4bf',
    format: (n: number) => (n >= 1 ? `$${n.toFixed(2)}M` : `$${(n * 1000).toFixed(0)}K`),
  },
  sms: {
    id: 'sms' as const,
    label: 'SMS',
    icon: MessageSquare,
    color: '#3b82f6',
    format: (n: number) => `${Math.round(n)}M`,
  },
  mail: {
    id: 'mail' as const,
    label: 'Mail',
    icon: Mail,
    color: '#a855f7',
    format: (n: number) => `${Math.round(n)}M`,
  },
} as const;

interface DashboardKPIRowProps {
  metrics: CompanyMetrics;
}

function getMetricValue(metrics: CompanyMetrics, id: DashboardMetric): number {
  if (id === 'revenue') {
    const v = metrics.revenue.value;
    return v >= 1_000_000 ? v / 1_000_000 : v >= 1_000 ? v / 1_000 : v;
  }
  if (id === 'sms') return metrics.smsAttempts.value;
  if (id === 'mail') return metrics.mailAttempts.value;
  return 0;
}

function getMetricChange(metrics: CompanyMetrics, id: DashboardMetric): number {
  if (id === 'revenue') return metrics.revenue.changePercent;
  if (id === 'sms') return metrics.smsAttempts.changePercent;
  if (id === 'mail') return metrics.mailAttempts.changePercent;
  return 0;
}

export function DashboardKPIRow({ metrics }: DashboardKPIRowProps) {
  const { activeMetric, setActiveMetric } = useDashboardStore();
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
      className="grid grid-cols-3 gap-3"
      role="group"
      aria-label="Company performance metrics"
    >
      {configs.map((config) => {
        const change = getMetricChange(metrics, config.id);
        const isActive = activeMetric === config.id;
        const Icon = config.icon;
        const animatedValue = animatedValues[config.id];

        return (
          <button
            key={config.id}
            type="button"
            onClick={() => setActiveMetric(config.id)}
            className={cn(
              'flex items-center gap-2.5 rounded-xl p-3 h-[72px] text-left overflow-hidden',
              'border transition-all duration-200',
              'focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 focus:ring-offset-dark-900',
              'bg-[#13151a] border-gray-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]',
              isActive
                ? 'ring-1 ring-[#2dd4bf] bg-app-surface-tertiary border-[var(--card-color)] shadow-[0_0_20px_var(--card-glow)]'
                : 'hover:border-app-border-strong hover:bg-app-hover'
            )}
            style={
              isActive
                ? {
                    ['--card-color' as string]: config.color,
                    ['--card-glow' as string]: `${config.color}30`,
                  }
                : undefined
            }
          >
            {isActive ? (
              <span className="sr-only">Selected metric. </span>
            ) : null}
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
              style={{ backgroundColor: `${config.color}20` }}
            >
              <Icon className="w-4 h-4" style={{ color: config.color }} aria-hidden />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-app-text tracking-tight">
                {config.format(animatedValue)}
              </p>
              <p className="text-xs text-app-muted">{config.label}</p>
              <p className="text-xs text-app-muted">
                {change >= 0 ? '+' : ''}{change}% vs last quarter
              </p>
            </div>
          </button>
        );
      })}
    </div>
  );
}
