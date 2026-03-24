import { useEffect, useCallback } from 'react';
import type { LucideIcon } from 'lucide-react';
import { X, Share2, Zap } from 'lucide-react';
import type { Badge as BadgeType } from '@/types';
import { getRarityTheme, RARITY_XP, type RarityKey } from '@/lib/badgeRarity';
import { formatDate } from '@/lib/utils';
import { Avatar } from '@/components/ui';
import { cn } from '@/lib/utils';

export interface BadgeDetailModalProps {
  badge: BadgeType | null;
  icon: LucideIcon;
  isEarned: boolean;
  onClose: () => void;
  holderUsers?: { id: string; name: string; avatar: string }[];
}

export function BadgeDetailModal({
  badge,
  icon: Icon,
  isEarned,
  onClose,
  holderUsers = [],
}: BadgeDetailModalProps) {
  const handleEscape = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose]
  );

  useEffect(() => {
    if (badge) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [badge, handleEscape]);

  if (!badge) return null;

  const rarity = (badge.rarity?.toLowerCase() || 'common') as RarityKey;
  const theme = getRarityTheme(rarity);
  const xpReward = RARITY_XP[rarity];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="badge-detail-title"
      onClick={onClose}
    >
      <div
        className={cn(
          'relative w-full max-w-md rounded-2xl overflow-hidden',
          'border-2 shadow-2xl',
          'animate-[badgeCardEnter_0.4s_cubic-bezier(0.34,1.56,0.64,1)_forwards]'
        )}
        style={{
          background: `linear-gradient(135deg, rgba(${theme.rgb.r},${theme.rgb.g},${theme.rgb.b},0.2) 0%, rgba(20,20,28,0.98) 50%)`,
          borderColor: `rgba(${theme.rgb.r}, ${theme.rgb.g}, ${theme.rgb.b}, 0.5)`,
          boxShadow: `0 20px 60px rgba(0,0,0,0.5), 0 0 80px ${theme.glow}`,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 z-10 p-2 rounded-xl text-app-text/70 hover:text-app-text hover:bg-app-hover transition-colors"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="p-8 pt-12 flex flex-col items-center text-center">
          {/* Large icon */}
          <div
            className="w-32 h-32 rounded-full flex items-center justify-center mb-6"
            style={{
              background: `radial-gradient(circle, rgba(${theme.rgb.r},${theme.rgb.g},${theme.rgb.b},0.35), rgba(${theme.rgb.r},${theme.rgb.g},${theme.rgb.b},0.1))`,
              border: `3px solid rgba(${theme.rgb.r}, ${theme.rgb.g}, ${theme.rgb.b}, 0.6)`,
              boxShadow: `0 0 48px ${theme.glow}`,
            }}
          >
            <Icon className="w-16 h-16 text-app-text" strokeWidth={2} />
          </div>

          <h2 id="badge-detail-title" className="text-2xl font-bold text-app-text mb-2">
            {badge.name}
          </h2>
          <span
            className="inline-block px-4 py-1.5 text-sm font-semibold uppercase tracking-wider rounded-full mb-4"
            style={{
              color: theme.primary,
              background: `rgba(${theme.rgb.r}, ${theme.rgb.g}, ${theme.rgb.b}, 0.2)`,
              boxShadow: `0 0 16px ${theme.glow}`,
            }}
          >
            {badge.rarity}
          </span>

          <p className="text-app-text/80 text-sm leading-relaxed mb-4 max-w-sm">
            {badge.description}
          </p>

          {isEarned && badge.unlockedAt && (
            <p className="text-app-text/50 text-sm mb-4">
              Earned {formatDate(badge.unlockedAt)}
            </p>
          )}

          <div className="flex items-center justify-center gap-2 text-amber-400 font-semibold mb-6">
            <Zap className="w-5 h-5" />
            <span>+{xpReward} MP</span>
          </div>

          {holderUsers.length > 0 && (
            <div className="w-full border-t border-app-border pt-4">
              <p className="text-xs text-app-text/50 uppercase tracking-wider mb-3">
                {holderUsers.length} {holderUsers.length === 1 ? 'holder' : 'holders'}
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {holderUsers.slice(0, 8).map((u) => (
                  <Avatar
                    key={u.id}
                    src={u.avatar}
                    name={u.name}
                    size="sm"
                    showStatus={false}
                    className="ring-2 ring-dark-700"
                  />
                ))}
                {holderUsers.length > 8 && (
                  <span className="text-xs text-app-text/50 self-center">
                    +{holderUsers.length - 8}
                  </span>
                )}
              </div>
            </div>
          )}

          <button
            type="button"
            className="mt-6 flex items-center gap-2 px-5 py-2.5 rounded-xl bg-app-surface-tertiary hover:bg-app-hover text-app-text text-sm font-medium transition-colors border border-app-border-strong"
            onClick={() => {
              if (navigator.share && badge) {
                navigator.share({
                  title: badge.name,
                  text: `I earned the ${badge.name} badge!`,
                }).catch(() => {});
              }
            }}
          >
            <Share2 className="w-4 h-4" />
            Share
          </button>
        </div>
      </div>
    </div>
  );
}
