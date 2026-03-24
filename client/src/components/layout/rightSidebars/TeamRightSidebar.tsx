import { Users, PieChart, Cake, UserPlus, Circle } from 'lucide-react';
import { useUsersStore } from '@/stores/usersStore';
import { Avatar } from '@/components/ui';
import { teamStats, birthdaysThisWeek, newTeamMembers } from '@/data/rightSidebar';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell } from 'recharts';

export function TeamRightSidebar() {
  const { users, getUserById } = useUsersStore();
  const onlineCount = users.filter((u) => u.status === 'online').length;
  const onlineUsers = users.filter((u) => u.status === 'online').slice(0, 8);

  return (
    <div className="h-full bg-app-sidebar border-l border-app flex flex-col overflow-hidden transition-colors duration-200" role="complementary" aria-label="Team statistics">
      {/* Team stats */}
      <div className="p-4 border-b border-app">
        <h3 className="font-semibold text-app flex items-center gap-2 mb-3">
          <Users className="w-4 h-4 text-primary-400" /> Team Statistics
        </h3>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="p-2 rounded bg-app-surface-tertiary">
            <p className="text-app-muted text-xs">Total members</p>
            <p className="text-app-text font-semibold">{teamStats.totalMembers}</p>
          </div>
          <div className="p-2 rounded bg-app-surface-tertiary">
            <p className="text-app-muted text-xs">Average level</p>
            <p className="text-app-text font-semibold">{teamStats.averageLevel}</p>
          </div>
        </div>
        <p className="text-xs text-app-muted mt-2">Most active: {teamStats.mostActiveDepartment}</p>
        <div className="h-24 mt-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={teamStats.departmentBreakdown} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#9ca3af' }} />
              <YAxis hide />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {teamStats.departmentBreakdown.map((_, i) => (
                  <Cell key={i} fill={['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444'][i % 5]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Department breakdown */}
      <div className="p-4 border-b border-app">
        <h3 className="font-semibold text-app flex items-center gap-2 mb-2">
          <PieChart className="w-4 h-4 text-accent-400" /> Department Breakdown
        </h3>
        <ul className="space-y-1 text-sm">
          {teamStats.departmentBreakdown.map((d) => (
            <li key={d.name} className="flex justify-between">
              <span className="text-app-muted">{d.name}</span>
              <span className="text-app-text font-medium">{d.count}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Birthdays */}
      <div className="p-4 border-b border-app">
        <h3 className="font-semibold text-app flex items-center gap-2 mb-2">
          <Cake className="w-4 h-4 text-warning-500" /> Birthdays This Week
        </h3>
        {birthdaysThisWeek.length === 0 ? (
          <p className="text-xs text-app-muted">No birthdays this week</p>
        ) : (
          <ul className="space-y-2">
            {birthdaysThisWeek.map((b) => {
              const u = getUserById(b.userId);
              return u ? (
                <li key={b.userId} className="flex items-center gap-2">
                  <Avatar src={u.avatar} name={u.name} size="sm" showStatus={false} />
                  <span className="text-sm text-app-muted">{b.name}</span>
                  <span className="text-xs text-app-muted ml-auto">{b.date}</span>
                </li>
              ) : null;
            })}
          </ul>
        )}
      </div>

      {/* New team members */}
      <div className="p-4 border-b border-app">
        <h3 className="font-semibold text-app flex items-center gap-2 mb-2">
          <UserPlus className="w-4 h-4 text-success-500" /> New Team Members
        </h3>
        <ul className="space-y-2">
          {newTeamMembers.map((n) => {
            const u = getUserById(n.userId);
            return u ? (
              <li key={n.userId} className="flex items-center gap-2">
                <Avatar src={u.avatar} name={u.name} size="sm" showStatus={false} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-app-text truncate">{n.name}</p>
                  <p className="text-xs text-app-muted">Joined {n.joinDate}</p>
                </div>
                <button className="text-xs text-primary-400 hover:underline">Say hello</button>
              </li>
            ) : null;
          })}
        </ul>
      </div>

      {/* Online now */}
      <div className="p-4">
        <h3 className="font-semibold text-app flex items-center gap-2 mb-2">
          <Circle className="w-2 h-2 fill-success-500 text-success-500" /> Online Now
        </h3>
        <p className="text-sm text-app-muted mb-2">{onlineCount} members online</p>
        <div className="flex -space-x-2">
          {onlineUsers.map((u) => (
            <Avatar key={u.id} src={u.avatar} name={u.name} size="sm" status="online" className="ring-2 ring-dark-800" />
          ))}
        </div>
      </div>
    </div>
  );
}
