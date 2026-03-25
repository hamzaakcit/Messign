import { memo } from 'react';
import { Area, AreaChart, ResponsiveContainer } from 'recharts';

interface MiniSparklineProps {
  data: number[];
  color?: string;
}

export const MiniSparkline = memo(function MiniSparkline({
  data,
  color = '#6366f1',
}: MiniSparklineProps): JSX.Element {
  const pts = data.map((v, i) => ({ i, v }));
  if (pts.length === 0) {
    return <div className="h-full w-full rounded bg-white/[0.03]" />;
  }
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={pts} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="ccSpark" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.35} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area type="monotone" dataKey="v" stroke={color} fill="url(#ccSpark)" strokeWidth={1.5} isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
});
