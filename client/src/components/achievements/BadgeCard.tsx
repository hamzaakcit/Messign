import type { LucideIcon } from 'lucide-react';
import { Lock, Star } from 'lucide-react';
import type { Badge as BadgeType } from '@/types';
import { getRarityTheme, type RarityKey } from '@/lib/badgeRarity';
import { formatRelativeTime } from '@/lib/utils';
import { ProgressBar } from '@/components/ui';
import { cn } from '@/lib/utils';

export interface BadgeCardProps {
  badge: BadgeType;
  icon: LucideIcon;
  isEarned: boolean;
  onClick: (badge: BadgeType) => void;
  isNew?: boolean;
  index?: number;
  progress?: { current: number; total: number };
}

export function BadgeCard({
  badge,
  icon: Icon,
  isEarned,
  onClick,
  isNew,
  index = 0,
  progress,
}: BadgeCardProps) {
  const rarity = (badge.rarity?.toLowerCase() || 'common') as RarityKey;
  const theme = getRarityTheme(rarity);

  const earnedDate = badge.unlockedAt ?? (isEarned && badge.holders?.length ? null : null);
  const displayDate = earnedDate ? formatRelativeTime(earnedDate) : null;

  const cardStyle = isEarned
    ? {
        background: `linear-gradient(135deg, ${theme.rgb.r}22, ${theme.rgb.g}22, ${theme.rgb.b}22 40%, rgba(15,15,20,0.95) 100%)`,
        borderColor: `rgba(${theme.rgb.r}, ${theme.rgb.g}, ${theme.rgb.b}, 0.4)`,
        boxShadow: `0 8px 32px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.1) inset, 0 0 48px ${theme.glow}`,
      }
    : {
        background: 'linear-gradient(135deg, rgba(30, 30, 30, 0.8), rgba(20, 20, 20, 0.9))',
        borderColor: 'rgba(255,255,255,0.1)',
        boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
      };

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={() => onClick(badge)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick(badge);
        }
      }}
      aria-label={`${badge.name}, ${badge.rarity}${isEarned ? ', earned' : ', locked'}. Click for details`}
      className={cn(
        'group relative w-full min-h-[320px] max-w-[280px] mx-auto rounded-[20px] overflow-hidden',
        'flex flex-col items-center text-center cursor-pointer',
        'transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]',
        'focus:outline-none focus-visible:ring-3 focus-visible:ring-offset-2 focus-visible:ring-offset-dark-900',
        'animate-badge-card-enter',
        isEarned
          ? 'hover:scale-105 hover:-translate-y-2 hover:rotate-[2deg]'
          : 'hover:scale-[1.02] hover:-translate-y-1 opacity-40 grayscale'
      )}
      style={{
        animationDelay: `${index * 100}ms`,
        borderWidth: isEarned ? 2 : 1,
        borderStyle: 'solid',
        ...cardStyle,
      }}
      data-earned={isEarned}
      data-rarity={rarity}
    >
      {/* Shine overlay (earned only) */}
      {isEarned && (
        <div
          className="absolute inset-0 pointer-events-none overflow-hidden"
          aria-hidden
        >
          <div
            className="absolute -inset-[100%] bg-gradient-to-br from-transparent via-white/15 to-transparent animate-badge-shine"
            style={{ transform: 'rotate(30deg)' }}
          />
          <div
            className="absolute inset-0 opacity-40"
            style={{
              background: `radial-gradient(circle at 50% 30%, rgba(${theme.rgb.r}, ${theme.rgb.g}, ${theme.rgb.b}, 0.3), transparent 70%)`,
            }}
          />
        </div>
      )}

      {/* Corner badge (NEW!) */}
      {isNew && isEarned && (
        <div
          className="absolute top-3 right-3 z-10 flex items-center justify-center w-8 h-8 rounded-full text-amber-400"
          style={{
            background: 'rgba(251, 191, 36, 0.25)',
            boxShadow: '0 0 16px rgba(251, 191, 36, 0.5)',
          }}
          aria-hidden
        >
          <Star className="w-4 h-4 fill-current" />
        </div>
      )}

      {/* Icon section */}
      <div
        className={cn(
          'relative mt-8 w-24 h-24 rounded-full flex items-center justify-center shrink-0',
          'transition-transform duration-300 ease-out',
          'group-hover:scale-110'
        )}
        style={
          isEarned
            ? {
                background: `radial-gradient(circle, rgba(${theme.rgb.r}, ${theme.rgb.g}, ${theme.rgb.b}, 0.3), rgba(${theme.rgb.r}, ${theme.rgb.g}, ${theme.rgb.b}, 0.1))`,
                border: `3px solid rgba(${theme.rgb.r}, ${theme.rgb.g}, ${theme.rgb.b}, 0.6)`,
                boxShadow: `0 0 32px ${theme.glow}`,
              }
            : {
                background: 'rgba(40,40,40,0.8)',
                border: '1px solid rgba(255,255,255,0.1)',
              }
        }
      >
        {isEarned ? (
          <Icon
            className="w-12 h-12 text-app-text transition-transform duration-300 group-hover:scale-110 group-hover:rotate-12"
            style={{ filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.3))' }}
            strokeWidth={2}
            aria-hidden
          />
        ) : (
          <>
            <Lock className="absolute w-8 h-8 text-app-text/60 z-10" aria-hidden />
            <Icon className="w-10 h-10 text-app-text/30" strokeWidth={1.5} aria-hidden />
          </>
        )}
      </div>

      {/* Badge name */}
      <h3
        className="mt-5 px-4 text-xl font-bold text-app-text leading-tight tracking-tight"
        style={{ textShadow: '0 2px 8px rgba(0,0,0,0.3)', letterSpacing: '-0.02em' }}
      >
        {badge.name}
      </h3>

      {/* Rarity label or unlock hint */}
      <div className="mt-2 px-4">
        {isEarned ? (
          <span
            className="inline-block px-4 py-1 text-[13px] font-medium uppercase tracking-widest rounded-full"
            style={{
              color: theme.primary,
              background: `rgba(${theme.rgb.r}, ${theme.rgb.g}, ${theme.rgb.b}, 0.15)`,
              boxShadow: `0 0 12px ${theme.glow}`,
            }}
          >
            {badge.rarity}
          </span>
        ) : (
          <span className="text-xs text-app-text/50 px-3 py-2 line-clamp-2">
            {badge.criteria ?? 'Complete criteria to unlock'}
          </span>
        )}
      </div>

      {/* Earned date (earned) or progress bar (locked) */}
      <div className="mt-auto pb-4 w-full px-4">
        {isEarned && displayDate && (
          <p className="text-[12px] text-app-text/50">Earned {displayDate}</p>
        )}
        {!isEarned && progress && progress.total > 0 && (
          <div className="rounded-lg bg-black/30 p-3 mt-2">
            <p className="text-xs text-app-text/60 mb-1">
              {progress.current} / {progress.total} completed
            </p>
            <ProgressBar
              value={(progress.current / progress.total) * 100}
              max={100}
              variant="default"
              size="sm"
            />
          </div>
        )}
      </div>
    </article>
  );
}
