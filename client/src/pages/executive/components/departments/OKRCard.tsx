import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { Target } from 'lucide-react';
import type { ExecutiveDashboard } from '@/lib/executiveApi';
import { DepartmentCard } from '../DepartmentCard';

interface OKRCardProps {
  data: ExecutiveDashboard['okrs'];
  onAction: () => void;
}

const COLORS = ['#10b981', '#f59e0b', '#ef4444'];

export function OKRCard({ data, onAction }: OKRCardProps): JSX.Element {
  const pieData = [
    { name: 'On Track', value: data.onTrack || 0 },
    { name: 'At Risk', value: data.atRisk || 0 },
    { name: 'Behind', value: data.behind || 0 },
  ].filter((d) => d.value > 0);

  return (
    <DepartmentCard
      id="okr"
      title="OKRs"
      icon={<Target className="w-4 h-4" />}
      iconColor="#8b5cf6"
      metrics={[
        { label: 'Progress', value: `${data.overallProgress.toFixed(0)}%` },
        { label: 'On Track', value: data.onTrack },
        { label: 'At Risk', value: data.atRisk },
        { label: 'Behind', value: data.behind },
      ]}
      chart={
        pieData.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Tooltip
                contentStyle={{ background: '#1e293b', border: 'none', borderRadius: 8, fontSize: 12 }}
              />
              <Pie data={pieData} cx="50%" cy="50%" innerRadius={25} outerRadius={45} paddingAngle={3} dataKey="value">
                {pieData.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        ) : undefined
      }
      actionLabel="OKR Check-in"
      onAction={onAction}
    />
  );
}
