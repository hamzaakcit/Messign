import { Calendar, Users, ExternalLink } from 'lucide-react';
import type { MarketplaceProject } from '@/lib/api';
import { Button } from '@/components/ui';
import { cn } from '@/lib/utils';
import { getDaysUntil, formatDate } from './types';

/**
 * MSPD card (tier 1): visually dominant. Left accent, fixed badge outside content flow.
 * Gold/amber only. Taller. Title / Meta / Action sections. No text overlap.
 */
export function MSPDCard({
  project,
  onApply,
  onViewDetails,
  onGoToWorkspace,
  appliedOptimistic,
  applyingId,
}: {
  project: MarketplaceProject;
  onApply: () => void;
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
  const reward = project.xp_reward ?? 0;
  const currency = project.reward_currency === 'MSP' ? 'MSP' : 'MP';

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onViewDetails(project)}
      onKeyDown={(e) => e.key === 'Enter' && onViewDetails(project)}
      className={cn(
        'flex min-h-[200px] rounded-lg cursor-pointer transition-all overflow-hidden',
        'bg-gray-900 dark:bg-gray-950 border border-amber-500/40 shadow-[0_0_20px_rgba(234,179,8,0.08)]',
        'hover:border-amber-500/70 hover:shadow-[0_0_24px_rgba(234,179,8,0.12)]'
      )}
      aria-label={`MSPD: ${project.name}`}
    >
      {/* Left accent + fixed MSPD badge (outside content flow) */}
      <div className="flex flex-col shrink-0 w-10 border-r border-amber-500/30 bg-amber-500/5 items-center justify-start pt-2">
        <span className="text-amber-400 text-[9px] font-bold uppercase tracking-widest -rotate-90 origin-center whitespace-nowrap mt-4">
          MSPD
        </span>
      </div>

      <div className="flex flex-col flex-1 min-w-0 p-3">
        {/* Title section: single line, tooltip */}
        <h3 className="font-semibold text-app text-sm line-clamp-1 mb-1" title={project.name}>
          {project.name}
        </h3>
        <p className="text-xs text-amber-200/70 line-clamp-2 mb-3 flex-1 min-h-0">
          {project.description}
        </p>

        {/* Meta section: icons only (time, apps, status) */}
        <div className="flex items-center gap-3 text-[10px] text-amber-200/60 border-t border-amber-500/20 pt-2 mt-auto">
          <span className="flex items-center gap-1" title="Applications">
            <Users className="w-3 h-3 shrink-0" />
            {project.application_count}
          </span>
          {project.due_date && (
            <span
              className={cn('flex items-center gap-1', daysLeft != null && daysLeft <= 7 && 'text-amber-400')}
              title={formatDate(project.due_date)}
            >
              <Calendar className="w-3 h-3 shrink-0" />
              {daysLeft != null ? `${daysLeft}d` : 'Due'}
            </span>
          )}
          {reward > 0 && (
            <span className="flex items-center gap-0.5 text-amber-400 font-medium" title="Reward">
              🪙 {reward} {currency}
            </span>
          )}
          {hasApplied && !isApproved && (
            <span className={cn('font-medium', userStatus === 'rejected' ? 'text-red-400' : 'text-amber-400')}>
              {userStatus === 'rejected' ? 'Rejected' : 'Applied'}
            </span>
          )}
        </div>

        {/* Action section */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-amber-500/10" onClick={(e) => e.stopPropagation()}>
          {isApproved && (
            <Button
              type="button"
              size="sm"
              variant="primary"
              className="gap-1 bg-amber-600 hover:bg-amber-500 text-amber-950 text-xs h-7"
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
              disabled={applyingId === project.id}
              className="bg-amber-600 hover:bg-amber-500 text-amber-950 text-xs h-7"
              onClick={() => onApply()}
            >
              {applyingId === project.id ? '…' : 'Join'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
