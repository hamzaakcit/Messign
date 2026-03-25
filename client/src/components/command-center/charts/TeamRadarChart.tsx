import { memo } from 'react';
import { PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer } from 'recharts';

interface TeamRadarChartProps {
  data: { label: string; value: number }[];
}

export const TeamRadarChart = memo(function TeamRadarChart({ data }: TeamRadarChartProps): JSX.Element {
  if (data.length === 0) {
    return <div className="h-full w-full rounded bg-white/[0.03]" />;
  }
  return (
    <ResponsiveContainer width="100%" height="100%">
      <RadarChart cx="50%" cy="50%" outerRadius="70%" data={data}>
        <PolarGrid stroke="#334155" />
        <PolarAngleAxis dataKey="label" tick={{ fontSize: 9, fill: '#94a3b8' }} />
        <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
        <Radar name="XP" dataKey="value" stroke="#a78bfa" fill="#a78bfa" fillOpacity={0.35} isAnimationActive={false} />
      </RadarChart>
    </ResponsiveContainer>
  );
});
