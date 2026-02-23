import { useState, useEffect } from 'react';
import { Search, Filter, LayoutGrid, List } from 'lucide-react';
import { useUsersStore } from '@/stores/usersStore';
import type { User, UserRole, UserStatus } from '@/types';
import { Card, Badge, Avatar, Input, ProgressBar } from '@/components/ui';
import { EmployeeDetailPanel } from '@/components/team';
import { cn, formatNumber, getStatusColor } from '@/lib/utils';
import { calculateLevel } from '@/types';
import { departmentsAPI } from '@/lib/api';

export function TeamView() {
  const { users } = useUsersStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [filterRole, setFilterRole] = useState<UserRole | 'all'>('all');
  const [filterDepartment, setFilterDepartment] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<UserStatus | 'all'>('all');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [departmentNames, setDepartmentNames] = useState<string[]>([]);

  useEffect(() => {
    departmentsAPI
      .getAll()
      .then((list) => setDepartmentNames(list.map((d) => d.name)))
      .catch(() => { /* keep fallback to user-derived list */ });
  }, []);

  const departments = departmentNames.length > 0 ? departmentNames : [...new Set(users.map((u) => u.department))];

  const filteredUsers = users.filter(user => {
    const matchesSearch = user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.jobTitle.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesRole = filterRole === 'all' || user.role === filterRole;
    const matchesDepartment = filterDepartment === 'all' || user.department === filterDepartment;
    const matchesStatus = filterStatus === 'all' || user.status === filterStatus;

    return matchesSearch && matchesRole && matchesDepartment && matchesStatus;
  });

  // Sort by MP (highest first)
  const sortedUsers = [...filteredUsers].sort((a, b) => b.xp - a.xp);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="px-6 py-4 border-b border-app flex flex-wrap items-center gap-4 flex-shrink-0">
        <Input
          placeholder="Search team members..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          icon={<Search className="w-4 h-4" />}
          className="w-64"
        />

        {/* Filters */}
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-app-muted" />
          
          <select
            value={filterRole}
            onChange={(e) => setFilterRole(e.target.value as UserRole | 'all')}
            className="select-theme pr-8"
          >
            <option value="all">All Roles</option>
            <option value="admin">Admin</option>
            <option value="manager">Manager</option>
            <option value="member">Member</option>
          </select>

          <select
            value={filterDepartment}
            onChange={(e) => setFilterDepartment(e.target.value)}
            className="select-theme pr-8"
          >
            <option value="all">All Departments</option>
            {departments.map(dept => (
              <option key={dept} value={dept}>{dept}</option>
            ))}
          </select>

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as UserStatus | 'all')}
            className="select-theme pr-8"
          >
            <option value="all">All Status</option>
            <option value="online">Online</option>
            <option value="away">Away</option>
            <option value="busy">Busy</option>
            <option value="offline">Offline</option>
          </select>
        </div>

        <div className="ml-auto flex gap-1 p-1 bg-app-hover rounded-lg">
          <button
            onClick={() => setViewMode('grid')}
            className={cn('p-2 rounded transition-colors', viewMode === 'grid' ? 'bg-primary-500/20 text-app' : 'text-app-muted hover:text-app')}
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={cn('p-2 rounded transition-colors', viewMode === 'list' ? 'bg-primary-500/20 text-app' : 'text-app-muted hover:text-app')}
          >
            <List className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Team Members */}
      <div className="flex-1 overflow-auto p-6">
        <div className={viewMode === 'grid'
          ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4'
          : 'space-y-3'
        }>
          {sortedUsers.map(user => (
            <UserCard
              key={user.id}
              user={user}
              viewMode={viewMode}
              onClick={() => setSelectedUser(user)}
            />
          ))}
        </div>

        {sortedUsers.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-app-muted">
            <p className="text-lg">No team members found</p>
            <p className="text-sm mt-1">Try adjusting your filters</p>
          </div>
        )}
      </div>

      <EmployeeDetailPanel
        user={selectedUser}
        isOpen={!!selectedUser}
        onClose={() => setSelectedUser(null)}
      />
    </div>
  );
}

