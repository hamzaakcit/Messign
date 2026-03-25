import { Shield, AlertTriangle } from 'lucide-react';
import type { ExecutiveDashboard } from '@/lib/executiveApi';
import { DepartmentCard } from '../DepartmentCard';

interface OperationsCardProps {
  data: ExecutiveDashboard['operations'];
  onAction: () => void;
}

export function OperationsCard({ data, onAction }: OperationsCardProps): JSX.Element {
  const totalAlerts = data.contractsExpiringThisMonth + data.licensesExpiringThisMonth + data.assetsUnassigned;

  return (
    <DepartmentCard
      id="operations"
      title="Operations"
      icon={<Shield className="w-4 h-4" />}
      iconColor="#f59e0b"
      pendingCount={totalAlerts > 0 ? totalAlerts : undefined}
      metrics={[
        { label: 'Contracts Expiring', value: data.contractsExpiringThisMonth },
        { label: 'Licenses Expiring', value: data.licensesExpiringThisMonth },
        { label: 'Unassigned Assets', value: data.assetsUnassigned },
      ]}
      chart={
        totalAlerts > 0 ? (
          <div className="flex items-center gap-2 p-3 rounded-md bg-amber-500/10 border border-amber-500/20">
            <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
            <span className="text-xs text-amber-300">
              {totalAlerts} item{totalAlerts > 1 ? 's' : ''} need attention this month
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2 p-3 rounded-md bg-emerald-500/10 border border-emerald-500/20">
            <Shield className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <span className="text-xs text-emerald-300">All operations healthy</span>
          </div>
        )
      }
      actionLabel="View Details"
      onAction={onAction}
    />
  );
}
