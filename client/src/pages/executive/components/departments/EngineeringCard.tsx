import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Code2 } from 'lucide-react';
import type { ExecutiveDashboard } from '@/lib/executiveApi';
import { DepartmentCard } from '../DepartmentCard';

interface EngineeringCardProps {
  data: ExecutiveDashboard['projects'];
  onAction: () => void;
}

interface BarDatum {
  name: string;
  value: number;
  color: string;
}

interface EngineeringTooltipProps {
  active?: boolean;
  payload?: ReadonlyArray<{ payload: BarDatum }>;
}

function EngineeringTooltip({ active, payload }: EngineeringTooltipProps): JSX.Element | null {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="rounded-md px-2.5 py-1.5 text-xs shadow-md" style={{ background: '#1e293b', border: 'none' }}>
      <div className="font-medium text-slate-100">{row.name}</div>
      <div className="tabular-nums text-slate-300">{row.value}</div>
    </div>
  );
}

export function EngineeringCard({ data, onAction }: EngineeringCardProps): JSX.Element {
  const barData: BarDatum[] = [
    { name: 'Completed', value: data.tasksCompletedThisWeek, color: '#10b981' },
    { name: 'Blocked', value: data.blockedTasks, color: '#ef4444' },
    { name: 'Active', value: data.activeProjects, color: '#3b82f6' },
  ];

  return (
    <DepartmentCard
      id="engineering"
      title="Engineering"
      icon={<Code2 className="w-4 h-4" />}
      iconColor="#06b6d4"
      metrics={[
        { label: 'Active Projects', value: data.activeProjects },
        { label: 'Velocity', value: `${data.avgSprintVelocity.toFixed(0)}%` },
        { label: 'Completed/wk', value: data.tasksCompletedThisWeek },
        { label: 'Blocked', value: data.blockedTasks },
      ]}
      chart={
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={barData} layout="vertical" margin={{ top: 2, right: 4, left: 2, bottom: 2 }}>
            <XAxis type="number" domain={[0, 'dataMax']} hide />
            <YAxis
              type="category"
              dataKey="name"
              width={68}
              tick={{ fill: '#94a3b8', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip content={<EngineeringTooltip />} cursor={{ fill: 'rgba(148, 163, 184, 0.06)' }} />
            <Bar dataKey="value" radius={[0, 4, 4, 0]}>
              {barData.map((entry) => (
                <Cell key={entry.name} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      }
      actionLabel="View Tasks"
      onAction={onAction}
    />
  );
}
