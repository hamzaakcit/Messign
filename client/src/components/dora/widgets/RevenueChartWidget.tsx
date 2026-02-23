import React from 'react';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Download } from 'lucide-react';

interface RevenueChartWidgetProps {
  data: Array<{ month: string; revenue: number }>;
  title?: string;
  subtitle?: string;
  accent?: string;
  onExport?: () => void;
  delay?: number;
}

const accentGradients: Record<string, [string, string]> = {
  'green-cyan': ['#22c55e', '#38bdf8'],
  'cyan-violet': ['#38bdf8', '#8b5cf6'],
  'amber-orange': ['#f59e0b', '#f97316'],
};

const RevenueChartWidget: React.FC<RevenueChartWidgetProps> = ({
  data,
  title = 'Revenue Trend',
  subtitle = 'Last 6 months',
  accent = 'green-cyan',
  onExport,
  delay = 0,
}) => {
  const [color1, color2] = accentGradients[accent] || accentGradients['green-cyan'];

  return (
    <div
      className="dora-fade-up dora-glass dora-glow-border"
      style={{
        borderRadius: 'var(--dora-r-widget, 16px)',
        overflow: 'hidden',
        animationDelay: `${delay}s`,
        opacity: delay > 0 ? 0 : undefined,
        marginTop: 12,
      }}
    >
      <div style={{ height: 3, background: `linear-gradient(90deg, ${color1}, ${color2})`, opacity: 0.6 }} />

      <div style={{ padding: '16px 18px 8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div>
            <h3 className="dora-font" style={{ fontSize: 13, fontWeight: 600, color: '#f1f5f9', margin: 0 }}>
              {title}
            </h3>
            <p style={{ fontSize: 10.5, color: '#64748b', margin: '2px 0 0' }}>{subtitle}</p>
          </div>
          {onExport && (
            <button
              onClick={onExport}
              style={{
                fontSize: 10,
                padding: '4px 10px',
                borderRadius: 6,
                background: `${color1}12`,
                color: color1,
                border: `1px solid ${color1}25`,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                fontFamily: 'inherit',
                transition: 'all 0.15s',
              }}
            >
              <Download size={10} /> Export
            </button>
          )}
        </div>

        <ResponsiveContainer width="100%" height={130}>
          <AreaChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id={`revGrad-${accent}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color1} stopOpacity={0.25} />
                <stop offset="100%" stopColor={color1} stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="month"
              tick={{ fontSize: 9, fill: '#475569' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 9, fill: '#475569' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: number) => `$${v / 1000}k`}
            />
            <Tooltip
              contentStyle={{
                background: 'rgba(15,23,42,0.9)',
                border: '1px solid rgba(148,163,184,0.1)',
                borderRadius: 8,
                fontSize: 11,
                color: '#e2e8f0',
                padding: '6px 10px',
                backdropFilter: 'blur(12px)',
              }}
              formatter={(v: number) => [`$${(v / 1000).toFixed(1)}k`, 'Revenue']}
            />
            <Area
              type="monotone"
              dataKey="revenue"
              stroke={color1}
              strokeWidth={2}
              fill={`url(#revGrad-${accent})`}
              dot={false}
              animationDuration={1200}
              animationEasing="ease-out"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default RevenueChartWidget;
