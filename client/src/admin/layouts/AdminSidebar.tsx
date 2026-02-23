import { useEffect, useState } from 'react';
import { NavLink, Link } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  Building2,
  KeyRound,
  Trophy,
  BarChart3,
  Settings,
  ScrollText,
  Upload,
  ArrowLeft,
  Receipt,
  Shield,
  Briefcase,
  FileText,
  BookOpen,
  FolderOpen,
  Tag,
  Flag,
  ClipboardCheck,
  Clock,
  UserCog,
  Bot,
} from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { Avatar, MessignLogoAnimated } from '@/components/ui';
import { approvalsAPI, adminAPI } from '@/lib/api';
import { cn } from '@/lib/utils';

const adminNavItems: { to: string; label: string; icon: typeof LayoutDashboard; indent?: boolean }[] = [
  { to: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: 'employees', label: 'Employee Management', icon: Users },
  { to: 'projects', label: 'Project Marketplace', icon: Briefcase },
  { to: 'departments', label: 'Departments', icon: Building2 },
  { to: 'roles', label: 'Roles', icon: KeyRound },
  { to: 'security', label: 'Security', icon: Shield },
  { to: 'xp-achievements', label: 'MP & Achievements', icon: Trophy },
  { to: 'analytics', label: 'Analytics', icon: BarChart3 },
  { to: 'reimbursements', label: 'Reimbursements', icon: Receipt },
  { to: 'invoices', label: 'Invoices', icon: FileText },
  { to: 'knowledge/dashboard', label: 'Knowledge Hub', icon: BookOpen },
  { to: 'knowledge/documents', label: 'Documents', icon: FileText, indent: true },
  { to: 'knowledge/categories', label: 'Categories', icon: Tag, indent: true },
  { to: 'knowledge/collections', label: 'Collections', icon: FolderOpen, indent: true },
  { to: 'knowledge/reviews', label: 'Pending Reviews', icon: Clock, indent: true },
  { to: 'knowledge/flags', label: 'Flags & Reports', icon: Flag, indent: true },
  { to: 'knowledge/roles', label: 'Roles', icon: UserCog, indent: true },
  { to: 'knowledge/teams', label: 'Teams', icon: Users, indent: true },
  { to: 'knowledge/audit', label: 'KH Audit Log', icon: ScrollText, indent: true },
  { to: 'knowledge/compliance', label: 'Compliance', icon: ClipboardCheck, indent: true },
  { to: 'ai-settings', label: 'AI Settings', icon: Bot },
  { to: 'settings', label: 'System Settings', icon: Settings },
  { to: 'audit', label: 'Audit Logs', icon: ScrollText },
  { to: 'import', label: 'Bulk Import', icon: Upload },
];

export function AdminSidebar() {
  const { user } = useAuthStore();
  const [pendingApprovalsCount, setPendingApprovalsCount] = useState(0);
  const [totalEmployees, setTotalEmployees] = useState<number | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    approvalsAPI
      .getCounts(user.id)
      .then((data) => setPendingApprovalsCount((data as { pendingApprovalsCount?: number }).pendingApprovalsCount ?? 0))
      .catch(() => setPendingApprovalsCount(0));
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    adminAPI.employees
      .getAll(user.id)
      .then((data) => setTotalEmployees(Array.isArray(data) ? data.length : 0))
      .catch(() => setTotalEmployees(null));
  }, [user?.id]);

  if (!user) return null;

  return (
    <aside
      className="w-[280px] shrink-0 flex flex-col border-r border-app-border bg-app-sidebar transition-colors duration-200"
      aria-label="Admin navigation"
    >
      {/* Header */}
      <div className="p-3 border-b border-app-border">
        <div className="flex items-center gap-2">
          <MessignLogoAnimated
            size={36}
            autoPlay
            loop
            loopDelay={8000}
            playOnHover
            className="shrink-0"
          />
          <span className="font-bold text-app text-lg">Messign Admin</span>
        </div>
      </div>

      {/* Admin Profile */}
      <div className="p-4 border-b border-app-border">
        <div className="flex items-center gap-3">
          <Avatar src={user.avatar} name={user.name} size="lg" status={user.status} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-app truncate">{user.name}</span>
              <span className="shrink-0 px-2 py-0.5 rounded text-xs font-medium bg-primary-500 text-white">
                ADMIN
              </span>
            </div>
            <p className="text-sm text-app-muted truncate">{user.jobTitle}</p>
          </div>
        </div>

        {/* Quick stats */}
        <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-app-border" aria-label="Quick stats">
          <div className="text-center">
            <p className="text-lg font-bold text-app" aria-live="polite">{totalEmployees ?? '—'}</p>
            <p className="text-xs text-app-muted">Employees</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-app" aria-live="polite">{pendingApprovalsCount}</p>
            <p className="text-xs text-app-muted">Pending</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-app">—</p>
            <p className="text-xs text-app-muted">Alerts</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1" aria-label="Admin pages">
        {adminNavItems.map((item) => {
          const Icon = item.icon ?? LayoutDashboard;
          const hasPendingApprovals = item.to === 'reimbursements' && pendingApprovalsCount > 0;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === 'dashboard'}
              className={({ isActive }) =>
                cn(
                  'w-full flex items-center gap-3 py-2.5 rounded-lg transition-all duration-200 text-left relative border-l-[3px] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 focus-visible:ring-offset-app-sidebar',
                  item.indent ? 'pl-8 pr-3' : 'px-3',
                  isActive
                    ? 'bg-app-nav-active-bg text-app-nav-active-text border-l-primary-500 font-semibold'
                    : 'border-l-transparent text-app-muted hover:text-app hover:bg-app-nav-hover'
                )
              }
              aria-current="page"
            >
              <Icon className={cn('shrink-0', item.indent ? 'w-4 h-4' : 'w-5 h-5')} aria-hidden />
              <span className={cn('font-medium', item.indent && 'text-[13px]')}>{item.label}</span>
              {hasPendingApprovals && (
                <span
                  className="notification-dot"
                  title={`${pendingApprovalsCount} pending approval${pendingApprovalsCount !== 1 ? 's' : ''}`}
                  aria-label={`${pendingApprovalsCount} pending approvals`}
                />
              )}
            </NavLink>
          );
        })}
      </nav>

      {/* Back to Main App */}
      <div className="p-3 border-t border-app-border">
        <Link
          to="/"
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-app-muted hover:text-primary-500 hover:bg-app-nav-hover transition-all duration-200 focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 focus:ring-offset-app-sidebar"
          aria-label="Back to main app"
        >
          <ArrowLeft className="w-5 h-5" aria-hidden />
          <span className="font-medium">Back to Main App</span>
        </Link>
      </div>
    </aside>
  );
}
