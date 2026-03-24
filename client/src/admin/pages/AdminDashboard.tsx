import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Users,
  UserCheck,
  Trophy,
  Clock,
  Server,
  Database,
  Cpu,
  HardDrive,
  UserPlus,
  Upload,
  FileText,
  Target,
  Award,
  Megaphone,
  AlertCircle,
  Download,
  BookOpen,
  Eye,
  Flag,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent, Button, Avatar } from '@/components/ui';
import { StatCard } from '@/admin/components/StatCard';
import { useAuthStore } from '@/stores/authStore';
import { adminAPI, adminKnowledgeAPI } from '@/lib/api';
import { useQuery } from '@/admin/hooks/useAdminQuery';
import { formatDistanceToNow } from 'date-fns';

// Mock activity entries (in real app from admin audit API)
const mockActivities = [
  { id: '1', adminName: 'Alex Chen', adminAvatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=alex', action: 'employee.updated', target: 'Emily Davis', timestamp: new Date(Date.now() - 3600000).toISOString() },
  { id: '2', adminName: 'Alex Chen', adminAvatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=alex', action: 'xp.adjusted', target: 'David Kim', timestamp: new Date(Date.now() - 7200000).toISOString() },
  { id: '3', adminName: 'Alex Chen', adminAvatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=alex', action: 'department.updated', target: 'Engineering', timestamp: new Date(Date.now() - 86400000).toISOString() },
  { id: '4', adminName: 'Alex Chen', adminAvatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=alex', action: 'settings.updated', target: 'General', timestamp: new Date(Date.now() - 172800000).toISOString() },
];

const actionLabels: Record<string, string> = {
  'employee.updated': 'Updated employee',
  'employee.created': 'Created employee',
  'xp.adjusted': 'Adjusted MP',
  'department.updated': 'Updated department',
  'settings.updated': 'Updated settings',
};

const mockDeptStats = [
  { id: 'dept-eng', name: 'Engineering', icon: 'Code', count: 5, avgXp: 12500, activeProjects: 4, completionRate: 78, topPerformer: 'Alex Chen' },
  { id: 'dept-product', name: 'Product', icon: 'Layers', count: 2, avgXp: 14850, activeProjects: 3, completionRate: 82, topPerformer: 'Sarah Johnson' },
  { id: 'dept-design', name: 'Design', icon: 'Palette', count: 1, avgXp: 10200, activeProjects: 2, completionRate: 65, topPerformer: 'Marcus Williams' },
  { id: 'dept-marketing', name: 'Marketing', icon: 'Megaphone', count: 2, avgXp: 13150, activeProjects: 2, completionRate: 88, topPerformer: 'Jessica Martinez' },
];

interface Employee {
  id: string;
  status?: string;
  xp?: number;
  level?: number;
}

const mockAlerts = [
  { id: '1', type: 'approval', title: 'Pending approvals', message: '3 leave requests awaiting approval', action: 'Review' },
  { id: '2', type: 'xp', title: 'MP requests', message: '2 manual MP adjustments requested', action: 'Review' },
  { id: '3', type: 'capacity', title: 'Capacity alert', message: 'Engineering at 90% capacity', action: 'View' },
  { id: '4', type: 'system', title: 'System update', message: 'New admin features available', action: 'Learn more' },
];

export function AdminDashboard() {
  const { user } = useAuthStore();
  const userId = user?.id ?? '';
  const [activityFilter, setActivityFilter] = useState<string>('all');

  const { data: employees, isLoading: employeesLoading, error: employeesError } = useQuery(
    ['employees', userId],
    () => adminAPI.employees.getAll(userId) as Promise<unknown[]>,
    { enabled: !!userId }
  );

  const employeeList = Array.isArray(employees) ? employees : [];
  const totalEmployees = employeeList.length;
  const activeToday = (employeeList as Employee[]).filter((e) => e.status !== 'offline').length;
  const avgXp = totalEmployees > 0
    ? Math.round((employeeList as Employee[]).reduce((sum, e) => sum + (e.xp ?? 0), 0) / totalEmployees)
    : 0;

  const filteredActivities = activityFilter === 'all'
    ? mockActivities
    : mockActivities.filter((a) => a.action === activityFilter);
  const actionTypes = ['all', ...Array.from(new Set(mockActivities.map((a) => a.action)))];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-app">Admin Dashboard</h1>
      </div>

      {employeesError && (
        <div className="mb-4 p-4 rounded-lg bg-danger-500/10 border border-danger-500/30 text-danger-400 text-sm" role="alert">
          Failed to load employees: {employeesError.message}
        </div>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Employees"
          value={employeesLoading ? '—' : totalEmployees}
          icon={Users}
          trend={employeesLoading ? undefined : { value: 0, label: 'vs last month' }}
        />
        <StatCard
          title="Active Today"
          value={employeesLoading ? '—' : activeToday}
          icon={UserCheck}
        />
        <StatCard
          title="Avg MP / Employee"
          value={employeesLoading ? '—' : avgXp.toLocaleString()}
          icon={Trophy}
        />
        <StatCard
          title="Pending Actions"
          value="3"
          icon={Clock}
        />
      </div>

      {/* Knowledge Hub Overview */}
      <KnowledgeHubWidget userId={userId} />

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Activity timeline ~60% */}
        <div className="lg:col-span-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Activity Overview</CardTitle>
              <div className="flex items-center gap-2">
                <select
                  value={activityFilter}
                  onChange={(e) => setActivityFilter(e.target.value)}
                  className="select-theme text-sm py-1.5 px-2 w-auto"
                  aria-label="Filter by action type"
                >
                  {actionTypes.map((type) => (
                    <option key={type} value={type}>
                      {type === 'all' ? 'All' : actionLabels[type] ?? type}
                    </option>
                  ))}
                </select>
                <Button variant="secondary" size="sm" className="gap-1">
                  <Download className="w-4 h-4" />
                  Export CSV
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3" role="list">
                {filteredActivities.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center gap-3 py-2 border-b border-app-border last:border-0 hover:bg-app-surface-tertiary rounded-lg px-2 -mx-2"
                  >
                    <Avatar src={item.adminAvatar} name={item.adminName} size="sm" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-app">
                        <span className="font-medium">{item.adminName}</span>
                        {' '}
                        {actionLabels[item.action] ?? item.action}
                        {' — '}
                        <span className="text-app-muted">{item.target}</span>
                      </p>
                      <p className="text-xs text-app-muted mt-0.5">
                        {formatDistanceToNow(new Date(item.timestamp), { addSuffix: true })}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>

        {/* System health ~40% */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>System Health</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-app-muted">
                  <Server className="w-4 h-4" />
                  API response time
                </span>
                <span className="text-green-600 dark:text-green-400">42 ms</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-app-muted">
                  <Database className="w-4 h-4" />
                  DB connections
                </span>
                <span className="text-app">8 / 20</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-app-muted">
                  <UserCheck className="w-4 h-4" />
                  Active sessions
                </span>
                <span className="text-app">12</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-app-muted">
                  <Cpu className="w-4 h-4" />
                  Memory
                </span>
                <span className="text-app">34%</span>
              </div>
              <div className="pt-3 border-t border-app-border">
                <p className="text-xs text-app-muted">Last backup: 2 hours ago</p>
                <Button variant="secondary" size="sm" className="mt-2 gap-1">
                  <HardDrive className="w-4 h-4" />
                  Run backup now
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Department performance */}
      <Card>
        <CardHeader>
          <CardTitle>Department Performance</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {mockDeptStats.map((dept) => (
              <div
                key={dept.id}
                className="bg-app-card p-4 rounded-xl border border-app-border shadow-sm"
              >
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-lg bg-primary-100 dark:bg-primary-500/20 flex items-center justify-center text-primary-600 dark:text-primary-400 font-bold text-sm">
                    {dept.name.charAt(0)}
                  </div>
                  <span className="font-semibold text-app">{dept.name}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <p className="text-app-muted">Members</p>
                  <p className="text-app text-right">{dept.count}</p>
                  <p className="text-app-muted">Avg MP</p>
                  <p className="text-app text-right">{dept.avgXp.toLocaleString()}</p>
                  <p className="text-app-muted">Projects</p>
                  <p className="text-app text-right">{dept.activeProjects}</p>
                  <p className="text-app-muted">Completion</p>
                  <p className="text-app text-right">{dept.completionRate}%</p>
                </div>
                <p className="text-xs text-app-muted mt-2">Top: {dept.topPerformer}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Quick actions */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              <Link to="/admin/employees/new">
                <Button variant="primary" className="gap-2">
                  <UserPlus className="w-4 h-4" />
                  Add Employee
                </Button>
              </Link>
              <Link to="/admin/import">
                <Button variant="secondary" className="gap-2">
                  <Upload className="w-4 h-4" />
                  Bulk Import
                </Button>
              </Link>
              <Link to="/admin/analytics">
                <Button variant="secondary" className="gap-2">
                  <FileText className="w-4 h-4" />
                  Generate Report
                </Button>
              </Link>
              <Button variant="secondary" className="gap-2">
                <Target className="w-4 h-4" />
                Set Goals
              </Button>
              <Button variant="secondary" className="gap-2">
                <Award className="w-4 h-4" />
                Award Badges
              </Button>
              <Button variant="secondary" className="gap-2">
                <Megaphone className="w-4 h-4" />
                Send Announcement
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Alerts */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-amber-400" />
              Alerts & Notifications
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3" role="list">
              {mockAlerts.map((alert) => (
                <li
                  key={alert.id}
                  className="flex items-center justify-between py-2 border-b border-app-border last:border-0"
                >
                  <div>
                    <p className="text-sm font-medium text-app">{alert.title}</p>
                    <p className="text-xs text-app-muted">{alert.message}</p>
                  </div>
                  <Button variant="secondary" size="sm">{alert.action}</Button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/* ── Knowledge Hub Widget ── */
function KnowledgeHubWidget({ userId }: { userId: string }) {
  const [stats, setStats] = useState<{
    totalDocuments: number; totalViews: number; totalDownloads: number;
    pendingFlags: number; pendingRequiredReadings: number;
  } | null>(null);

  useEffect(() => {
    if (!userId) return;
    adminKnowledgeAPI.stats(userId)
      .then(data => setStats(data as typeof stats))
      .catch(() => {});
  }, [userId]);

  if (!stats) return null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-primary-400" />
          Knowledge Hub Overview
        </CardTitle>
        <Link to="/admin/knowledge/documents">
          <Button variant="secondary" size="sm">Manage</Button>
        </Link>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
          <div className="text-center p-3 rounded-lg bg-app-card/50">
            <FileText className="w-5 h-5 text-blue-400 mx-auto mb-1" />
            <p className="text-xl font-bold text-app">{stats.totalDocuments}</p>
            <p className="text-xs text-app-muted">Documents</p>
          </div>
          <div className="text-center p-3 rounded-lg bg-app-card/50">
            <Eye className="w-5 h-5 text-indigo-400 mx-auto mb-1" />
            <p className="text-xl font-bold text-app">{stats.totalViews.toLocaleString()}</p>
            <p className="text-xs text-app-muted">Total Views</p>
          </div>
          <div className="text-center p-3 rounded-lg bg-app-card/50">
            <Download className="w-5 h-5 text-emerald-400 mx-auto mb-1" />
            <p className="text-xl font-bold text-app">{stats.totalDownloads.toLocaleString()}</p>
            <p className="text-xs text-app-muted">Downloads</p>
          </div>
          <div className="text-center p-3 rounded-lg bg-app-card/50">
            <Flag className="w-5 h-5 text-amber-400 mx-auto mb-1" />
            <p className="text-xl font-bold text-app">{stats.pendingFlags}</p>
            <p className="text-xs text-app-muted">Pending Flags</p>
          </div>
          <div className="text-center p-3 rounded-lg bg-app-card/50">
            <AlertCircle className="w-5 h-5 text-red-400 mx-auto mb-1" />
            <p className="text-xl font-bold text-app">{stats.pendingRequiredReadings}</p>
            <p className="text-xs text-app-muted">Unread Required</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
