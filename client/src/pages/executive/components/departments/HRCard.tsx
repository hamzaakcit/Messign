import { Users } from 'lucide-react';
import type { ExecutiveDashboard } from '@/lib/executiveApi';
import { DepartmentCard } from '../DepartmentCard';

interface HRCardProps {
  data: ExecutiveDashboard['people'];
  onAction: () => void;
}

export function HRCard({ data, onAction }: HRCardProps): JSX.Element {
  return (
    <DepartmentCard
      id="hr"
      title="HR / Recruitment"
      icon={<Users className="w-4 h-4" />}
      iconColor="#ec4899"
      metrics={[
        { label: 'Employees', value: data.totalEmployees },
        { label: 'Open Positions', value: data.openPositions },
        { label: 'New Hires', value: data.newHiresThisMonth },
        { label: 'Utilization', value: `${data.avgUtilization.toFixed(0)}%` },
      ]}
      actionLabel="Review Applications"
      onAction={onAction}
    />
  );
}
