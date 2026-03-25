import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Code2 } from 'lucide-react';
import type { ExecutiveDashboard } from '@/lib/executiveApi';
import { DepartmentCard } from '../DepartmentCard';

interface EngineeringCardProps {
  data: ExecutiveDashboard['projects'];
  onAction: () => void;
}

export function EngineeringCard({ data, onAction }: EngineeringCardProps): JSX.Element {
  const barData = [
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
          <BarChart data={barData} layout="vertical">
            <XAxis type="number" hide />
            <Tooltip
              contentStyle={{ background: '#1e293b', border: 'none', borderRadius: 8, fontSize: 12 }}
              cursor={false}
            />
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
