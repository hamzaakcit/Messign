import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui';
import { LEVEL_THRESHOLDS } from '@/types';

const MAX_LEVELS = 30;
const chartData = LEVEL_THRESHOLDS.slice(0, MAX_LEVELS).map((xp, i) => ({
  level: i + 1,
  xp,
  name: `L${i + 1}`,
}));

export function LevelProgressionCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Level thresholds and progression</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis
                dataKey="name"
                stroke="#6b7280"
                tick={{ fill: '#9ca3af', fontSize: 10 }}
                axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
              />
              <YAxis
                stroke="#6b7280"
                tick={{ fill: '#9ca3af', fontSize: 10 }}
                axisLine={false}
                tickFormatter={(v) => (v >= 1000 ? `${v / 1000}k` : String(v))}
              />
              <Tooltip
                contentStyle={{ backgroundColor: '#1f2937', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }}
                labelStyle={{ color: '#9ca3af' }}
                formatter={(value: number) => [`${value.toLocaleString()} MP`, 'MP required']}
                labelFormatter={(_, payload) => (payload[0] ? `Level ${(payload[0].payload as { level: number }).level}` : '')}
              />
              <Bar dataKey="xp" fill="rgba(99, 102, 241, 0.6)" radius={[4, 4, 0, 0]} name="MP required" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-app-border text-left text-app-muted">
                <th className="py-2 px-3">Level</th>
                <th className="py-2 px-3">MP required</th>
              </tr>
            </thead>
            <tbody>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20, 25, 30].map((level) => {
                const xp = level <= LEVEL_THRESHOLDS.length ? LEVEL_THRESHOLDS[level - 1] : undefined;
                return (
                  <tr key={level} className="border-b border-app-border">
                    <td className="py-2 px-3 text-app-text">{level}</td>
                    <td className="py-2 px-3 text-app-muted">{xp !== undefined ? xp.toLocaleString() : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-app-muted">Read-only. Edit thresholds and templates can be wired when backend supports it.</p>
      </CardContent>
    </Card>
  );
}
