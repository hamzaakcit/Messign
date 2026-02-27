import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';

interface ForecastDataPoint {
  date: string;
  actual?: number;
  forecast?: number;
  budget?: number;
}

interface BudgetForecastChartProps {
  data: ForecastDataPoint[];
  budgetLimit?: number;
}

export function BudgetForecastChart({ data, budgetLimit }: BudgetForecastChartProps) {
  if (data.length === 0) {
    return <div className="text-app-muted text-sm text-center py-8">No forecast data available</div>;
  }

  return (
    <ResponsiveContainer width="100%" height={250}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
        <XAxis dataKey="date" tick={{ fill: '#9ca3af', fontSize: 12 }} />
        <YAxis tick={{ fill: '#9ca3af', fontSize: 12 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
        <Tooltip
          contentStyle={{ background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#fff' }}
          formatter={(value: number, name: string) => [`$${value.toLocaleString()}`, name]}
        />
        <Line type="monotone" dataKey="actual" stroke="#10b981" strokeWidth={2} dot={false} name="Actual" />
        <Line type="monotone" dataKey="forecast" stroke="#6366f1" strokeWidth={2} strokeDasharray="5 5" dot={false} name="Forecast" />
        {budgetLimit && (
          <ReferenceLine y={budgetLimit} stroke="#ef4444" strokeDasharray="3 3" label={{ value: 'Budget', fill: '#ef4444', fontSize: 11 }} />
        )}
      </LineChart>
    </ResponsiveContainer>
  );
}
