import { useState, useEffect, useCallback, useMemo } from 'react';
import { Calendar, Users, Zap, Tag, ExternalLink, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStore } from '@/stores/authStore';
import { useProjectStore } from '@/stores/projectStore';
import { projectsAPI, bountiesAPI, type MarketplaceProject, type RecruitmentSlot } from '@/lib/api';
import { Button, Modal } from '@/components/ui';
import { Tabs, TabsContent } from '@/components/ui';
import { MarketplaceNavBar } from '@/components/marketplace';
import { TaskBoard } from '@/components/projects/TaskBoard';
import { ProposeProjectModal } from '@/components/projects/ProposeProjectModal';
import { cn } from '@/lib/utils';

/** Side op from bounties API (display in Opportunity Hub) */
interface SideOpItem {
  id: string;
  title: string;
  description: string;
  category?: string;
  xp_reward: number;
  estimated_minutes: number;
  status: string;
  creator?: { name?: string };
}

type OpportunityFilter = 'all' | 'projects' | 'side_ops' | 'mspd';

const DEFAULT_DEPT_COLOR = { bg: 'rgba(128, 128, 128, 0.2)', text: '#888', border: '#888' };

const departmentColors: Record<string, { bg: string; text: string; border: string }> = {
  engineering: { bg: 'rgba(99, 179, 237, 0.15)', text: '#63B3ED', border: '#63B3ED' },
  product: { bg: 'rgba(246, 173, 85, 0.15)', text: '#F6AD55', border: '#F6AD55' },
  design: { bg: 'rgba(237, 100, 166, 0.15)', text: '#ED64A6', border: '#ED64A6' },
  marketing: { bg: 'rgba(72, 187, 120, 0.15)', text: '#48BB78', border: '#48BB78' },
  sales: { bg: 'rgba(159, 122, 234, 0.15)', text: '#9F7AEA', border: '#9F7AEA' },
  operations: { bg: 'rgba(237, 137, 54, 0.15)', text: '#ED8936', border: '#ED8936' },
};

function getDeptColor(dept: string) {
  return departmentColors[dept] ?? DEFAULT_DEPT_COLOR;
}

function getDaysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const diff = new Date(dateStr).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Projects with >100 MP or DB is_mspd are shown as MSPD (premium tier). */
function isMspdProject(project: MarketplaceProject): boolean {
  return Boolean(project.is_mspd) || (project.xp_reward ?? 0) > 100;
}

/** Projects with 0 MP or opportunity_type side_op are shown as Side Ops. */
function isSideOpProject(project: MarketplaceProject): boolean {
  return (project.opportunity_type ?? 'project') === 'side_op' || (project.xp_reward ?? 0) === 0;
}

