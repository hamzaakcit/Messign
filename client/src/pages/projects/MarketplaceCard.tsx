import { Calendar, Users, Zap, ExternalLink } from 'lucide-react';
import type { MarketplaceProject } from '@/lib/api';
import { Button } from '@/components/ui';
import { cn } from '@/lib/utils';
import { getDaysUntil, formatDate } from './types';

/**
 * Standard project card (tier 2): neutral, consistent height. Thin top border by department color.
 * Title / Meta / Action. No amber (reserved for MSPD).
 */
export function MarketplaceCard({
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
  const projectTags = Array.isArray(project.tags) ? project.tags : [];

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onViewDetails(project)}
      onKeyDown={(e) => e.key === 'Enter' && onViewDetails(project)}
      className={cn(
        'flex flex-col min-h-[160px] rounded-lg border-2 border-green-600/25 p-3 bg-app-card transition-all cursor-pointer shadow-[0_0_20px_rgba(34,197,94,0.08)] hover:border-green-500/45 hover:shadow-[0_0_28px_rgba(34,197,94,0.2)]',
        isRecruiting && 'border-green-600/35'
      )}
      aria-label={`View details for ${project.name}`}
    >
      <h3 className="font-semibold text-app text-sm line-clamp-1 mb-0.5" title={project.name}>
        {project.name}
      </h3>
      <p className="text-xs text-app-muted line-clamp-2 mb-2 flex-1 min-h-0">{project.description}</p>
      {projectTags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {projectTags.slice(0, 2).map((t) => (
            <span key={t} className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded bg-app-surface-tertiary text-app-muted text-[10px]">
              #{t}
            </span>
          ))}
        </div>
      )}

      {/* Meta: icons only */}
      <div className="flex items-center gap-3 text-[10px] text-app-muted border-t border-app-border pt-2 mt-auto">
        <span className="flex items-center gap-1" title="Applications">
          <Users className="w-3 h-3 shrink-0" />
          {project.application_count}
        </span>
        {project.due_date && (
          <span
            className={cn('flex items-center gap-1', daysLeft != null && daysLeft <= 7 && 'text-red-400')}
            title={formatDate(project.due_date)}
          >
            <Calendar className="w-3 h-3 shrink-0" />
            {daysLeft != null ? `${daysLeft}d` : 'Due'}
          </span>
        )}
        {project.xp_reward > 0 && (
          <span className="flex items-center gap-0.5 text-blue-400" title="Reward">
            <Zap className="w-3 h-3 shrink-0" />
            +{project.xp_reward} MP
          </span>
        )}
        {!isRecruiting && <span title="Progress">{project.progress}%</span>}
        {hasApplied && !isApproved && (
          <span className={cn('font-medium', userStatus === 'rejected' ? 'text-red-400' : 'text-blue-400')}>
            {userStatus === 'rejected' ? 'Rejected' : 'Applied'}
          </span>
        )}
      </div>

      {/* Action */}
      <div className="flex items-center justify-end gap-2 pt-2 border-t border-app-border" onClick={(e) => e.stopPropagation()}>
        {isApproved && (
          <Button
            type="button"
            size="sm"
            variant="primary"
            className="gap-1 bg-green-600 hover:bg-green-500 text-xs h-7"
            onClick={() => onGoToWorkspace(project)}
          >
            <ExternalLink className="w-3 h-3" />
            Workspace
          </Button>
        )}
        {isRecruiting && !hasApplied && (
          <Button
            type="button"
            size="sm"
            variant="primary"
            className="text-xs h-7"
            disabled={applyingId === project.id}
            onClick={() => onApply(project.id)}
          >
            {applyingId === project.id ? '…' : 'Join'}
          </Button>
        )}
        {isRecruiting && hasApplied && !isApproved && (
          <span className="text-[10px] text-blue-400 font-medium">Applied</span>
        )}
        {!isApproved && <span className="text-[10px] text-primary-400 font-medium">View</span>}
      </div>
    </div>
  );
}
