import { cn, getInitials, getStatusColor } from '@/lib/utils';

interface AvatarProps {
  src?: string;
  name?: string | null;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  status?: 'online' | 'away' | 'busy' | 'offline';
  showStatus?: boolean;
  className?: string;
}

export function Avatar({ src, name, size = 'md', status, showStatus = true, className }: AvatarProps) {
  const sizes = {
    xs: 'w-6 h-6 text-xs',
    sm: 'w-8 h-8 text-sm',
    md: 'w-10 h-10 text-sm',
    lg: 'w-12 h-12 text-base',
    xl: 'w-16 h-16 text-lg',
  };

  const statusSizes = {
    xs: 'w-2 h-2',
    sm: 'w-2.5 h-2.5',
    md: 'w-3 h-3',
    lg: 'w-3.5 h-3.5',
    xl: 'w-4 h-4',
  };

  const pixelSizes: Record<typeof size, number> = {
    xs: 24,
    sm: 32,
    md: 40,
    lg: 48,
    xl: 64,
  };
  const px = pixelSizes[size];

  return (
    <div className={cn('relative inline-block', className)}>
      {src ? (
        <img
          src={src}
          alt={name ?? ''}
          width={px}
          height={px}
          loading="lazy"
          className={cn(
            'rounded-full object-cover bg-app-hover',
            sizes[size]
          )}
        />
      ) : (
        <div
          className={cn(
            'rounded-full bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center font-semibold text-app-text',
            sizes[size]
          )}
        >
          {getInitials(name)}
        </div>
      )}
      {showStatus && status && (
        <span
          className={cn(
            'absolute bottom-0 right-0 rounded-full ring-2 ring-dark-900',
            statusSizes[size],
            getStatusColor(status)
          )}
        />
      )}
    </div>
  );
}