function OpenSlotsVisual({ config, compact }: { config: RecruitmentSlot[]; compact?: boolean }) {
  if (!config?.length) return null;
  const isCompact = compact;
  return (
    <div className={cn('mt-1', isCompact ? 'space-y-1' : 'space-y-2 mt-2')}>
      <div className={cn('flex justify-between text-app-muted', isCompact ? 'text-[10px]' : 'text-xs')}>
        <span>Open</span>
        <span>
          {config.reduce((s, r) => s + r.filled, 0)}/{config.reduce((s, r) => s + r.count, 0)}
        </span>
      </div>
      <div className={cn(isCompact ? 'space-y-0.5' : 'space-y-1.5')}>
        {config.map((slot, idx) => {
          const colors = getDeptColor(slot.dept);
          return (
            <div key={idx} className="flex items-center justify-between gap-1">
              <div className="flex items-center gap-1">
                <span className={cn('rounded-full shrink-0', isCompact ? 'w-1.5 h-1.5' : 'w-2 h-2')} style={{ backgroundColor: colors.text }} />
                <span className={cn('text-app capitalize', isCompact ? 'text-[10px]' : 'text-xs')}>{slot.dept}</span>
              </div>
              <div className="flex gap-0.5">
                {Array.from({ length: slot.count }).map((_, i) => {
                  const filled = i < slot.filled;
                  return (
                    <span
                      key={i}
                      className={cn(
                        'inline-flex rounded-full border-2 items-center justify-center',
                        isCompact ? 'w-4 h-4 text-[10px]' : 'w-6 h-6 text-xs',
                        filled ? 'border-solid' : 'border-dashed border-app-border bg-app-surface-tertiary'
                      )}
                      style={filled ? { backgroundColor: colors.bg, borderColor: colors.border } : undefined}
                      title={`${slot.dept}: ${slot.filled}/${slot.count}`}
                    >
                      {!filled && '+'}
                    </span>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Standard project card (tier 2): neutral, consistent height. Thin top border by department color.
 * Title / Meta / Action. No amber (reserved for MSPD).
 */
function MarketplaceCard({
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

/**
 * Side Op card (tier 3): lighter, optional. Dashed outline, smaller type, no primary CTA.
 * Neutral label (no amber—reserved for MSPD). Title / Meta / Action; link-style action only.
 */
function SideOpCard({
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
  onApply?: (id: string) => void;
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
              else if (canJoinProject && onApply) onApply(id);
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

/**
 * MSPD card (tier 1): visually dominant. Left accent, fixed badge outside content flow.
 * Gold/amber only. Taller. Title / Meta / Action sections. No text overlap.
 */
function MSPDCard({
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
              onClick={() => onApply(project.id)}
            >
              {applyingId === project.id ? '…' : 'Join'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function MarketplaceListRow({
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

export function ProjectsView() {
  const { user } = useAuthStore();
  const { setActiveProject, fetchTasks } = useProjectStore();
  const [marketplaceProjects, setMarketplaceProjects] = useState<MarketplaceProject[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, _setSearchQuery] = useState('');
  const [activeTab, _setActiveTab] = useState<'all' | 'recruiting' | 'active'>('all');
  const [selectedDepartment, setSelectedDepartment] = useState<string>('all');
  const [selectedTag, setSelectedTag] = useState<string>('all');
  const [viewLayout, setViewLayout] = useState<'grid' | 'list'>('grid');
  const [appliedOptimistic, setAppliedOptimistic] = useState<Set<string>>(new Set());
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'marketplace' | 'tasks'>('marketplace');
  const [opportunityFilter, setOpportunityFilter] = useState<OpportunityFilter>('all');
  const [sideOpsList, setSideOpsList] = useState<SideOpItem[]>([]);
  const [claimingBountyId, setClaimingBountyId] = useState<string | null>(null);
  const [showProposeModal, setShowProposeModal] = useState(false);
  const [selectedProject, setSelectedProject] = useState<MarketplaceProject | null>(null);

  const fetchMarketplace = useCallback(async () => {
    if (!user?.id) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await projectsAPI.getMarketplace();
      setMarketplaceProjects(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load projects');
      setMarketplaceProjects([]);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  const fetchSideOps = useCallback(async () => {
    if (!user?.id) return;
    try {
      const data = await bountiesAPI.list({ status: 'OPEN' });
      const list = Array.isArray((data as { bounties?: SideOpItem[] }).bounties)
        ? (data as { bounties: SideOpItem[] }).bounties
        : [];
      setSideOpsList(list);
    } catch {
      setSideOpsList([]);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchMarketplace();
  }, [fetchMarketplace]);

  useEffect(() => {
    if (viewMode === 'marketplace' && user?.id) fetchSideOps();
  }, [viewMode, user?.id, fetchSideOps]);

  const handleGoToWorkspace = useCallback((project: MarketplaceProject) => {
    setViewMode('tasks');
    setActiveProject(project.id);
    fetchTasks(project.id);
  }, [setActiveProject, fetchTasks]);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    marketplaceProjects.forEach((p) => {
      (Array.isArray(p.tags) ? p.tags : []).forEach((t) => set.add(t));
    });
    return [...set].sort();
  }, [marketplaceProjects]);

  /** Launched projects (recruitment_status === 'active') — only their tasks show in the Tasks tab. */
  const activeProjectIds = useMemo(
    () => new Set(marketplaceProjects.filter((p) => p.recruitment_status === 'active').map((p) => p.id)),
    [marketplaceProjects]
  );

  const handleApply = async (projectId: string) => {
    setApplyingId(projectId);
    setAppliedOptimistic((prev) => new Set(prev).add(projectId));
    try {
      await projectsAPI.apply(projectId);
      toast.success('Application submitted');
    } catch (e) {
      setAppliedOptimistic((prev) => {
        const next = new Set(prev);
        next.delete(projectId);
        return next;
      });
      toast.error(e instanceof Error ? e.message : 'Failed to apply');
    } finally {
      setApplyingId(null);
      fetchMarketplace();
    }
  };

  const handleClaimSideOp = async (bountyId: string) => {
    setClaimingBountyId(bountyId);
    try {
      await bountiesAPI.claim(bountyId);
      toast.success('Side op claimed!');
      fetchSideOps();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to claim');
    } finally {
      setClaimingBountyId(null);
    }
  };

  /** Combined opportunities for marketplace: only recruiting (joinable). Active projects move to Tasks tab. Exclude rejected and user-rejected. */
  const combinedOpportunities = useMemo(() => {
    const projects: MarketplaceProject[] = marketplaceProjects.filter(
      (p) =>
        p.recruitment_status !== 'rejected' &&
        p.user_application_status !== 'rejected' &&
        (p.recruitment_status === 'recruiting' || p.recruitment_status === undefined)
    );
    const sideOps: SideOpItem[] = sideOpsList;
    const projectItems: { kind: 'project'; data: MarketplaceProject }[] = projects.map((p) => ({ kind: 'project', data: p }));
    const sideOpItems: { kind: 'side_op'; data: SideOpItem }[] = sideOps.map((b) => ({ kind: 'side_op', data: b }));
    const all: Array<{ kind: 'project'; data: MarketplaceProject } | { kind: 'side_op'; data: SideOpItem }> = [
      ...projectItems.filter((x) => isMspdProject(x.data)),
      ...projectItems.filter((x) => !isMspdProject(x.data) && !isSideOpProject(x.data)),
      ...projectItems.filter((x) => isSideOpProject(x.data)),
      ...sideOpItems,
    ];
    return all;
  }, [marketplaceProjects, sideOpsList]);

  const filteredOpportunities = useMemo(() => {
    const matchesFilter = (item: { kind: 'project'; data: MarketplaceProject } | { kind: 'side_op'; data: SideOpItem }) => {
      if (opportunityFilter === 'all') return true;
      if (opportunityFilter === 'mspd') return item.kind === 'project' && isMspdProject(item.data);
      if (opportunityFilter === 'projects') return item.kind === 'project' && !isMspdProject(item.data) && !isSideOpProject(item.data);
      if (opportunityFilter === 'side_ops') return item.kind === 'side_op' || (item.kind === 'project' && isSideOpProject(item.data));
      return true;
    };
    const matchesDept = (p: MarketplaceProject) =>
      selectedDepartment === 'all' ||
      p.type === selectedDepartment ||
      (Array.isArray(p.recruitment_config) && p.recruitment_config.some((s) => s.dept === selectedDepartment));
    const matchesTag = (p: MarketplaceProject) =>
      selectedTag === 'all' || (Array.isArray(p.tags) && p.tags.includes(selectedTag));
    const matchesSearch = (name: string, desc: string) =>
      name.toLowerCase().includes(searchQuery.toLowerCase()) || desc.toLowerCase().includes(searchQuery.toLowerCase());
    return combinedOpportunities.filter((item) => {
      if (!matchesFilter(item)) return false;
      if (item.kind === 'project') {
        const p = item.data;
        const tabOk = activeTab === 'all' || p.recruitment_status === activeTab;
        return tabOk && matchesDept(p) && matchesTag(p) && matchesSearch(p.name, p.description);
      }
      return matchesSearch(item.data.title ?? item.data.id, item.data.description ?? '');
    });
  }, [combinedOpportunities, opportunityFilter, activeTab, selectedDepartment, selectedTag, searchQuery]);

  if (!user?.id) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-app-muted">
        <p className="text-lg">Sign in to view the project marketplace.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-app-muted">
        <p className="text-lg">Loading marketplace…</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as 'marketplace' | 'tasks')} className="h-full flex flex-col">
        <MarketplaceNavBar
          activeTab={viewMode === 'marketplace' ? 'opportunity-hub' : 'tasks'}
          activeFilter={opportunityFilter}
          viewMode={viewLayout}
          onTabChange={(tab) => setViewMode(tab === 'opportunity-hub' ? 'marketplace' : 'tasks')}
          onFilterChange={setOpportunityFilter}
          onViewModeChange={setViewLayout}
          onPropose={() => setShowProposeModal(true)}
          initialFilterOptions={{
            department: selectedDepartment === 'all' ? '' : selectedDepartment,
            skill: selectedTag === 'all' ? '' : selectedTag,
          }}
          skillOptions={allTags}
          onAdvancedFiltersChange={(opts) => {
            setSelectedDepartment(opts.department || 'all');
            setSelectedTag(opts.skill || 'all');
          }}
        />

        <TabsContent value="marketplace" className="flex-1 overflow-auto p-4">
          {error && (
            <p className="text-amber-400 mb-4">{error}</p>
          )}
          {viewLayout === 'grid' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {filteredOpportunities.map((item) => {
                if (item.kind === 'project') {
                  const project = item.data;
                  if (isMspdProject(project)) {
                    return (
                      <MSPDCard
                        key={`mspd-${project.id}`}
                        project={project}
                        onApply={handleApply}
                        onViewDetails={setSelectedProject}
                        onGoToWorkspace={handleGoToWorkspace}
                        appliedOptimistic={appliedOptimistic}
                        applyingId={applyingId}
                      />
                    );
                  }
                  if (isSideOpProject(project)) {
                    const userStatus = appliedOptimistic.has(project.id) ? 'pending' : project.user_application_status;
                    const hasApplied = userStatus === 'pending' || userStatus === 'approved' || userStatus === 'rejected';
                    return (
                      <SideOpCard
                        key={`sideop-${project.id}`}
                        item={project}
                        onApply={handleApply}
                        onViewDetails={() => setSelectedProject(project)}
                        claimingId={null}
                        applyingId={applyingId}
                        hasApplied={hasApplied}
                      />
                    );
                  }
                  return (
                    <MarketplaceCard
                      key={project.id}
                      project={project}
                      onApply={handleApply}
                      onViewDetails={setSelectedProject}
                      onGoToWorkspace={handleGoToWorkspace}
                      appliedOptimistic={appliedOptimistic}
                      applyingId={applyingId}
                    />
                  );
                }
                return (
                  <SideOpCard
                    key={`sideop-${item.data.id}`}
                    item={item.data}
                    onClaim={handleClaimSideOp}
                    onViewDetails={undefined}
                    claimingId={claimingBountyId}
                  />
                );
              })}
            </div>
          ) : (
            <div className="space-y-2">
              <div className="grid grid-cols-[1fr_auto_auto_auto_auto_auto] gap-4 items-center py-2 px-4 text-xs font-medium text-app-muted uppercase tracking-wider">
                <span>Opportunity</span>
                <span>Department</span>
                <span>Slots</span>
                <span>Reward</span>
                <span>Deadline / Est.</span>
                <span>Action</span>
              </div>
              {filteredOpportunities.map((item) => {
                if (item.kind === 'project') {
                  const project = item.data;
                  if (isMspdProject(project)) {
                    return (
                      <div key={`mspd-${project.id}`} className="grid grid-cols-[1fr_auto_auto_auto_auto_auto] gap-4 items-center py-3 px-4 rounded-lg border border-amber-500/40 bg-gray-900/50 dark:bg-gray-950/50 transition-all shadow-[0_0_20px_rgba(234,179,8,0.08)] hover:border-amber-500/70 hover:shadow-[0_0_24px_rgba(234,179,8,0.12)]">
                        <div className="min-w-0">
                          <span className="text-amber-400 text-xs font-bold uppercase mr-2">MSPD</span>
                          <span className="font-semibold text-app">{project.name}</span>
                        </div>
                        <span className="px-2 py-0.5 rounded text-xs capitalize shrink-0" style={{ backgroundColor: getDeptColor(project.type).bg, color: getDeptColor(project.type).text }}>{project.type}</span>
                        <span className="text-xs text-app-muted shrink-0">—</span>
                        <span className="text-amber-400 text-sm shrink-0">🪙 {project.xp_reward} {project.reward_currency === 'MSP' ? 'MSP' : 'MP'}</span>
                        <span className="text-sm text-app-muted shrink-0">{project.due_date ? formatDate(project.due_date) : '—'}</span>
                        <div className="flex gap-2 shrink-0">
                          {project.user_application_status === 'approved' && (
                            <Button size="sm" variant="primary" className="gap-1.5 bg-yellow-600" onClick={() => handleGoToWorkspace(project)}>
                              <ExternalLink className="w-3.5 h-3.5" /> Go to Workspace
                            </Button>
                          )}
                          {(project.recruitment_status === 'recruiting' || project.recruitment_status === undefined) && project.user_application_status !== 'pending' && project.user_application_status !== 'approved' && (
                            <Button size="sm" variant="primary" className="bg-yellow-600" disabled={applyingId === project.id} onClick={() => handleApply(project.id)}>
                              {applyingId === project.id ? 'Applying…' : 'Join'}
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  }
                  if (isSideOpProject(project)) {
                    return (
                      <div key={`sideop-p-${project.id}`} className="grid grid-cols-[1fr_auto_auto_auto_auto_auto] gap-4 items-center py-3 px-4 rounded-lg border-2 border-blue-500/40 bg-app-card/80 transition-all shadow-[0_0_20px_rgba(59,130,246,0.08)] hover:border-blue-500/60 hover:shadow-[0_0_24px_rgba(59,130,246,0.12)]">
                        <div className="min-w-0">
                          <span className="text-amber-400 text-xs font-medium mr-2">Side Op</span>
                          <span className="font-semibold text-app">{project.name}</span>
                        </div>
                        <span className="px-2 py-0.5 rounded text-xs capitalize shrink-0" style={{ backgroundColor: getDeptColor(project.type).bg, color: getDeptColor(project.type).text }}>{project.type}</span>
                        <span className="shrink-0">—</span>
                        <span className="text-app-muted text-sm shrink-0">{project.xp_reward === 0 ? '0 MP' : `+${project.xp_reward} MP`}</span>
                        <span className="text-sm text-app-muted shrink-0">{project.estimated_minutes != null ? (project.estimated_minutes < 60 ? `Est. ${project.estimated_minutes}m` : `Est. ${Math.floor(project.estimated_minutes / 60)}h`) : (project.due_date ? formatDate(project.due_date) : '—')}</span>
                        <div className="shrink-0">
                          <Button size="sm" variant="ghost" className="text-xs" onClick={() => setSelectedProject(project)}>View</Button>
                          {(project.recruitment_status === 'recruiting' || project.recruitment_status === undefined) && project.user_application_status !== 'pending' && project.user_application_status !== 'approved' && (
                            <Button size="sm" variant="primary" className="ml-1 text-xs" disabled={applyingId === project.id} onClick={() => handleApply(project.id)}>
                              {applyingId === project.id ? 'Applying…' : 'Join'}
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  }
                  return (
                    <MarketplaceListRow
                key={project.id}
                project={project}
                      onApply={handleApply}
                      onViewDetails={setSelectedProject}
                      onGoToWorkspace={handleGoToWorkspace}
                      appliedOptimistic={appliedOptimistic}
                      applyingId={applyingId}
                    />
                  );
                }
                const op = item.data;
                return (
                  <div key={`sideop-${op.id}`} className="grid grid-cols-[1fr_auto_auto_auto_auto_auto] gap-4 items-center py-3 px-4 rounded-lg border-2 border-blue-500/40 bg-app-card/80 transition-all shadow-[0_0_20px_rgba(59,130,246,0.08)] hover:border-blue-500/60 hover:shadow-[0_0_24px_rgba(59,130,246,0.12)]">
                    <div className="min-w-0">
                      <span className="text-amber-400 text-xs font-medium mr-2">Side Op</span>
                      <span className="font-semibold text-app">{op.title}</span>
                    </div>
                    <span className="shrink-0">—</span>
                    <span className="shrink-0">—</span>
                    <span className="text-blue-400 text-sm shrink-0">+{op.xp_reward} MP</span>
                    <span className="text-sm text-app-muted shrink-0">Est. {op.estimated_minutes != null ? (op.estimated_minutes < 60 ? `${op.estimated_minutes}m` : `${Math.floor(op.estimated_minutes / 60)}h`) : '—'}</span>
                    <div className="shrink-0">
                      <Button size="sm" variant="secondary" className="gap-1 text-xs" disabled={claimingBountyId === op.id} onClick={() => handleClaimSideOp(op.id)}>
                        <Zap className="w-3 h-3" /> {claimingBountyId === op.id ? 'Claiming…' : 'Claim Op'}
                      </Button>
                    </div>
                  </div>
                );
              })}
          </div>
          )}
          {filteredOpportunities.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-app-muted">
              <p className="text-lg">No opportunities found</p>
              <p className="text-sm mt-1">Try adjusting filters or search. Create projects in Admin → Project Marketplace, or filter by Side Ops to post one.</p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="tasks" className="flex-1 overflow-hidden">
          <TaskBoard
            activeProjectIds={activeProjectIds}
            getProjectName={(id) => marketplaceProjects.find((p) => p.id === id)?.name}
            onSelectProject={(id) => {
              const p = marketplaceProjects.find((pr) => pr.id === id);
              if (p) setSelectedProject(p);
            }}
          />
        </TabsContent>

      </Tabs>

      <Modal
        isOpen={!!selectedProject}
        onClose={() => setSelectedProject(null)}
        title={selectedProject?.name ?? 'Project details'}
        size="lg"
      >
        {selectedProject && (
          <div className="space-y-4">
            <div>
              <span
                className="inline-block px-2.5 py-0.5 rounded-md text-xs font-medium capitalize"
                style={{
                  backgroundColor: getDeptColor(selectedProject.type).bg,
                  color: getDeptColor(selectedProject.type).text,
                }}
              >
                {selectedProject.type}
              </span>
              {selectedProject.xp_reward > 0 && (
                <span className={cn(
                  'ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium',
                  selectedProject.reward_currency === 'MSP'
                    ? 'bg-yellow-500/25 text-yellow-400'
                    : 'bg-blue-500/20 text-blue-400'
                )}>
                  {selectedProject.reward_currency === 'MSP' ? '🪙' : <Zap className="w-3 h-3" />}
                  +{selectedProject.xp_reward} {selectedProject.reward_currency === 'MSP' ? 'MSP' : 'MP'}
                </span>
              )}
              {isMspdProject(selectedProject) && (
                <span className="ml-2 px-2 py-0.5 rounded bg-yellow-500/20 text-yellow-400 text-xs font-bold uppercase">
                  MSPD Authorized
                </span>
              )}
            </div>
            <p className="text-app-muted text-sm">{selectedProject.description}</p>
            {Array.isArray(selectedProject.tags) && selectedProject.tags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {selectedProject.tags.map((t) => (
                  <span key={t} className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-app-surface-tertiary text-app-muted text-xs">
                    <Tag className="w-3 h-3" />#{t}
                  </span>
                ))}
              </div>
            )}
            <div className="flex items-center gap-4 text-sm text-app-muted">
              <span className="flex items-center gap-1">
                <Users className="w-4 h-4" />
                {selectedProject.application_count} applications
              </span>
              {selectedProject.due_date && (
                <span className="flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  Due {formatDate(selectedProject.due_date)}
                </span>
              )}
              <span>Progress: {selectedProject.progress}%</span>
            </div>
            {Array.isArray(selectedProject.recruitment_config) && selectedProject.recruitment_config.length > 0 && (
              <OpenSlotsVisual config={selectedProject.recruitment_config} />
            )}
          </div>
        )}
      </Modal>

      <ProposeProjectModal
        isOpen={showProposeModal}
        onClose={() => setShowProposeModal(false)}
        onSuccess={fetchMarketplace}
      />
    </div>
  );
}
