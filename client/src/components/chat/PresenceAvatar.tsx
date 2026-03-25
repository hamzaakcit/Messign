import type { User } from '@/types';
import { Avatar } from '@/components/ui';
import { cn } from '@/lib/utils';

interface PresenceAvatarProps {
  user: User;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
  showStatusText?: boolean;
}

const STATUS_COLORS: Record<string, string> = {
  online: 'bg-green-500',
  away: 'bg-yellow-500',
  busy: 'bg-red-500',
  deep_work: 'bg-amber-500 animate-pulse',
  offline: 'bg-gray-500',
};

const STATUS_LABELS: Record<string, string> = {
  online: 'Online',
  away: 'Away',
  busy: 'Busy',
  deep_work: 'Deep Work',
  offline: 'Offline',
};

const SIZE_MAP = {
  xs: { avatar: 'sm' as const, dot: 'w-2 h-2', offset: '-bottom-0 -right-0' },
  sm: { avatar: 'sm' as const, dot: 'w-2.5 h-2.5', offset: '-bottom-0.5 -right-0.5' },
  md: { avatar: 'md' as const, dot: 'w-3 h-3', offset: '-bottom-0.5 -right-0.5' },
  lg: { avatar: 'lg' as const, dot: 'w-3.5 h-3.5', offset: '-bottom-0.5 -right-0.5' },
};

export function PresenceAvatar({ user, size = 'md', className, showStatusText }: PresenceAvatarProps) {
  const sizeConfig = SIZE_MAP[size];
  const statusColor = STATUS_COLORS[user.status ?? 'offline'] ?? STATUS_COLORS.offline;
  const statusLabel = STATUS_LABELS[user.status ?? 'offline'] ?? 'Offline';

  return (
    <div className={cn('relative inline-flex group', className)}>
      <Avatar
        src={user.avatar}
        name={user.name}
        size={sizeConfig.avatar}
        showStatus={false}
      />
      <span
        className={cn(
          'absolute rounded-full border-2 border-app-bg',
          sizeConfig.dot,
          sizeConfig.offset,
          statusColor,
        )}
        title={statusLabel}
      />
      {showStatusText && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 rounded-md bg-app-sidebar border border-app shadow-lg text-[11px] text-app whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
          {statusLabel}
          {user.status === 'deep_work' && (
            <span className="block text-[10px] text-amber-400">Do not disturb</span>
          )}
        </div>
      )}
    </div>
  );
}
