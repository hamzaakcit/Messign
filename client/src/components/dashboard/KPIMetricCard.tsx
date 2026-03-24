import type { LucideIcon } from 'lucide-react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { useCountUp } from '@/hooks/useCountUp';
import { cn } from '@/lib/utils';

export interface KPIMetricCardData {
  id: string;
  icon: LucideIcon;
  value: number; // numeric value for count-up (e.g. 12.45 for revenue in M)
  format: (n: number) => string; // e.g. (n) => `$${n.toFixed(2)}M`
  label: string;
  sublabel: string;
  change: number; // percentage, e.g. 8.2 or -2.1
  iconBg: string; // e.g. 'rgba(59, 130, 246, 0.1)'
  iconColor: string; // e.g. '#3b82f6'
  decimals?: number; // for count-up (default 0; use 2 for revenue)
}

interface KPIMetricCardProps {
  data: KPIMetricCardData;
  index: number; // for stagger delay
  onCardClick?: (id: string) => void;
}

export function KPIMetricCard({ data, index, onCardClick }: KPIMetricCardProps) {
  const {
    id,
    icon: Icon,
    value,
    format,
    label,
    sublabel,
    change,
    iconBg,
    iconColor,
    decimals = 0,
  } = data;

  const animatedValue = useCountUp(value, 1500, true, decimals);

  const isPositive = change >= 0;
  const delayMs = index * 100;

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
      aria-label={`${label}: ${format(animatedValue)}. ${isPositive ? 'Up' : 'Down'} ${Math.abs(change)}% vs last quarter`}
      className={cn(
        'relative rounded-[24px] p-6 md:p-8 overflow-hidden',
        'bg-gradient-to-b from-[#1a1a1a] to-[#0f0f0f]',
        'border border-white/[0.05]',
        'backdrop-blur-[10px]',
        'shadow-[0_4px_24px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.05)]',
        'transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]',
        'hover:scale-[1.02] hover:border-app-border',
        'focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 focus:ring-offset-dark-900',
        'cursor-pointer',
        'animate-kpi-enter',
        `kpi-card-${id}`
      )}
      style={{
        animationDelay: `${delayMs}ms`,
      }}
    >
      {/* Icon */}
      <div
        className="w-14 h-14 rounded-xl flex items-center justify-center mb-4"
        style={{ backgroundColor: iconBg }}
      >
        <Icon className="w-7 h-7" style={{ color: iconColor }} aria-hidden />
      </div>

      {/* Performance indicator (top right) */}
      <div
        className={cn(
          'absolute top-6 right-6 flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-bold',
          isPositive ? 'text-emerald-500' : 'text-red-500',
          isPositive ? 'bg-emerald-500/10' : 'bg-red-500/10'
        )}
      >
        {isPositive ? (
          <TrendingUp className="w-4 h-4" aria-hidden />
        ) : (
          <TrendingDown className="w-4 h-4" aria-hidden />
        )}
        <span>
          {isPositive ? '+' : ''}{change}%
        </span>
      </div>

      {/* Main metric (count-up) */}
      <p
        className="text-app-text font-bold tracking-tight leading-tight mt-2"
        style={{
          fontSize: 'clamp(1.75rem, 2.8vw, 2.45rem)',
          letterSpacing: '-0.02em',
        }}
      >
        {format(animatedValue)}
      </p>

      {/* Labels */}
      <p className="mt-2 text-base font-medium text-app-text/70">{label}</p>
      <p className="mt-1 text-[13px] font-normal text-app-text/40">{sublabel}</p>
    </article>
  );
}
