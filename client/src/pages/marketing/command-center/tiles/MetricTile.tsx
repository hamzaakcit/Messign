import { useId } from 'react';
import { Area, AreaChart, ResponsiveContainer } from 'recharts';
import { cn } from '@/lib/utils';
import type { CommandCenterDailyPoint } from '@/lib/marketingApi';

export interface MetricTileProps {
  label: string;
  value: string | number;
  series7d: CommandCenterDailyPoint[];
  color?: string;
  /** When true, pulse border (metric drop / warning) */
  alert?: boolean;
  /** Live indicator */
  live?: boolean;
  className?: string;
}

/**
 * Compact KPI tile with 7-day area sparkline.
 */
export function MetricTile({
  label,
  value,
  series7d,
  color = '#3b82f6',
  alert = false,
  live = false,
  className,
}: MetricTileProps): JSX.Element {
  const gid = useId().replace(/:/g, '');
  const chartData = series7d.map((p) => ({ v: p.value }));

  return (
    <div
      className={cn(
        'rounded-lg border bg-app-surface-tertiary/80 px-2 py-1.5 min-w-0',
        alert ? 'border-amber-500/50 shadow-[0_0_12px_rgba(245,158,11,0.15)]' : 'border-white/[0.08]',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-1 mb-0.5">
        <span className="text-[9px] uppercase tracking-wide text-app-muted truncate">{label}</span>
        {live && (
          <span className="flex items-center gap-0.5 shrink-0">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
            <span className="text-[8px] text-emerald-400/90">Live</span>
          </span>
        )}
      </div>
      <div className="flex items-end gap-1.5">
        <p className="text-sm font-semibold text-app-text leading-none tabular-nums shrink-0">{value}</p>
        {chartData.length > 1 && (
          <div className="h-7 w-16 shrink-0 min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id={`mt-${gid}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={color} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area
                  type="monotone"
                  dataKey="v"
                  stroke={color}
                  strokeWidth={1.2}
                  fill={`url(#mt-${gid})`}
                  dot={false}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}
