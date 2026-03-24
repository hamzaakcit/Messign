import type { User } from '@/types';
import { Avatar, Badge } from '@/components/ui';
import { Briefcase, ListTodo, Award, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PersonalOverviewCardProps {
  user: User;
  onClick?: () => void;
}

export function PersonalOverviewCard({ user, onClick }: PersonalOverviewCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full text-left glass-card p-2.5 sm:p-3 transition-colors rounded-lg overflow-hidden',
        'hover:bg-white/[0.06] focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 focus:ring-offset-dark-900',
        onClick && 'cursor-pointer'
      )}
      aria-label="Open personal overview details"
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <Avatar
          src={user.avatar}
          name={user.name}
          size="md"
          status={user.status}
          showStatus={true}
          className="flex-shrink-0"
        />
        <div className="flex-1 min-w-0 overflow-hidden">
          <div className="flex items-center gap-1.5 flex-wrap">
            <h2 className="text-sm font-semibold text-app-text truncate max-w-full">{user.name}</h2>
            <Badge
              variant={user.role === 'admin' ? 'red' : user.role === 'manager' ? 'purple' : 'blue'}
              className="flex-shrink-0 text-[10px] px-1.5 py-0"
            >
              {user.role}
            </Badge>
            <Badge variant="default" className="text-[10px] flex-shrink-0 px-1.5 py-0">
              L{user.level}
            </Badge>
          </div>
          <p className="text-app-muted text-[11px] truncate leading-tight mt-0.5">
            {[user.jobTitle, user.department].filter(Boolean).join(' · ') || '—'}
          </p>
          {/* Single compact stat row */}
          <div className="flex items-center gap-2 mt-1.5 pt-1.5 border-t border-white/10">
            <span className="flex items-center gap-0.5 text-[10px] text-app-muted">
              <Briefcase className="w-3 h-3 text-primary-400" />
              <span className="font-medium text-app-text">{user.stats?.projectsContributed ?? 0}</span>
            </span>
            <span className="flex items-center gap-0.5 text-[10px] text-app-muted">
              <ListTodo className="w-3 h-3 text-accent-400" />
              <span className="font-medium text-app-text">{user.stats?.tasksCompleted ?? 0}</span>
            </span>
            <span className="flex items-center gap-0.5 text-[10px] text-app-muted">
              <Award className="w-3 h-3 text-warning-500" />
              <span className="font-medium text-app-text">{user.badges?.length ?? 0}</span>
            </span>
            {onClick && (
              <span className="ml-auto text-[10px] text-app-muted flex items-center gap-0.5 shrink-0">
                Details
                <ChevronRight className="w-3 h-3" />
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}
