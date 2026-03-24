import { useState, useEffect, useCallback, useRef } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowLeft,
  MoreVertical,
  MessageSquare,
  Mail,
  Phone,
  MapPin,
  Clock,
  Copy,
  Target,
  Trophy,
  Users,
  ChevronRight,
  Rocket,
  CheckCircle,
  Crown,
  Bug,
  Zap,
  Award,
  Shield,
  Star,
  BarChart as BarChartIcon,
  Heart,
  MessageCircle,
  Sunrise,
  Moon,
  Code,
  Server,
  Palette,
  PenTool,
} from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
} from 'recharts';
import type { User, Activity, ActivityType } from '@/types';
import { calculateLevel } from '@/types';
import { getDepartmentColor } from '@/lib/departmentColors';
import { getRarityTheme } from '@/lib/badgeRarity';
import { useGameStore } from '@/stores/gameStore';
import { useUsersStore } from '@/stores/usersStore';
import { useAuthStore } from '@/stores/authStore';
import { cn, getInitials } from '@/lib/utils';

const BADGE_ICON_MAP: Record<string, LucideIcon> = {
  rocket: Rocket,
  'check-circle': CheckCircle,
  crown: Crown,
  bug: Bug,
  zap: Zap,
  sunrise: Sunrise,
  moon: Moon,
  code: Code,
  server: Server,
  palette: Palette,
  'pen-tool': PenTool,
  'bar-chart': BarChartIcon,
  star: Star,
  award: Award,
  shield: Shield,
  target: Target,
  users: Users,
  heart: Heart,
  'message-circle': MessageCircle,
  trophy: Trophy,
};

export interface EmployeeDetailPanelProps {
  user: User | null;
  isOpen: boolean;
  onClose: () => void;
}

const TABS = ['overview', 'activity', 'stats', 'permissions'] as const;
type TabId = (typeof TABS)[number];

function getEmployeeId(user: User): string {
  return user.employeeId ?? `EMP-${user.id.replace('user-', '').toUpperCase().slice(0, 3)}`;
}

function getPhone(user: User): string {
  return user.phone ?? '+1 234 567 8900';
}

function getLocation(user: User): string {
  return user.location ?? 'San Francisco, CA';
}

function getTimezone(user: User): string {
  return user.timezone ?? 'PST, UTC-8';
}

function getSkills(user: User): string[] {
  return user.skills ?? ['React', 'TypeScript', 'Node.js', 'Communication'];
}

