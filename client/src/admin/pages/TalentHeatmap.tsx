import { useQuery } from '@/admin/hooks/useAdminQuery';
import { useAuthStore } from '@/stores/authStore';
import { adminAPI } from '@/lib/api';
import {
  AlertTriangle,
  CheckCircle,
  Coffee,
  Flame,
  Minus,
  BarChart3,
} from 'lucide-react';

interface DepartmentHeatmap {
  department: { id: string; name: string; color?: string };
  metrics: {
    totalEmployees: number;
    totalCapacity: number;
    usedCapacity: number;
    utilizationRate: number;
    overloaded: number;
    available: number;
    bench: number;
    marketplaceActive: number;
    activeProjects: number;
    pendingApplications: number;
  };
  users: {
    id: string;
    name: string;
    avatar?: string;
    currentProjects: number;
    maxProjects: number;
    benchStatus: string;
    activeBounties: number;
    activeSprints: number;
  }[];
  health: 'UNDERUTILIZED' | 'HEALTHY' | 'OVERLOADED';
}

interface Summary {
  totalEmployees: number;
  totalCapacity: number;
  totalUsed: number;
  overloadedCount: number;
  benchCount: number;
  avgUtilization: number;
}

export function TalentHeatmap() {
  const { user } = useAuthStore();
  const userId = user?.id ?? '';

  const { data, isLoading } = useQuery(
    ['talent-heatmap'],
    () => adminAPI.analytics.getTalentHeatmap(userId),
    { enabled: !!userId }
  );

  const departments: DepartmentHeatmap[] = Array.isArray((data as { departments?: DepartmentHeatmap[] })?.departments)
    ? (data as { departments: DepartmentHeatmap[] }).departments
    : [];
  const summary: Summary = (data as { summary?: Summary })?.summary ?? {
    totalEmployees: 0,
    totalCapacity: 0,
    totalUsed: 0,
    overloadedCount: 0,
    benchCount: 0,
    avgUtilization: 0,
  };

  const getHealthColor = (health: string) => {
    switch (health) {
      case 'OVERLOADED':
        return 'text-red-400 bg-red-500/20';
      case 'HEALTHY':
        return 'text-green-400 bg-green-500/20';
      case 'UNDERUTILIZED':
        return 'text-yellow-400 bg-yellow-500/20';
      default:
        return 'text-app-muted bg-app-surface-tertiary';
    }
  };

  const getHealthIcon = (health: string) => {
    switch (health) {
      case 'OVERLOADED':
        return <Flame className="w-4 h-4" />;
      case 'HEALTHY':
        return <CheckCircle className="w-4 h-4" />;
      case 'UNDERUTILIZED':
        return <Coffee className="w-4 h-4" />;
      default:
        return <Minus className="w-4 h-4" />;
    }
  };

  const getUtilizationColor = (rate: number) => {
    if (rate >= 85) return '#ef4444';
    if (rate >= 60) return '#22c55e';
    return '#f59e0b';
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-app flex items-center gap-2">
          <BarChart3 className="w-6 h-6 text-primary-400" />
          Talent Density Heatmap
        </h1>
        <p className="text-app-muted text-sm mt-1">
          Real-time view of team capacity and marketplace participation
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <div className="bg-app-card border border-app-border rounded-xl p-4">
          <p className="text-app-muted text-xs mb-1">Total Employees</p>
          <p className="text-2xl font-semibold text-app">{summary.totalEmployees}</p>
        </div>
        <div className="bg-app-card border border-app-border rounded-xl p-4">
          <p className="text-app-muted text-xs mb-1">Avg Utilization</p>
          <p className="text-2xl font-semibold text-app">{summary.avgUtilization}%</p>
        </div>
        <div className="bg-app-card border border-app-border rounded-xl p-4">
          <p className="text-app-muted text-xs mb-1">Overloaded</p>
          <p className="text-2xl font-semibold text-red-400">{summary.overloadedCount}</p>
        </div>
        <div className="bg-app-card border border-app-border rounded-xl p-4">
          <p className="text-app-muted text-xs mb-1">On Bench</p>
          <p className="text-2xl font-semibold text-yellow-400">{summary.benchCount}</p>
        </div>
        <div className="bg-app-card border border-app-border rounded-xl p-4">
          <p className="text-app-muted text-xs mb-1">Capacity Used</p>
          <p className="text-2xl font-semibold text-app">
            {summary.totalUsed}/{summary.totalCapacity}
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-app-card border border-app-border rounded-xl h-64 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {departments.map((dept) => (
            <div
              key={dept.department.id}
              className="bg-app-card border border-app-border rounded-xl p-5"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center text-lg font-bold"
                    style={{
                      backgroundColor: dept.department.color ? `${dept.department.color}20` : 'var(--app-surface-tertiary)',
                      color: dept.department.color ?? 'var(--app-muted)',
                    }}
                  >
                    {dept.department.name[0]}
                  </div>
                  <div>
                    <h3 className="text-app font-medium">{dept.department.name}</h3>
                    <p className="text-app-muted text-sm">{dept.metrics.totalEmployees} employees</p>
                  </div>
                </div>
                <span
                  className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${getHealthColor(dept.health)}`}
                >
                  {getHealthIcon(dept.health)}
                  {dept.health}
                </span>
              </div>

              <div className="mb-4">
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="text-app-muted">Capacity Utilization</span>
                  <span className="text-app font-medium">{dept.metrics.utilizationRate}%</span>
                </div>
                <div className="h-3 bg-app-surface-tertiary rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${Math.min(100, dept.metrics.utilizationRate)}%`,
                      backgroundColor: getUtilizationColor(dept.metrics.utilizationRate),
                    }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-4 gap-2 mb-4">
                <div className="bg-app-surface rounded-lg p-2 text-center">
                  <p className="text-green-400 font-semibold">{dept.metrics.available}</p>
                  <p className="text-app-muted text-xs">Available</p>
                </div>
                <div className="bg-app-surface rounded-lg p-2 text-center">
                  <p className="text-red-400 font-semibold">{dept.metrics.overloaded}</p>
                  <p className="text-app-muted text-xs">Overloaded</p>
                </div>
                <div className="bg-app-surface rounded-lg p-2 text-center">
                  <p className="text-yellow-400 font-semibold">{dept.metrics.bench}</p>
                  <p className="text-app-muted text-xs">Bench</p>
                </div>
                <div className="bg-app-surface rounded-lg p-2 text-center">
                  <p className="text-primary-400 font-semibold">{dept.metrics.marketplaceActive}</p>
                  <p className="text-app-muted text-xs">Active</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-1">
                {dept.users.slice(0, 12).map((u) => {
                  const utilization = (u.currentProjects / u.maxProjects) * 100;
                  const bubbleColor =
                    utilization >= 100 ? '#ef4444' : utilization >= 66 ? '#f59e0b' : utilization > 0 ? '#22c55e' : '#6b7280';
                  return (
                    <div
                      key={u.id}
                      className="w-8 h-8 rounded-full border-2 flex items-center justify-center overflow-hidden"
                      style={{ borderColor: bubbleColor }}
                      title={`${u.name}: ${u.currentProjects}/${u.maxProjects} projects`}
                    >
                      {u.avatar ? (
                        <img src={u.avatar} alt={u.name} className="w-full h-full object-cover" loading="lazy" width={32} height={32} />
                      ) : (
                        <span className="text-xs text-app-muted">{u.name[0]}</span>
                      )}
                    </div>
                  );
                })}
                {dept.users.length > 12 && (
                  <div className="w-8 h-8 rounded-full bg-app-surface-tertiary flex items-center justify-center">
                    <span className="text-xs text-app-muted">+{dept.users.length - 12}</span>
                  </div>
                )}
              </div>

              {dept.health === 'OVERLOADED' && (
                <div className="mt-3 flex items-center gap-2 text-red-400 text-sm">
                  <AlertTriangle className="w-4 h-4" />
                  <span>{dept.metrics.overloaded} team members at capacity</span>
                </div>
              )}
              {dept.health === 'UNDERUTILIZED' && dept.metrics.bench > 0 && (
                <div className="mt-3 flex items-center gap-2 text-yellow-400 text-sm">
                  <Coffee className="w-4 h-4" />
                  <span>{dept.metrics.bench} team members on bench</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
