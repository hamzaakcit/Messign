import { Zap, Tag, ExternalLink } from 'lucide-react';
import type { MarketplaceProject } from '@/lib/api';
import { Button } from '@/components/ui';
import { cn } from '@/lib/utils';
import { getDeptColor, getDaysUntil, formatDate } from './types';

export function MarketplaceListRow({
  project,
  onApply,
  onViewDetails,
  onGoToWorkspace,
  appliedOptimistic,
  applyingId,
}: {
  project: MarketplaceProject;
  onApply: (id: string) => void;
  onViewDetails: (p: MarketplaceProject) => void;
  onGoToWorkspace: (p: MarketplaceProject) => void;
  appliedOptimistic: Set<string>;
  applyingId: string | null;
}) {
  const status = project.recruitment_status;
  const isRecruiting = status === 'recruiting' || status === undefined;
  const userStatus = appliedOptimistic.has(project.id) ? 'pending' : project.user_application_status;
  const hasApplied = userStatus === 'pending' || userStatus === 'approved' || userStatus === 'rejected';
  const isApproved = userStatus === 'approved';
  const daysLeft = getDaysUntil(project.due_date);
  const config = Array.isArray(project.recruitment_config) ? project.recruitment_config : [];

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onViewDetails(project)}
      onKeyDown={(e) => e.key === 'Enter' && onViewDetails(project)}
      className={cn(
        'grid grid-cols-[1fr_auto_auto_auto_auto_auto] gap-4 items-center py-3 px-4 rounded-lg border-2 border-green-600/25 bg-app-card cursor-pointer transition-all shadow-[0_0_20px_rgba(34,197,94,0.08)] hover:border-green-500/45 hover:shadow-[0_0_28px_rgba(34,197,94,0.2)]',
        isRecruiting && 'border-green-600/35'
      )}
      aria-label={`View details for ${project.name}`}
    >
      <div className="min-w-0">
        <h3 className="font-semibold text-app truncate">{project.name}</h3>
        {Array.isArray(project.tags) && project.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {project.tags.slice(0, 3).map((t) => (
              <span key={t} className="inline-flex items-center gap-0.5 text-xs text-app-muted">
                <Tag className="w-3 h-3" />#{t}
              </span>
            ))}
          </div>
        )}
      </div>
      <span
        className="px-2 py-0.5 rounded text-xs font-medium capitalize shrink-0"
        style={{
          backgroundColor: getDeptColor(project.type).bg,
          color: getDeptColor(project.type).text,
        }}
      >
        {project.type}
      </span>
      <div className="flex gap-0.5 shrink-0">
        {config.length > 0 ? (
          config.slice(0, 5).map((slot, idx) => (
            <span
              key={idx}
              className={cn(
                'w-6 h-6 rounded-full border-2 inline-flex items-center justify-center text-xs',
                slot.filled < slot.count ? 'border-dashed border-app-border bg-app-surface-tertiary' : 'border-solid'
              )}
              style={slot.filled < slot.count ? undefined : { backgroundColor: getDeptColor(slot.dept).bg, borderColor: getDeptColor(slot.dept).border }}
              title={`${slot.dept}: ${slot.filled}/${slot.count}`}
            >
              {slot.filled < slot.count ? '+' : ''}
            </span>
          ))
        ) : (
          <span className="text-xs text-app-muted">—</span>
        )}
      </div>
      <span className="inline-flex items-center gap-1 text-blue-400 text-sm font-medium shrink-0">
        {project.xp_reward > 0 ? <><Zap className="w-3.5 h-3.5" /> +{project.xp_reward} MP</> : '—'}
      </span>
      <span className={cn('text-sm shrink-0', daysLeft != null && daysLeft <= 7 && 'text-red-400')}>
        {project.due_date ? (daysLeft != null ? `⏳ ${daysLeft}d` : formatDate(project.due_date)) : '—'}
      </span>
      <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
        {isApproved && (
          <Button
            type="button"
            size="sm"
            variant="primary"
            className="gap-1.5 bg-green-600 hover:bg-green-500"
            onClick={() => onGoToWorkspace(project)}
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Go to Workspace
          </Button>
        )}
        {isRecruiting && !hasApplied && (
          <Button
            type="button"
            size="sm"
            variant="primary"
            disabled={applyingId === project.id}
            onClick={() => onApply(project.id)}
          >
            {applyingId === project.id ? 'Applying…' : 'Join'}
          </Button>
        )}
        {isRecruiting && hasApplied && !isApproved && (
          <span className="text-xs text-amber-400 font-medium">Applied</span>
        )}
      </div>
    </div>
  );
}