export function EmployeeDetailPanel({ user, isOpen, onClose }: EmployeeDetailPanelProps) {
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [actionsOpen, setActionsOpen] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const handleEscape = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setActionsOpen(false);
        onClose();
      }
    },
    [onClose]
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
      closeButtonRef.current?.focus();
    }
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [isOpen, handleEscape]);

  if (!user) return null;

  const deptColor = getDepartmentColor(user.department);
  const statusColors: Record<string, string> = {
    online: 'bg-success-500',
    away: 'bg-warning-500',
    busy: 'bg-danger-500',
    offline: 'bg-gray-500',
  };
  const statusColor = statusColors[user.status] ?? 'bg-gray-500';

  return (
    <>
      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-[1000] bg-black/60 backdrop-blur-sm animate-fade-in"
            onClick={onClose}
            aria-hidden
          />
          <div
            className={cn(
              'fixed right-0 top-0 bottom-0 z-[1001] w-full max-w-[480px] h-full flex flex-col',
              'bg-gradient-to-b from-[#1a1a2e] to-[#16213e]',
              'border-l border-app-border shadow-[-10px_0_40px_rgba(0,0,0,0.5)]',
              'animate-slide-in-right'
            )}
            role="dialog"
            aria-label="Employee details"
          >
            {/* Sticky header */}
            <div
              className="flex-shrink-0 flex items-center justify-between h-[72px] px-6 py-5 border-b border-app-border"
              style={{ background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(20px)' }}
            >
              <button
                ref={closeButtonRef}
                type="button"
                onClick={onClose}
                className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full text-app-text/70 hover:text-app-text hover:bg-app-hover transition-colors"
                aria-label="Close panel"
              >
                <ArrowLeft className="w-6 h-6" />
              </button>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setActionsOpen((o) => !o)}
                  className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full text-app-text/70 hover:text-app-text hover:bg-app-hover transition-colors"
                  aria-label="Actions menu"
                  aria-expanded={actionsOpen}
                >
                  <MoreVertical className="w-6 h-6" />
                </button>
                {actionsOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setActionsOpen(false)} aria-hidden />
                    <div
                      className="absolute right-0 top-full mt-1 py-1 min-w-[180px] rounded-xl bg-app-card border border-app-border shadow-xl z-20 animate-fade-in"
                      role="menu"
                    >
                      {['Edit Profile', 'Send Message', 'View Full Profile', 'Manage Permissions', 'View Activity Log'].map(
                        (label) => (
                          <button
                            key={label}
                            type="button"
                            onClick={() => setActionsOpen(false)}
                            className="w-full px-4 py-2.5 text-left text-sm text-app-text/90 hover:bg-app-hover transition-colors"
                            role="menuitem"
                          >
                            {label}
                          </button>
                        )
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Profile header */}
            <div
              className="flex-shrink-0 relative px-6 py-8"
              style={{
                background: 'linear-gradient(180deg, rgba(255,255,255,0.05) 0%, transparent 100%)',
              }}
            >
              <div className="relative flex flex-col items-center text-center">
                <div className="relative">
                  <div
                    className="w-[120px] h-[120px] rounded-full border-4 flex items-center justify-center overflow-hidden bg-app-hover"
                    style={{
                      borderColor: `${deptColor.primary}${Math.round(deptColor.borderOpacity * 255).toString(16).padStart(2, '0')}`,
                      boxShadow: `0 0 32px ${deptColor.primary}40`,
                    }}
                  >
                    {user.avatar ? (
                      <img
                        src={user.avatar}
                        alt={user.name}
                        className="w-full h-full object-cover object-center rounded-full"
                      />
                    ) : (
                      <div className="w-full h-full rounded-full bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center text-3xl font-bold text-app-text">
                        {getInitials(user.name)}
                      </div>
                    )}
                  </div>
                  <span
                    className={cn(
                      'absolute bottom-0 right-0 w-5 h-5 rounded-full border-[3px] border-[#1a1a2e]',
                      statusColor,
                      user.status === 'online' && 'animate-pulse'
                    )}
                    aria-hidden
                  />
                </div>
                <span
                  className="absolute top-0 right-6 px-3 py-1 rounded-full text-xs font-medium capitalize"
                  style={{
                    background: `rgba(255,255,255,0.1)`,
                    border: '1px solid rgba(255,255,255,0.1)',
                    color: 'rgba(255,255,255,0.9)',
                  }}
                >
                  {user.status}
                </span>
                <h2 className="mt-4 text-[28px] font-bold text-app-text tracking-tight" style={{ letterSpacing: '-0.02em' }}>
                  {user.name}
                </h2>
                <p className="mt-2 text-base font-medium text-app-text/70">{user.jobTitle}</p>
                <p className="mt-1 text-[13px] text-app-text/50">{getEmployeeId(user)}</p>
                <div className="flex flex-wrap justify-center gap-2 mt-4">
                  <span
                    className="px-3 py-1.5 rounded-md text-xs font-semibold"
                    style={{
                      background: `${deptColor.primary}${Math.round(deptColor.bgOpacity * 255).toString(16).padStart(2, '0')}`,
                      border: `1px solid ${deptColor.primary}${Math.round(deptColor.borderOpacity * 255).toString(16).padStart(2, '0')}`,
                      color: deptColor.primary,
                    }}
                  >
                    {user.department}
                  </span>
                  <span
                    className="px-3 py-1.5 rounded-md text-xs font-semibold bg-app-surface-tertiary border border-app-border-strong text-app-text/90"
                  >
                    {user.role}
                  </span>
                </div>
              </div>
            </div>

            {/* Tab bar */}
            <div
              className="flex-shrink-0 flex px-6 border-b border-app-border overflow-x-auto"
              style={{ background: 'rgba(0,0,0,0.2)' }}
            >
              {TABS.map((tabId) => (
                <button
                  key={tabId}
                  type="button"
                  onClick={() => setActiveTab(tabId)}
                  className={cn(
                    'flex-shrink-0 px-5 py-4 text-sm font-semibold transition-all duration-200 cursor-pointer',
                    activeTab === tabId
                      ? 'text-app-text border-b-[3px]'
                      : 'text-app-text/60 hover:text-app-text/80 hover:bg-app-hover',
                    activeTab !== tabId && 'border-b-[3px] border-transparent'
                  )}
                  style={
                    activeTab === tabId
                      ? { borderBottomColor: deptColor.primary }
                      : undefined
                  }
                >
                  {tabId === 'overview' && 'Overview'}
                  {tabId === 'activity' && 'Activity'}
                  {tabId === 'stats' && 'Stats'}
                  {tabId === 'permissions' && 'Permissions'}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-y-auto">
              {activeTab === 'overview' && (
                <OverviewTab
                  user={user}
                  deptColor={deptColor}
                  onClose={onClose}
                />
              )}
              {activeTab === 'activity' && <ActivityTab userId={user.id} />}
              {activeTab === 'stats' && <StatsTab user={user} deptColor={deptColor} />}
              {activeTab === 'permissions' && <PermissionsTab user={user} />}
            </div>
          </div>
        </>
      )}
    </>
  );
}

function OverviewTab({
  user,
  deptColor,
}: {
  user: User;
  deptColor: ReturnType<typeof getDepartmentColor>;
  onClose: () => void;
}) {
  const { users, getUserById } = useUsersStore();
  const { progress } = calculateLevel(user.xp);

  const copyEmail = () => {
    navigator.clipboard.writeText(user.email);
  };

  const manager = user.managerId ? getUserById(user.managerId) : null;
  const reporteesCount = users.filter((u) => u.managerId === user.id).length;

  return (
    <div className="p-6 space-y-6">
      {/* Quick actions */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Send Message', icon: MessageSquare, bg: 'rgba(59,130,246,0.15)', border: 'rgba(59,130,246,0.3)' },
          { label: 'Email', icon: Mail, bg: 'rgba(168,85,247,0.15)', border: 'rgba(168,85,247,0.3)' },
          { label: 'Call', icon: Phone, bg: 'rgba(34,197,94,0.15)', border: 'rgba(34,197,94,0.3)' },
        ].map(({ label, icon: Icon, bg, border }) => (
          <button
            key={label}
            type="button"
            className="flex flex-col items-center justify-center gap-2 p-4 rounded-xl border transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg"
            style={{ background: bg, borderColor: border }}
          >
            <Icon className="w-6 h-6 text-app-text" />
            <span className="text-xs font-medium text-app-text/90">{label}</span>
          </button>
        ))}
      </div>

      {/* Contact information */}
      <div>
        <h4 className="text-base font-semibold text-app-text mb-4">Contact Information</h4>
        <div className="space-y-0">
          {[
            { icon: Mail, label: 'Email', value: user.email, copy: true },
            { icon: Phone, label: 'Phone', value: getPhone(user), copy: false },
            { icon: MapPin, label: 'Location', value: getLocation(user), copy: false },
            { icon: Clock, label: 'Timezone', value: getTimezone(user), copy: false },
          ].map(({ icon: Icon, label, value, copy: showCopy }) => (
            <div
              key={label}
              className="flex items-center gap-3 py-3 border-b border-app-border"
            >
              <Icon className="w-[18px] h-[18px] text-app-text/50 shrink-0" />
              <span className="text-sm text-app-text/50 w-[100px] shrink-0">{label}</span>
              <span className="text-sm text-app-text flex-1 truncate">{value}</span>
              {showCopy && (
                <button
                  type="button"
                  onClick={copyEmail}
                  className="p-1.5 rounded-lg text-app-text/50 hover:text-app-text hover:bg-app-hover transition-colors"
                  aria-label="Copy email"
                >
                  <Copy className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* MP & Level */}
      <div className="relative rounded-xl p-4 border border-app-border overflow-hidden">
        <div
          className="absolute top-4 right-4 w-12 h-12 rounded-full flex items-center justify-center text-base font-bold text-app-text"
          style={{ background: deptColor.primary }}
        >
          L{user.level}
        </div>
        <h4 className="text-base font-semibold text-app-text mb-2">Progress & Level</h4>
        <p className="text-2xl font-bold text-app-text">{user.xp.toLocaleString()} MP</p>
        <p className="text-[13px] text-app-text/50 mb-2">MP to next level: {user.xpToNextLevel.toLocaleString()}</p>
        <div className="h-2 rounded-full overflow-hidden bg-app-surface-tertiary">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${Math.min(progress, 100)}%`, background: deptColor.primary }}
          />
        </div>
        <p className="text-xs text-app-text/50 mt-1 text-right">{Math.round(progress)}%</p>
      </div>

      {/* Stats overview */}
      <div>
        <h4 className="text-base font-semibold text-app-text mb-3">Stats Overview</h4>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {[
            { label: 'Tasks', value: user.stats.tasksCompleted, icon: Target },
            { label: 'Messages', value: user.stats.messagesSent >= 1000 ? `${(user.stats.messagesSent / 1000).toFixed(1)}K` : user.stats.messagesSent, icon: MessageSquare },
            { label: 'Badges', value: user.badges.length, icon: Trophy },
          ].map(({ label, value, icon: Icon }) => (
            <div
              key={label}
              className="rounded-xl p-4 border border-app-border text-center"
              style={{ background: 'rgba(255,255,255,0.03)' }}
            >
              <Icon className="w-5 h-5 text-app-text/60 mx-auto mb-2" />
              <p className="text-2xl font-bold text-app-text">{value}</p>
              <p className="text-xs text-app-text/60">{label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Team & reporting */}
      <div>
        <h4 className="text-base font-semibold text-app-text mb-3">Team & Reporting</h4>
        <div className="space-y-2 text-sm">
          {manager && (
            <div className="flex items-center justify-between py-2 border-b border-app-border">
              <span className="text-app-text/60">Reports to</span>
              <span className="text-app-text font-medium">{manager.name}</span>
            </div>
          )}
          {(reporteesCount > 0 || manager) && (
            <div className="flex items-center justify-between py-2 border-b border-app-border">
              <span className="text-app-text/60">Manages</span>
              <span className="text-app-text font-medium">{reporteesCount} people</span>
            </div>
          )}
          {!manager && reporteesCount === 0 && (
            <p className="text-sm text-app-text/50">No reporting structure data.</p>
          )}
        </div>
      </div>

      {/* Skills */}
      <div>
        <h4 className="text-base font-semibold text-app-text mb-3">Skills</h4>
        <div className="flex flex-wrap gap-2">
          {getSkills(user).map((skill) => (
            <span
              key={skill}
              className="px-3.5 py-2 rounded-[20px] text-[13px] text-app-text/90 border border-app-border transition-colors hover:border-white/25"
              style={{ background: 'rgba(255,255,255,0.08)' }}
            >
              {skill}
            </span>
          ))}
        </div>
      </div>

      {/* Recent badges */}
      <div>
        <h4 className="text-base font-semibold text-app-text mb-3">Recent Achievements</h4>
        {user.badges.length === 0 ? (
          <p className="text-sm text-app-text/50">No achievements yet.</p>
        ) : (
          <div className="flex gap-3 overflow-x-auto pb-2">
            {user.badges.slice(0, 4).map((badge) => {
              const theme = getRarityTheme(badge.rarity);
              const IconComponent = BADGE_ICON_MAP[badge.icon] ?? Trophy;
              return (
                <div
                  key={badge.id}
                  className="flex-shrink-0 w-[140px] rounded-xl border p-3 text-center transition-transform hover:scale-[1.02] flex flex-col items-center"
                  style={{
                    background: theme.gradient,
                    borderColor: theme.primary,
                    boxShadow: `0 0 20px ${theme.glow}`,
                  }}
                >
                  <IconComponent className="w-8 h-8 text-app-text shrink-0" aria-hidden />
                  <p className="mt-2 text-sm font-medium text-app-text truncate w-full">{badge.name}</p>
                  <p className="text-xs capitalize mt-0.5" style={{ color: theme.primary }}>{badge.rarity}</p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

const ACTIVITY_FILTER_OPTIONS: { value: 'all' | 'tasks' | 'messages' | 'achievements' | 'projects'; label: string }[] = [
  { value: 'all', label: 'All Activity' },
  { value: 'tasks', label: 'Tasks' },
  { value: 'messages', label: 'Messages' },
  { value: 'achievements', label: 'Achievements' },
  { value: 'projects', label: 'Projects' },
];

const ACTIVITY_TYPE_GROUPS: Record<string, ActivityType[]> = {
  tasks: ['task_completed', 'milestone_reached'],
  messages: ['message_sent'],
  achievements: ['badge_earned', 'level_up'],
  projects: ['project_joined', 'document_created'],
};

function ActivityTab({ userId }: { userId: string }) {
  const { activities } = useGameStore();
  const [typeFilter, setTypeFilter] = useState<'all' | 'tasks' | 'messages' | 'achievements' | 'projects'>('all');

  const byUser = activities.filter((a) => a.userId === userId);
  const filtered =
    typeFilter === 'all'
      ? byUser
      : byUser.filter((a) => ACTIVITY_TYPE_GROUPS[typeFilter]?.includes(a.type));

  const activityIcons: Record<string, React.ComponentType<{ className?: string }>> = {
    task_completed: Target,
    badge_earned: Trophy,
    level_up: Trophy,
    message_sent: MessageSquare,
    project_joined: Users,
    document_created: Mail,
    milestone_reached: Target,
  };

  const typeColors: Record<string, string> = {
    task_completed: 'rgba(59,130,246,0.3)',
    milestone_reached: 'rgba(59,130,246,0.3)',
    badge_earned: 'rgba(245,158,11,0.3)',
    level_up: 'rgba(245,158,11,0.3)',
    message_sent: 'rgba(168,85,247,0.3)',
    project_joined: 'rgba(34,197,94,0.3)',
    document_created: 'rgba(34,197,94,0.3)',
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
        <h4 className="text-base font-semibold text-app-text">Activity</h4>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)}
          className="px-3 py-2 bg-app-surface-tertiary border border-app-border rounded-lg text-sm text-app-text focus:outline-none focus:border-primary-500"
          aria-label="Filter activity by type"
        >
          {ACTIVITY_FILTER_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
      {filtered.length === 0 ? (
        <p className="text-sm text-app-text/50">No recent activity.</p>
      ) : (
        <div className="space-y-0">
          {filtered.slice(0, 20).map((activity) => {
            const Icon = activityIcons[activity.type] ?? Target;
            const bg = typeColors[activity.type] ?? 'rgba(59,130,246,0.2)';
            return (
              <div key={activity.id} className="flex gap-4 py-4 border-b border-app-border">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                  style={{ background: bg }}
                >
                  <Icon className="w-4 h-4 text-app-text" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-app-text">{activity.message}</p>
                  <p className="text-xs text-app-text/50 mt-0.5">
                    {new Date(activity.timestamp).toLocaleString()}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Mock daily MP for last 30 days (for LineChart)
function mockDailyXp(userXp: number): { day: string; xp: number; cumulative: number }[] {
  const days = 30;
  const perDay = Math.max(1, Math.floor(userXp / days / 10) * 10);
  const data: { day: string; xp: number; cumulative: number }[] = [];
  let cumulative = 0;
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const xp = i === days - 1 ? userXp % perDay + perDay : perDay + Math.floor(Math.random() * 20);
    cumulative += xp;
    data.push({
      day: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      xp,
      cumulative,
    });
  }
  return data;
}

// Build activity breakdown from activities (Tasks / Messages / Projects / Other)
function activityBreakdownFromUser(activities: Activity[], userId: string): { name: string; value: number; color: string }[] {
  const byUser = activities.filter((a) => a.userId === userId);
  const counts = { Tasks: 0, Messages: 0, Projects: 0, Other: 0 };
  const taskTypes: ActivityType[] = ['task_completed', 'milestone_reached'];
  const msgTypes: ActivityType[] = ['message_sent'];
  const projTypes: ActivityType[] = ['project_joined', 'document_created'];
  for (const a of byUser) {
    if (taskTypes.includes(a.type)) counts.Tasks++;
    else if (msgTypes.includes(a.type)) counts.Messages++;
    else if (projTypes.includes(a.type)) counts.Projects++;
    else counts.Other++;
  }
  return [
    { name: 'Tasks', value: counts.Tasks, color: '#3b82f6' },
    { name: 'Messages', value: counts.Messages, color: '#a855f7' },
    { name: 'Projects', value: counts.Projects, color: '#10b981' },
    { name: 'Other', value: counts.Other, color: '#6b7280' },
  ].filter((d) => d.value > 0);
}

function StatsTab({
  user,
  deptColor,
}: {
  user: User;
  deptColor: ReturnType<typeof getDepartmentColor>;
}) {
  const { users } = useUsersStore();
  const { activities } = useGameStore();
  const teamAvgTasks = users.length ? users.reduce((s, u) => s + u.stats.tasksCompleted, 0) / users.length : 0;
  const teamAvgXp = users.length ? users.reduce((s, u) => s + u.xp, 0) / users.length : 0;
  const teamAvgBadges = users.length ? users.reduce((s, u) => s + u.badges.length, 0) / users.length : 0;

  const lineData = mockDailyXp(user.xp);
  const pieData = activityBreakdownFromUser(activities, user.id);
  const barData = [
    { metric: 'Tasks', user: user.stats.tasksCompleted, team: Math.round(teamAvgTasks) },
    { metric: 'MP', user: user.xp, team: Math.round(teamAvgXp) },
    { metric: 'Badges', user: user.badges.length, team: Math.round(teamAvgBadges) },
  ];

  const metrics = [
    { label: 'Average Response Time', value: '2.4h', trend: '+5.2%', positive: false },
    { label: 'Task Completion Rate', value: '94%', trend: '+2.1%', positive: true },
    { label: 'Collaboration Score', value: '8.2', trend: '+0.3', positive: true },
    { label: 'Engagement Level', value: 'High', trend: 'Stable', positive: true },
  ];

  return (
    <div className="p-6 space-y-6">
      <h4 className="text-base font-semibold text-app-text">MP Gained Over Time</h4>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={lineData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey="day" tick={{ fill: '#9ca3af', fontSize: 10 }} stroke="rgba(255,255,255,0.1)" />
            <YAxis tick={{ fill: '#9ca3af', fontSize: 10 }} stroke="rgba(255,255,255,0.1)" tickFormatter={(v) => v >= 1000 ? `${v / 1000}k` : String(v)} />
            <Tooltip
              contentStyle={{ background: '#1f2937', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }}
              labelStyle={{ color: '#9ca3af' }}
              formatter={(value: number) => [value.toLocaleString(), 'MP']}
            />
            <Line type="monotone" dataKey="cumulative" stroke={deptColor.primary} strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <h4 className="text-base font-semibold text-app-text">Activity Breakdown</h4>
      <div className="h-40">
        {pieData.length === 0 ? (
          <p className="text-sm text-app-text/50">No activity data yet.</p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={pieData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={60}
                label={({ name, value }) => `${name} ${value}`}
                labelLine={{ stroke: 'rgba(255,255,255,0.3)' }}
              >
                {pieData.map((entry) => (
                  <Cell key={entry.name} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ background: '#1f2937', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }}
                formatter={(value: number) => [value, 'Count']}
              />
            </PieChart>
          </ResponsiveContainer>
        )}
      </div>

      <h4 className="text-base font-semibold text-app-text">Performance Metrics</h4>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {metrics.map((m) => (
          <div
            key={m.label}
            className="rounded-xl p-4 border border-app-border"
            style={{ background: 'rgba(255,255,255,0.03)' }}
          >
            <p className="text-sm text-app-text/60">{m.label}</p>
            <p className="text-3xl font-bold text-app-text mt-1">{m.value}</p>
            <p className={cn('text-xs mt-1', m.positive ? 'text-success-500' : 'text-danger-500')}>{m.trend} from last week</p>
          </div>
        ))}
      </div>

      <h4 className="text-base font-semibold text-app-text">Comparison to Team</h4>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={barData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }} layout="vertical" barCategoryGap="20%">
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis type="number" tick={{ fill: '#9ca3af', fontSize: 10 }} />
            <YAxis type="category" dataKey="metric" tick={{ fill: '#9ca3af', fontSize: 11 }} width={60} />
            <Tooltip
              contentStyle={{ background: '#1f2937', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }}
              formatter={(value: number) => [value.toLocaleString(), '']}
            />
            <Bar dataKey="user" name="You" fill={deptColor.primary} radius={[0, 4, 4, 0]} />
            <Bar dataKey="team" name="Team avg" fill="rgba(255,255,255,0.2)" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function PermissionsTab({ user }: { user: User }) {
  const [expanded, setExpanded] = useState<string | null>('general');
  const { user: currentUser } = useAuthStore();
  const isAdmin = currentUser?.role === 'admin';

  const permissions = [
    {
      id: 'general',
      title: 'General Access',
      items: [
        { feature: 'Dashboard', level: 'View' },
        { feature: 'Chat', level: 'View, Create, Edit (own)' },
        { feature: 'Projects', level: 'View, Create, Edit (assigned)' },
      ],
    },
    {
      id: 'administrative',
      title: 'Administrative',
      items: [
        { feature: 'User Management', level: 'None' },
        { feature: 'Settings', level: 'View (limited)' },
        { feature: 'Reports', level: 'View (limited)' },
      ],
    },
    {
      id: 'special',
      title: 'Special Permissions',
      items: [
        { feature: 'Team Lead', level: user.role === 'manager' ? 'Yes' : 'No' },
        { feature: 'Admin', level: user.role === 'admin' ? 'Yes' : 'No' },
      ],
    },
  ];

  return (
    <div className="p-6 space-y-2">
      {permissions.map((section) => (
        <div key={section.id} className="rounded-xl border border-app-border overflow-hidden">
          <button
            type="button"
            onClick={() => setExpanded(expanded === section.id ? null : section.id)}
            className="w-full flex items-center justify-between px-4 py-3 text-left bg-app-surface-tertiary hover:bg-app-hover transition-colors"
          >
            <span className="font-semibold text-app-text">{section.title}</span>
            <ChevronRight
              className={cn('w-5 h-5 text-app-text/50 transition-transform', expanded === section.id && 'rotate-90')}
            />
          </button>
          {expanded === section.id && (
            <div className="px-4 py-3 space-y-2 border-t border-app-border">
              {section.items.map((item) => (
                <div key={item.feature} className="flex items-center justify-between py-2">
                  <span className="text-sm text-app-text/80">{item.feature}</span>
                  <span
                    className={cn(
                      'text-xs px-2 py-1 rounded-md',
                      item.level === 'None' && 'bg-app-surface-tertiary text-app-text/50',
                      item.level === 'View' && 'bg-primary-500/20 text-primary-400',
                      (item.level?.includes('Edit') || item.level === 'View, Create, Edit (own)') && 'bg-accent-500/20 text-accent-400',
                      item.level === 'Full' && 'bg-success-500/20 text-success-500',
                      (item.level === 'Yes' || item.level === 'No') && 'bg-app-surface-tertiary text-app-text/70'
                    )}
                  >
                    {item.level}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
      {isAdmin && (
        <button
          type="button"
          className="mt-4 w-full py-2.5 rounded-xl border border-app-border-strong text-sm font-medium text-app-text hover:bg-app-hover transition-colors"
        >
          Edit Permissions
        </button>
      )}
    </div>
  );
}
