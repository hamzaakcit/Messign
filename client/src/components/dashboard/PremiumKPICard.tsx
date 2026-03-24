import { useMemo } from 'react';
import { DollarSign, MessageSquare, Mail, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { AreaChart, Area, ResponsiveContainer } from 'recharts';
import type { DashboardMetric } from '@/types/dashboard';
import { useCountUp } from '@/hooks/useCountUp';
import { cn } from '@/lib/utils';

const ICON_MAP: Record<string, LucideIcon> = {
  DollarSign,
  MessageSquare,
  Mail,
};

interface PremiumKPICardProps {
  metric: DashboardMetric;
  index: number;
  onCardClick?: (id: string) => void;
}

export function PremiumKPICard({ metric, index, onCardClick }: PremiumKPICardProps) {
  const {
    id,
    name,
    value,
    change,
    changeType,
    icon,
    color,
    sparklineData,
    target,
    comparisonValue,
    comparisonPeriod,
    format,
  } = metric;

  const IconComponent = ICON_MAP[icon] ?? DollarSign;
  const animatedValue = useCountUp(value, 1500, true, value < 100 ? 2 : 0);

  const sparklineChartData = useMemo(
    () => sparklineData.map((v, i) => ({ value: v, index: i })),
    [sparklineData]
  );

  const trendGradient = useMemo(() => {
    if (changeType === 'positive') return 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
    if (changeType === 'negative') return 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)';
    return 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)';
  }, [changeType]);

  const progressToTarget = target ? Math.min(100, (value / target) * 100) : null;

  const TrendIcon = change > 0 ? TrendingUp : change < 0 ? TrendingDown : Minus;

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={() => onCardClick?.(id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onCardClick?.(id);
        }
      }}
      className={cn(
        'group relative min-h-[200px] rounded-[20px] p-6 overflow-hidden',
        'border border-white/[0.08] backdrop-blur-[20px]',
        'transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]',
        'hover:-translate-y-1 hover:shadow-[0_12px_40px_rgba(0,0,0,0.6)]',
        'focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 focus:ring-offset-[#0a0a0f]',
        'cursor-pointer animate-kpi-enter'
      )}
      style={{
        background: 'linear-gradient(135deg, rgba(30,30,45,0.6) 0%, rgba(20,20,35,0.8) 100%)',
        animationDelay: `${index * 50}ms`,
      }}
      aria-label={`${name}: ${format(animatedValue)}. ${change >= 0 ? 'Up' : 'Down'} ${Math.abs(change)}% ${comparisonPeriod}`}
    >
      {/* Hover border glow */}
      <div
        className="absolute inset-0 rounded-[20px] pointer-events-none opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{
          boxShadow: `inset 0 0 0 1px ${color}66`,
        }}
        aria-hidden
      />

      {/* Trend arrow watermark */}
      <div
        className="absolute bottom-2 right-4 text-app-text/[0.03] pointer-events-none"
        style={{ fontSize: '4rem' }}
        aria-hidden
      >
        {change >= 0 ? '↑' : '↓'}
      </div>

      {/* Micro-sparkline top-right */}
      <div className="absolute top-5 right-5 w-20 h-8 rounded-lg overflow-hidden bg-white/5">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={sparklineChartData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={`spark-${id}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.4} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <Area
              type="monotone"
              dataKey="value"
              stroke={color}
              strokeWidth={1.5}
              fill={`url(#spark-${id})`}
              isAnimationActive
              animationDuration={800}
              animationEasing="ease-out"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Change pill */}
      <div
        className={cn(
          'absolute top-5 right-28 flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold',
          changeType === 'positive' && 'bg-emerald-500/20 text-emerald-400',
          changeType === 'negative' && 'bg-red-500/20 text-red-400',
          changeType === 'neutral' && 'bg-indigo-500/20 text-indigo-400'
        )}
        style={changeType === 'positive' ? { boxShadow: '0 0 12px rgba(16,185,129,0.3)' } : undefined}
        title={comparisonValue != null ? `↑ ${format(comparisonValue)} from last period` : undefined}
      >
        <TrendIcon className="w-3.5 h-3.5 shrink-0" aria-hidden />
        <span>{change >= 0 ? '+' : ''}{change}%</span>
      </div>

      {/* Icon with gradient orb */}
      <div
        className="relative w-14 h-14 rounded-2xl flex items-center justify-center mb-4 overflow-hidden transition-transform duration-300 hover:rotate-[-3deg]"
        style={{
          background: trendGradient,
          boxShadow: `0 0 24px ${color}40`,
        }}
      >
        <div className="absolute inset-0 backdrop-blur-[20px] bg-white/10" aria-hidden />
        <IconComponent className="relative w-7 h-7 text-app-text" aria-hidden />
      </div>

      {/* Main metric - gradient text */}
      <p
        className="text-app-text font-extrabold tracking-tight leading-tight mt-1"
        style={{
          fontSize: 'clamp(2.25rem, 5vw, 3rem)',
          letterSpacing: '-0.02em',
          background: 'linear-gradient(135deg, #fff 0%, #a0aec0 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
        }}
      >
        {format(animatedValue)}
      </p>

      {/* Label */}
      <p className="mt-2 text-lg font-medium text-app-text/90">{name}</p>

      {/* Comparison */}
      {comparisonValue != null && comparisonPeriod && (
        <p className="mt-1 text-[13px] text-app-text/50">
          {comparisonPeriod}: {format(comparisonValue)}
        </p>
      )}

      {/* Progress ring (when target exists) */}
      {target != null && (
        <div
          className="absolute bottom-5 left-5 w-10 h-10 rounded-full flex items-center justify-center text-[10px] font-bold text-app-text/80"
          aria-label={`${Math.round(progressToTarget ?? 0)}% to target`}
        >
          <svg className="absolute inset-0 w-10 h-10 -rotate-90" viewBox="0 0 40 40">
            <circle
              cx="20"
              cy="20"
              r="16"
              fill="none"
              stroke="rgba(255,255,255,0.1)"
              strokeWidth="3"
            />
            <circle
              cx="20"
              cy="20"
              r="16"
              fill="none"
              stroke={color}
              strokeWidth="3"
              strokeDasharray={`${((progressToTarget ?? 0) / 100) * 100.53} 100.53`}
              strokeLinecap="round"
              className="transition-all duration-1000 ease-out"
            />
          </svg>
          <span className="relative">{Math.round(progressToTarget ?? 0)}%</span>
        </div>
      )}
    </article>
  );
}
