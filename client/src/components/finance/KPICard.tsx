import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

interface KPICardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  trend?: { value: number; label: string };
  className?: string;
}

export function KPICard({ title, value, subtitle, icon: Icon, trend, className }: KPICardProps) {
  return (
    <div
      className={cn(
        'rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm p-5 transition-all hover:bg-white/[0.07]',
        className,
      )}
    >
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-xs font-medium text-app-muted uppercase tracking-wide">{title}</p>
          <p className="text-2xl font-bold text-app-text">{value}</p>
        </div>
        <div className="rounded-lg bg-primary-500/10 p-2.5">
          <Icon className="h-5 w-5 text-primary-500" />
        </div>
      </div>
      {(subtitle || trend) && (
        <div className="mt-3 flex items-center gap-2 text-xs">
          {trend && (
            <span
              className={cn(
                'font-medium',
                trend.value >= 0 ? 'text-emerald-400' : 'text-red-400',
              )}
            >
              {trend.value >= 0 ? '+' : ''}{trend.value}% {trend.label}
            </span>
          )}
          {subtitle && <span className="text-app-muted">{subtitle}</span>}
        </div>
      )}
    </div>
  );
}
