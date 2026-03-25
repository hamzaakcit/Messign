import { memo } from 'react';
import { Area, AreaChart, ResponsiveContainer, XAxis } from 'recharts';

interface TrendAreaProps {
  points: { date: string; count: number }[];
}

export const TrendArea = memo(function TrendArea({ points }: TrendAreaProps): JSX.Element {
  const data = points.map((p) => ({
    ...p,
    label: p.date.slice(5),
  }));
  if (data.length === 0) {
    return <div className="h-full w-full rounded bg-white/[0.03] flex items-center justify-center text-[10px] text-app-muted">No trend</div>;
  }
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="ccTrend" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.3} />
            <stop offset="100%" stopColor="#22d3ee" stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis dataKey="label" tick={{ fontSize: 9, fill: '#64748b' }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
        <Area type="monotone" dataKey="count" stroke="#22d3ee" fill="url(#ccTrend)" strokeWidth={1.5} isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
});
