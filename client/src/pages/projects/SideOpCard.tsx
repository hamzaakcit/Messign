import { Users, Zap, Clock } from 'lucide-react';
import type { MarketplaceProject } from '@/lib/api';
import { Button } from '@/components/ui';
import type { SideOpItem } from './types';

/**
 * Side Op card (tier 3): lighter, optional. Dashed outline, smaller type, no primary CTA.
 * Neutral label (no amber—reserved for MSPD). Title / Meta / Action; link-style action only.
 */
export function SideOpCard({
  item,
  onClaim,
  onApply,
  onViewDetails,
  claimingId,
  applyingId,
  hasApplied,
}: {
  item: SideOpItem | (MarketplaceProject & { estimated_minutes?: number | null });
  onClaim?: (id: string) => void;
  onApply?: () => void;
  onViewDetails?: () => void;
  claimingId: string | null;
  applyingId?: string | null;
  hasApplied?: boolean;
}) {
  const isBounty = 'title' in item;
  const id = item.id;
  const name = isBounty ? item.title : item.name;
  const description = isBounty ? item.description : item.description;
  const reward = item.xp_reward ?? 0;
  const estMins = isBounty ? item.estimated_minutes : (item as MarketplaceProject & { estimated_minutes?: number | null }).estimated_minutes;
  const estTime = estMins != null ? (estMins < 60 ? `${estMins}m` : `${Math.floor(estMins / 60)}h`) : '—';
  const canClaimBounty = isBounty && (item as SideOpItem).status === 'OPEN' && onClaim;
  const status = !isBounty ? (item as MarketplaceProject).recruitment_status : undefined;
  const isProjectRecruiting = !isBounty && (status === 'recruiting' || status === undefined);
  const canJoinProject = !isBounty && onApply && !hasApplied && isProjectRecruiting;
  const showJoin = canClaimBounty || canJoinProject;
  const itemTags = Array.isArray((item as { tags?: string[] }).tags) ? (item as { tags: string[] }).tags : [];

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onViewDetails}
      onKeyDown={(e) => e.key === 'Enter' && onViewDetails?.()}
      className="flex flex-col min-h-[160px] rounded-lg border-2 border-blue-500/40 bg-app-card p-3 cursor-pointer transition-all shadow-[0_0_20px_rgba(59,130,246,0.08)] hover:border-blue-500/60 hover:shadow-[0_0_24px_rgba(59,130,246,0.12)]"
      aria-label={`Side op: ${name}`}
    >
      <h3 className="font-semibold text-app text-sm line-clamp-1 mb-0.5" title={name}>
        {name}
      </h3>
      <p className="text-xs text-app-muted line-clamp-2 mb-2 flex-1 min-h-0">{description}</p>
      {itemTags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {itemTags.slice(0, 2).map((t) => (
            <span key={t} className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded bg-app-surface-tertiary text-app-muted text-[10px]">
              #{t}
            </span>
          ))}
        </div>
      )}

      {/* Meta: same layout as MarketplaceCard */}
      <div className="flex items-center gap-3 text-[10px] text-app-muted border-t border-app-border pt-2 mt-auto">
        <span className="flex items-center gap-1" title="Participants">
          <Users className="w-3 h-3 shrink-0" />
          0
        </span>
        <span className="flex items-center gap-1" title="Est. time">
          <Clock className="w-3 h-3 shrink-0" />
          {estTime}
        </span>
        {reward > 0 && (
          <span className="flex items-center gap-0.5 text-blue-400" title="Reward">
            <Zap className="w-3 h-3 shrink-0" />
            +{reward} MP
          </span>
        )}
      </div>

      {/* Action: same layout as MarketplaceCard — primary button + View */}
      <div className="flex items-center justify-end gap-2 pt-2 border-t border-app-border" onClick={(e) => e.stopPropagation()}>
        {showJoin && (
          <Button
            type="button"
            size="sm"
            variant="primary"
            className="text-xs h-7"
            disabled={claimingId === id || applyingId === id}
            onClick={() => {
              if (canClaimBounty && onClaim) onClaim(id);
              else if (canJoinProject && onApply) onApply();
            }}
          >
            {claimingId === id || applyingId === id ? '…' : 'Join'}
          </Button>
        )}
        {hasApplied && !isBounty && (
          <span className="text-[10px] text-blue-400 font-medium">Applied</span>
        )}
        <span className="text-[10px] text-primary-400 font-medium">View</span>
      </div>
    </div>
  );
}