interface UserCardProps {
  user: User;
  viewMode: 'grid' | 'list';
  onClick: () => void;
}

function UserCard({ user, viewMode, onClick }: UserCardProps) {
  const levelInfo = calculateLevel(user.xp);

  const cardWrapperClass = cn(
    'block w-full text-left cursor-pointer transition-transform duration-200',
    'hover:scale-[1.02] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 focus-visible:ring-offset-dark-900',
    'rounded-xl'
  );

  if (viewMode === 'list') {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={onClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onClick();
          }
        }}
        className={cardWrapperClass}
        aria-label={`View ${user.name} profile`}
      >
      <Card variant="hover" className="flex items-center gap-4 p-4">
        <Avatar
          src={user.avatar}
          name={user.name}
          size="lg"
          status={user.status}
        />
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-app">{user.name}</h3>
            <div className="level-badge text-xs w-6 h-6">L{user.level}</div>
            {user.role !== 'member' && (
              <Badge variant={user.role === 'admin' ? 'red' : 'purple'}>
                {user.role}
              </Badge>
            )}
          </div>
          <p className="text-sm text-app-muted">{user.jobTitle}</p>
        </div>

        <Badge variant="blue">{user.department}</Badge>

        <div className="w-32">
          <div className="flex justify-between text-xs text-app-muted mb-1">
            <span>MP</span>
            <span className="text-primary-400">{formatNumber(user.xp)}</span>
          </div>
          <ProgressBar value={levelInfo.progress} variant="xp" size="sm" />
        </div>

        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-sm font-semibold text-app">{user.stats.tasksCompleted}</p>
            <p className="text-xs text-app-muted">Tasks</p>
          </div>
          <div>
            <p className="text-sm font-semibold text-app">{formatNumber(user.stats.messagesSent)}</p>
            <p className="text-xs text-app-muted">Messages</p>
          </div>
          <div>
            <p className="text-sm font-semibold text-app">{user.badges.length}</p>
            <p className="text-xs text-app-muted">Badges</p>
          </div>
        </div>
      </Card>
      </div>
    );
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      className={cardWrapperClass}
      aria-label={`View ${user.name} profile`}
    >
    <Card variant="hover">
      {/* Status Indicator */}
        <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className={cn('w-2 h-2 rounded-full', getStatusColor(user.status))} />
          <span className="text-xs text-app-muted capitalize">{user.status}</span>
        </div>
        {user.role !== 'member' && (
          <Badge variant={user.role === 'admin' ? 'red' : 'purple'}>
            {user.role}
          </Badge>
        )}
      </div>

      {/* Avatar & Info */}
      <div className="flex flex-col items-center text-center mb-4">
        <Avatar
          src={user.avatar}
          name={user.name}
          size="xl"
          status={user.status}
          className="mb-3"
        />
        <h3 className="font-semibold text-app">{user.name}</h3>
        <p className="text-sm text-app-muted">{user.jobTitle}</p>
        <Badge variant="blue" className="mt-2">{user.department}</Badge>
      </div>

      {/* Level & MP */}
      <div className="mb-4">
        <div className="flex items-center justify-center gap-2 mb-2">
          <div className="level-badge">L{user.level}</div>
          <span className="text-sm text-primary-400">{formatNumber(user.xp)} MP</span>
        </div>
        <ProgressBar value={levelInfo.progress} variant="xp" size="sm" />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 pt-4 border-t border-app">
        <div className="text-center">
          <p className="text-lg font-bold text-app">{user.stats.tasksCompleted}</p>
          <p className="text-xs text-app-muted">Tasks</p>
        </div>
        <div className="text-center">
          <p className="text-lg font-bold text-app">{formatNumber(user.stats.messagesSent)}</p>
          <p className="text-xs text-app-muted">Messages</p>
        </div>
        <div className="text-center">
          <p className="text-lg font-bold text-app">{user.badges.length}</p>
          <p className="text-xs text-app-muted">Badges</p>
        </div>
      </div>
    </Card>
    </div>
  );
}
