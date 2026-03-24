import { cn } from '@/lib/utils';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'blue' | 'purple' | 'green' | 'orange' | 'red';
  size?: 'sm' | 'md';
  className?: string;
}

export function Badge({ children, variant = 'default', size = 'sm', className }: BadgeProps) {
  const variants = {
    default: 'bg-app-surface-tertiary text-app-muted border-app-border',
    blue: 'bg-primary-500/20 text-primary-300 border-primary-500/30',
    purple: 'bg-accent-500/20 text-accent-300 border-accent-500/30',
    green: 'bg-success-500/20 text-success-500 border-success-500/30',
    orange: 'bg-warning-500/20 text-warning-500 border-warning-500/30',
    red: 'bg-danger-500/20 text-danger-500 border-danger-500/30',
  };

  const sizes = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-2.5 py-1 text-sm',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full font-medium border',
        variants[variant],
        sizes[size],
        className
      )}
    >
      {children}
    </span>
  );
}
