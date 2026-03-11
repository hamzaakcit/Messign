import React, { useState, useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import type { PerformanceChartDataPoint } from '@/types/dashboard';

type ChartTimeRange = 'monthly' | 'yearly';
import { cn } from '@/lib/utils';

interface PerformanceChartProps {
  monthlyData: PerformanceChartDataPoint[];
  yearlyData: PerformanceChartDataPoint[];
}

export const PerformanceChart = React.memo(function PerformanceChart({ monthlyData, yearlyData }: PerformanceChartProps) {
  const [range, setRange] = useState<ChartTimeRange>('monthly');
  const data = useMemo(
    () => (range === 'monthly' ? monthlyData : yearlyData),
    [range, monthlyData, yearlyData],
  );

  const formatTooltipValue = (value: number, name: string) => {
    if (name === 'revenue') return [`$${value}M`, 'Revenue'];
    if (name === 'smsAttempts') return [`${value}M`, 'SMS'];
    if (name === 'mailAttempts') return [`${value}M`, 'Mail'];
    return [value, name];
  };

  return (
    <div className="glass-card p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white">Performance trend</h3>
        <div className="flex rounded-lg bg-dark-700 p-0.5">
          <button
            onClick={() => setRange('monthly')}
            className={cn(
              'px-3 py-1.5 text-sm font-medium rounded-md transition-colors',
              range === 'monthly'
                ? 'bg-white/10 text-white'
                : 'text-gray-400 hover:text-white'
            )}
          >
            Monthly
          </button>
          <button
            onClick={() => setRange('yearly')}
            className={cn(
              'px-3 py-1.5 text-sm font-medium rounded-md transition-colors',
              range === 'yearly'
                ? 'bg-white/10 text-white'
                : 'text-gray-400 hover:text-white'
            )}
          >
            Yearly
          </button>
        </div>
      </div>

      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data}
            margin={{ top: 5, right: 10, left: 0, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis
              dataKey="period"
              stroke="#6b7280"
              tick={{ fill: '#9ca3af', fontSize: 12 }}
              axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
            />
            <YAxis
              stroke="#6b7280"
              tick={{ fill: '#9ca3af', fontSize: 12 }}
              axisLine={false}
              tickFormatter={(v) => (v >= 100 ? `${v}M` : `${v}`)}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#1a1a1a',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '8px',
              }}
              labelStyle={{ color: '#d1d5db' }}
              formatter={(value: number, name: string) => formatTooltipValue(value, name)}
            />
            <Legend
              wrapperStyle={{ fontSize: 12 }}
              formatter={(value) => <span className="text-gray-400">{value}</span>}
            />
            <Line
              type="monotone"
              dataKey="revenue"
              stroke="#3b82f6"
              strokeWidth={2}
              dot={{ fill: '#3b82f6', r: 3 }}
              name="Revenue (M)"
            />
            <Line
              type="monotone"
              dataKey="smsAttempts"
              stroke="#8b5cf6"
              strokeWidth={2}
              dot={{ fill: '#8b5cf6', r: 3 }}
              name="SMS (M)"
            />
            <Line
              type="monotone"
              dataKey="mailAttempts"
              stroke="#10b981"
              strokeWidth={2}
              dot={{ fill: '#10b981', r: 3 }}
              name="Mail (M)"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
});
