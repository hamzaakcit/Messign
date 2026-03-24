import type { LucideIcon } from 'lucide-react';
import { Inbox } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  actionLabel,
  onAction,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center py-16 px-6 text-center',
        className
      )}
    >
      <div className="w-16 h-16 rounded-full bg-app-card border border-app-border flex items-center justify-center mb-4">
        <Icon className="w-8 h-8 text-app-muted" />
      </div>
      <h3 className="text-lg font-semibold text-app-text">{title}</h3>
      {description && (
        <p className="mt-2 text-sm text-app-muted max-w-sm">{description}</p>
      )}
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="mt-4 px-4 py-2 text-sm font-medium rounded-lg bg-primary-500 text-app-text hover:bg-primary-600 transition-colors"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
