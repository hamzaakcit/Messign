import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import type { AIChartPayload } from '@/types/knowledge-hub/ai';

const DEFAULT_COLORS = [
  '#3b82f6', // primary-500
  '#8b5cf6', // accent-500
  '#10b981', // success-500
  '#ef4444', // danger-500
  '#f59e0b', // warning-500
  '#06b6d4', // cyan
  '#ec4899', // pink
  '#6366f1', // indigo
];

interface AIChartRendererProps {
  chart: AIChartPayload;
}

export function AIChartRenderer({ chart }: AIChartRendererProps) {
  const { chartType, title, data, xKey, dataKeys, colors } = chart;
  const palette = colors ?? DEFAULT_COLORS;

  if (!data || data.length === 0) return null;

  const tooltipStyle = {
    backgroundColor: '#1a1a1a',
    border: '1px solid #242424',
    borderRadius: '8px',
    color: '#f1f5f9',
    fontSize: '12px',
  };

  const strokeColor = '#3f3f3f';

  return (
    <div className="my-4 p-4 bg-app-sidebar rounded-xl border border-app-border">
      {title && (
        <h4 className="text-sm font-semibold text-app-muted mb-3">{title}</h4>
      )}

      <div className="w-full" style={{ height: chartType === 'pie' ? 300 : 280 }}>
        <ResponsiveContainer width="100%" height="100%">
          {chartType === 'bar' ? (
            <BarChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={strokeColor} />
              <XAxis dataKey={xKey} tick={{ fontSize: 12, fill: '#9ca3af' }} stroke={strokeColor} />
              <YAxis tick={{ fontSize: 12, fill: '#9ca3af' }} stroke={strokeColor} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: '12px' }} />
              {dataKeys.map((key, i) => (
                <Bar
                  key={key}
                  dataKey={key}
                  fill={palette[i % palette.length]}
                  radius={[4, 4, 0, 0]}
                />
              ))}
            </BarChart>
          ) : chartType === 'line' ? (
            <LineChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={strokeColor} />
              <XAxis dataKey={xKey} tick={{ fontSize: 12, fill: '#9ca3af' }} stroke={strokeColor} />
              <YAxis tick={{ fontSize: 12, fill: '#9ca3af' }} stroke={strokeColor} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: '12px' }} />
              {dataKeys.map((key, i) => (
                <Line
                  key={key}
                  type="monotone"
                  dataKey={key}
                  stroke={palette[i % palette.length]}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                />
              ))}
            </LineChart>
          ) : chartType === 'pie' ? (
            <PieChart>
              <Pie
                data={data}
                dataKey={dataKeys[0]}
                nameKey={xKey}
                cx="50%"
                cy="50%"
                outerRadius={100}
                label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                labelLine={{ stroke: '#6b7280' }}
              >
                {data.map((_, i) => (
                  <Cell key={i} fill={palette[i % palette.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: '12px' }} />
            </PieChart>
          ) : chartType === 'radar' ? (
            <RadarChart data={data} cx="50%" cy="50%" outerRadius="80%">
              <PolarGrid stroke={strokeColor} />
              <PolarAngleAxis dataKey={xKey} tick={{ fontSize: 11, fill: '#9ca3af' }} />
              <PolarRadiusAxis tick={{ fontSize: 10, fill: '#9ca3af' }} />
              {dataKeys.map((key, i) => (
                <Radar
                  key={key}
                  name={key}
                  dataKey={key}
                  stroke={palette[i % palette.length]}
                  fill={palette[i % palette.length]}
                  fillOpacity={0.15}
                />
              ))}
              <Legend wrapperStyle={{ fontSize: '12px' }} />
              <Tooltip contentStyle={tooltipStyle} />
            </RadarChart>
          ) : (
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke={strokeColor} />
              <XAxis dataKey={xKey} tick={{ fill: '#9ca3af' }} />
              <YAxis tick={{ fill: '#9ca3af' }} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey={dataKeys[0]} fill={palette[0]} />
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}
