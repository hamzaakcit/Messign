import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Search, Calendar, Users, Zap, Tag, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStore } from '@/stores/authStore';
import { DoraInsightBar } from '@/components/dora/DoraInsightBar';
import { useProjectStore } from '@/stores/projectStore';
import { projectsAPI, bountiesAPI, type MarketplaceProject } from '@/lib/api';
import { openBountiesQueryKey, useOpenBountiesQuery } from '@/hooks/useOpenBountiesQuery';
import { Button, Modal, Input } from '@/components/ui';
import { Tabs, TabsContent } from '@/components/ui';
import { MarketplaceNavBar } from '@/components/marketplace';
import { TaskBoard } from '@/components/projects/TaskBoard';
import { ProposeProjectModal } from '@/components/projects/ProposeProjectModal';
import { cn } from '@/lib/utils';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { marketplaceProjectsQueryKey, useMarketplaceProjectsQuery } from '@/hooks/useMarketplaceProjectsQuery';

import type { SideOpItem, OpportunityFilter } from './types';
import {
  getDeptColor,
  formatDate,
  isMspdProject,
  isSideOpProject,
  getDistinctRecruitmentDepts,
  matchesTimeCommitment,
  matchesXpRange,
  matchesMarketplaceStatus,
  matchesSideOpItemStatus,
  type TimeCommitmentFilter,
  type XpRangeFilter,
  type MarketplaceStatusFilter,
} from './types';
import { OpenSlotsVisual } from './OpenSlotsVisual';
import { MarketplaceCard } from './MarketplaceCard';
import { SideOpCard } from './SideOpCard';
import { MSPDCard } from './MSPDCard';
import { MarketplaceListRow } from './MarketplaceListRow';

const VIEW_LAYOUT_STORAGE_KEY = 'messign-projects-view-layout';

function readStoredViewLayout(): 'grid' | 'list' {
  try {
    const v = localStorage.getItem(VIEW_LAYOUT_STORAGE_KEY);
    if (v === 'list' || v === 'grid') return v;
  } catch {
    /* ignore */
  }
  return 'grid';
}

function MarketplaceSkeletonGrid(): JSX.Element {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
      {Array.from({ length: 10 }).map((_, i) => (
        <div
          key={i}
          className="h-[160px] rounded-lg border border-app-border bg-app-surface-tertiary/60 animate-pulse"
          aria-hidden
        />
      ))}
    </div>
  );
}

export function ProjectsView(): JSX.Element {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const viewMode = (searchParams.get('tab') === 'tasks' ? 'tasks' : 'marketplace') as 'marketplace' | 'tasks';
  const opportunityFilter = useMemo((): OpportunityFilter => {
    const f = searchParams.get('filter');
    if (f === 'projects' || f === 'side_ops' || f === 'mspd' || f === 'all') return f;
    return 'all';
  }, [searchParams]);
  const searchQuery = searchParams.get('q') ?? '';
  const activeTab = useMemo((): 'all' | 'recruiting' | 'active' => {
    const o = searchParams.get('opp');
    if (o === 'recruiting' || o === 'active') return o;
    return 'all';
  }, [searchParams]);

  const setViewMode = useCallback((mode: 'marketplace' | 'tasks') => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (mode === 'tasks') next.set('tab', 'tasks');
        else next.delete('tab');
        return next;
      },
      { replace: true }
    );
  }, [setSearchParams]);

  const setOpportunityFilter = useCallback(
    (f: OpportunityFilter) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (f === 'all') next.delete('filter');
          else next.set('filter', f);
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  const setSearchQuery = useCallback(
    (q: string) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (q.trim()) next.set('q', q.trim());
          else next.delete('q');
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  const setActiveTab = useCallback(
    (t: 'all' | 'recruiting' | 'active') => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (t === 'all') next.delete('opp');
          else next.set('opp', t);
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  const { setActiveProject, fetchTasks } = useProjectStore();
  const tasks = useProjectStore((s) => s.tasks);
  const tasksLoading = useProjectStore((s) => s.tasksLoading);

  const { data: marketplaceProjects, isLoading, isError, error, refetch } = useMarketplaceProjectsQuery(user?.id);
  const {
    data: sideOpsList,
    isLoading: bountiesLoading,
    refetch: refetchBounties,
  } = useOpenBountiesQuery(user?.id);

  const [advDepartment, setAdvDepartment] = useState<string>('all');
  const [advSkill, setAdvSkill] = useState<string>('all');
  const [advTime, setAdvTime] = useState<TimeCommitmentFilter>('');
  const [advXp, setAdvXp] = useState<XpRangeFilter>('');
  const [advStatus, setAdvStatus] = useState<MarketplaceStatusFilter>('');

  const [viewLayout, setViewLayoutState] = useState<'grid' | 'list'>(readStoredViewLayout);
  const setViewLayout = useCallback((mode: 'grid' | 'list') => {
    setViewLayoutState(mode);
    try {
      localStorage.setItem(VIEW_LAYOUT_STORAGE_KEY, mode);
    } catch {
      /* ignore */
    }
  }, []);

  const [taskProjectFilter, setTaskProjectFilter] = useState<'all' | string>('all');
  const [appliedOptimistic, setAppliedOptimistic] = useState<Set<string>>(new Set());
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [claimingBountyId, setClaimingBountyId] = useState<string | null>(null);
  const [showProposeModal, setShowProposeModal] = useState(false);
  const [selectedProject, setSelectedProject] = useState<MarketplaceProject | null>(null);
  const [detailApplyNote, setDetailApplyNote] = useState('');
  const [slotPickProject, setSlotPickProject] = useState<MarketplaceProject | null>(null);
  const [slotChoice, setSlotChoice] = useState<string>('');
  const [slotApplyMessage, setSlotApplyMessage] = useState('');

  useEffect(() => {
    if (slotPickProject) {
      const d = getDistinctRecruitmentDepts(slotPickProject);
      setSlotChoice(d[0] ?? '');
      setSlotApplyMessage('');
    }
  }, [slotPickProject]);

  const projectModalRef = useRef<HTMLDivElement>(null);
  const slotModalRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  useFocusTrap(!!selectedProject, projectModalRef);
  useFocusTrap(!!slotPickProject, slotModalRef);

  useEffect(() => {
    if (viewMode === 'tasks' && user?.id) {
      void fetchTasks();
    }
  }, [viewMode, user?.id, fetchTasks]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible' && viewMode === 'tasks' && user?.id) void fetchTasks();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [viewMode, user?.id, fetchTasks]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        e.key === '/' &&
        viewMode === 'marketplace' &&
        document.activeElement?.tagName !== 'INPUT' &&
        document.activeElement?.tagName !== 'TEXTAREA'
      ) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [viewMode]);

  const handleGoToWorkspace = useCallback(
    (project: MarketplaceProject) => {
      setViewMode('tasks');
      setActiveProject(project.id);
      void fetchTasks(project.id);
    },
    [setViewMode, setActiveProject, fetchTasks]
  );

  const refetchMarketplace = useCallback(() => {
    if (user?.id) void queryClient.invalidateQueries({ queryKey: marketplaceProjectsQueryKey(user.id) });
    void refetch();
  }, [queryClient, refetch, user?.id]);

  const allTags = useMemo(() => {
    const s = new Set<string>();
    marketplaceProjects.forEach((p) => {
      (Array.isArray(p.tags) ? p.tags : []).forEach((t) => s.add(t));
    });
    return [...s].sort();
  }, [marketplaceProjects]);

  const activeProjectIds = useMemo(
    () => new Set(marketplaceProjects.filter((p) => p.recruitment_status === 'active').map((p) => p.id)),
    [marketplaceProjects]
  );

  const activeProjectsList = useMemo(
    () => marketplaceProjects.filter((p) => p.recruitment_status === 'active'),
    [marketplaceProjects]
  );

  const taskBoardProjectIds = useMemo(() => {
    if (taskProjectFilter === 'all') return activeProjectIds;
    if (activeProjectIds.has(taskProjectFilter)) return new Set([taskProjectFilter]);
    return activeProjectIds;
  }, [activeProjectIds, taskProjectFilter]);

  useEffect(() => {
    if (taskProjectFilter !== 'all' && !activeProjectIds.has(taskProjectFilter)) {
      setTaskProjectFilter('all');
    }
  }, [activeProjectIds, taskProjectFilter]);

  const launchedTaskCount = useMemo(
    () => tasks.filter((t) => taskBoardProjectIds.has(t.projectId)).length,
    [tasks, taskBoardProjectIds]
  );

  const mspdOpportunityCount = useMemo(
    () =>
      marketplaceProjects.filter(
        (p) =>
          isMspdProject(p) && (p.recruitment_status === 'recruiting' || p.recruitment_status === undefined)
      ).length,
    [marketplaceProjects]
  );

  const runApply = useCallback(
    async (projectId: string, body?: { slot_department?: string; message?: string }) => {
      setApplyingId(projectId);
      setAppliedOptimistic((prev) => new Set(prev).add(projectId));
      try {
        await projectsAPI.apply(projectId, body);
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
        refetchMarketplace();
      }
    },
    [refetchMarketplace]
  );

  const handleApplyProject = useCallback(
    (project: MarketplaceProject, slotDepartment?: string, message?: string) => {
      const depts = getDistinctRecruitmentDepts(project);
      if (depts.length > 1 && !slotDepartment) {
        setSlotChoice(depts[0] ?? '');
        setSlotPickProject(project);
        return;
      }
      const slot = slotDepartment ?? (depts.length === 1 ? depts[0] : undefined);
      const msg = message?.trim();
      void runApply(project.id, {
        ...(slot ? { slot_department: slot } : {}),
        ...(msg ? { message: msg } : {}),
      });
    },
    [runApply]
  );

  const handleClaimSideOp = async (bountyId: string) => {
    setClaimingBountyId(bountyId);
    try {
      await bountiesAPI.claim(bountyId);
      toast.success('Side op claimed!');
      if (user?.id) void queryClient.invalidateQueries({ queryKey: openBountiesQueryKey(user.id) });
      void refetchBounties();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to claim');
    } finally {
      setClaimingBountyId(null);
    }
  };

  const combinedOpportunities = useMemo(() => {
    const projects: MarketplaceProject[] = marketplaceProjects.filter(
      (p) =>
        p.recruitment_status !== 'rejected' &&
        p.user_application_status !== 'rejected' &&
        (p.recruitment_status === 'recruiting' ||
          p.recruitment_status === undefined ||
          p.recruitment_status === 'active')
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
      advDepartment === 'all' ||
      p.type === advDepartment ||
      (Array.isArray(p.recruitment_config) && p.recruitment_config.some((s) => s.dept === advDepartment));
    const matchesTag = (p: MarketplaceProject) =>
      advSkill === 'all' || (Array.isArray(p.tags) && p.tags.includes(advSkill));
    const matchesSearch = (name: string, desc: string) =>
      name.toLowerCase().includes(searchQuery.toLowerCase()) || desc.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesAdvProject = (p: MarketplaceProject) =>
      matchesTimeCommitment(p.estimated_minutes, advTime) &&
      matchesXpRange(p.xp_reward, advXp) &&
      matchesMarketplaceStatus(p, advStatus);

    const matchesAdvSideOp = (b: SideOpItem) =>
      matchesTimeCommitment(b.estimated_minutes, advTime) &&
      matchesXpRange(b.xp_reward, advXp) &&
      matchesSideOpItemStatus(b, advStatus);

    return combinedOpportunities.filter((item) => {
      if (!matchesFilter(item)) return false;
      if (item.kind === 'project') {
        const p = item.data;
        const tabOk = activeTab === 'all' || p.recruitment_status === activeTab;
        return (
          tabOk &&
          matchesDept(p) &&
          matchesTag(p) &&
          matchesSearch(p.name, p.description) &&
          matchesAdvProject(p)
        );
      }
      return matchesSearch(item.data.title ?? item.data.id, item.data.description ?? '') && matchesAdvSideOp(item.data);
    });
  }, [
    combinedOpportunities,
    opportunityFilter,
    activeTab,
    advDepartment,
    advSkill,
    searchQuery,
    advTime,
    advXp,
    advStatus,
  ]);

  const marketplaceError = isError && error ? error.message : null;

  const closeProjectModal = useCallback(() => {
    setSelectedProject(null);
    setDetailApplyNote('');
  }, []);

  if (!user?.id) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-app-muted">
        <p className="text-lg">Sign in to view the project marketplace.</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="px-6 pt-4">
        <DoraInsightBar module="projects" />
      </div>
      <Tabs
        value={viewMode}
        onValueChange={(v) => setViewMode(v as 'marketplace' | 'tasks')}
        className="h-full flex flex-col min-h-0"
      >
        <MarketplaceNavBar
          activeTab={viewMode === 'marketplace' ? 'opportunity-hub' : 'tasks'}
          activeFilter={opportunityFilter}
          viewMode={viewLayout}
          myItemsCount={mspdOpportunityCount}
          onTabChange={(tab) => setViewMode(tab === 'opportunity-hub' ? 'marketplace' : 'tasks')}
          onFilterChange={setOpportunityFilter}
          onViewModeChange={setViewLayout}
          onPropose={() => setShowProposeModal(true)}
          initialFilterOptions={{
            department: advDepartment === 'all' ? '' : advDepartment,
            skill: advSkill === 'all' ? '' : advSkill,
            timeCommitment: advTime,
            xpRange: advXp,
            status: advStatus,
          }}
          skillOptions={allTags}
          onAdvancedFiltersChange={(opts) => {
            setAdvDepartment(opts.department || 'all');
            setAdvSkill(opts.skill || 'all');
            setAdvTime((opts.timeCommitment || '') as TimeCommitmentFilter);
            setAdvXp((opts.xpRange || '') as XpRangeFilter);
            setAdvStatus((opts.status || '') as MarketplaceStatusFilter);
          }}
        />

        <TabsContent value="marketplace" className="flex-1 overflow-auto p-4 flex flex-col min-h-0">
          <p id="projects-opportunity-count" className="sr-only" aria-live="polite" aria-atomic="true">
            {filteredOpportunities.length} opportunities match your filters.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center mb-4 shrink-0">
            <div className="relative flex-1 min-w-0 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-app-muted pointer-events-none" />
              <Input
                ref={searchInputRef}
                type="search"
                placeholder="Search opportunities… (press /)"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
                aria-label="Search opportunities"
              />
            </div>
            <div className="flex rounded-lg border border-app-border bg-app-surface-tertiary p-0.5 shrink-0">
              {(['all', 'recruiting', 'active'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setActiveTab(t)}
                  className={cn(
                    'px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
                    activeTab === t
                      ? 'bg-app-nav-active-bg text-app-nav-active-text'
                      : 'text-app-muted hover:text-app'
                  )}
                >
                  {t === 'all' ? 'All' : t === 'recruiting' ? 'Recruiting' : 'Active'}
                </button>
              ))}
            </div>
          </div>

          {marketplaceError && (
            <div className="flex flex-wrap items-center gap-3 mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3">
              <p className="text-amber-400 text-sm flex-1 min-w-0">{marketplaceError}</p>
              <Button type="button" size="sm" variant="secondary" onClick={() => void refetch()}>
                Retry
              </Button>
            </div>
          )}
          {bountiesLoading ? (
            <p className="text-xs text-app-muted mb-3" role="status">
              Loading side ops…
            </p>
          ) : null}

          {isLoading ? (
            <MarketplaceSkeletonGrid />
          ) : viewLayout === 'grid' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {filteredOpportunities.map((item) => {
                if (item.kind === 'project') {
                  const project = item.data;
                  if (isMspdProject(project)) {
                    return (
                      <MSPDCard
                        key={`mspd-${project.id}`}
                        project={project}
                        onApply={() => handleApplyProject(project)}
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
                        onApply={() => handleApplyProject(project)}
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
                      onApply={() => handleApplyProject(project)}
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
            <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
              <div className="min-w-[720px] space-y-2">
                <div className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto_auto_auto] gap-3 sm:gap-4 items-center py-2 px-4 text-xs font-medium text-app-muted uppercase tracking-wider">
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
                        <div
                          key={`mspd-${project.id}`}
                          className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto_auto_auto] gap-3 sm:gap-4 items-center py-3 px-4 rounded-lg border border-amber-500/40 bg-gray-900/50 dark:bg-gray-950/50 transition-all shadow-[0_0_20px_rgba(234,179,8,0.08)] hover:border-amber-500/70 hover:shadow-[0_0_24px_rgba(234,179,8,0.12)]"
                        >
                          <div className="min-w-0">
                            <span className="text-amber-400 text-xs font-bold uppercase mr-2">MSPD</span>
                            <span className="font-semibold text-app">{project.name}</span>
                          </div>
                          <span
                            className="px-2 py-0.5 rounded text-xs capitalize shrink-0"
                            style={{
                              backgroundColor: getDeptColor(project.type).bg,
                              color: getDeptColor(project.type).text,
                            }}
                          >
                            {project.type}
                          </span>
                          <span className="text-xs text-app-muted shrink-0">—</span>
                          <span className="text-amber-400 text-sm shrink-0">
                            🪙 {project.xp_reward} {project.reward_currency === 'MSP' ? 'MSP' : 'MP'}
                          </span>
                          <span className="text-sm text-app-muted shrink-0">{project.due_date ? formatDate(project.due_date) : '—'}</span>
                          <div className="flex gap-2 shrink-0 flex-wrap justify-end">
                            {project.user_application_status === 'approved' && (
                              <Button
                                size="sm"
                                variant="primary"
                                className="gap-1.5 bg-yellow-600"
                                onClick={() => handleGoToWorkspace(project)}
                              >
                                <ExternalLink className="w-3.5 h-3.5" /> Go to Workspace
                              </Button>
                            )}
                            {(project.recruitment_status === 'recruiting' || project.recruitment_status === undefined) &&
                              project.user_application_status !== 'pending' &&
                              project.user_application_status !== 'approved' && (
                                <Button
                                  size="sm"
                                  variant="primary"
                                  className="bg-yellow-600"
                                  disabled={applyingId === project.id}
                                  onClick={() => handleApplyProject(project)}
                                >
                                  {applyingId === project.id ? 'Applying…' : 'Join'}
                                </Button>
                              )}
                          </div>
                        </div>
                      );
                    }
                    if (isSideOpProject(project)) {
                      return (
                        <div
                          key={`sideop-p-${project.id}`}
                          className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto_auto_auto] gap-3 sm:gap-4 items-center py-3 px-4 rounded-lg border-2 border-blue-500/40 bg-app-card/80 transition-all shadow-[0_0_20px_rgba(59,130,246,0.08)] hover:border-blue-500/60 hover:shadow-[0_0_24px_rgba(59,130,246,0.12)]"
                        >
                          <div className="min-w-0">
                            <span className="text-amber-400 text-xs font-medium mr-2">Side Op</span>
                            <span className="font-semibold text-app">{project.name}</span>
                          </div>
                          <span
                            className="px-2 py-0.5 rounded text-xs capitalize shrink-0"
                            style={{
                              backgroundColor: getDeptColor(project.type).bg,
                              color: getDeptColor(project.type).text,
                            }}
                          >
                            {project.type}
                          </span>
                          <span className="shrink-0">—</span>
                          <span className="text-app-muted text-sm shrink-0">
                            {project.xp_reward === 0 ? '0 MP' : `+${project.xp_reward} MP`}
                          </span>
                          <span className="text-sm text-app-muted shrink-0">
                            {project.estimated_minutes != null
                              ? project.estimated_minutes < 60
                                ? `Est. ${project.estimated_minutes}m`
                                : `Est. ${Math.floor(project.estimated_minutes / 60)}h`
                              : project.due_date
                                ? formatDate(project.due_date)
                                : '—'}
                          </span>
                          <div className="shrink-0 flex flex-wrap justify-end gap-1">
                            <Button size="sm" variant="ghost" className="text-xs" onClick={() => setSelectedProject(project)}>
                              View
                            </Button>
                            {(project.recruitment_status === 'recruiting' || project.recruitment_status === undefined) &&
                              project.user_application_status !== 'pending' &&
                              project.user_application_status !== 'approved' && (
                                <Button
                                  size="sm"
                                  variant="primary"
                                  className="text-xs"
                                  disabled={applyingId === project.id}
                                  onClick={() => handleApplyProject(project)}
                                >
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
                        onApply={() => handleApplyProject(project)}
                        onViewDetails={setSelectedProject}
                        onGoToWorkspace={handleGoToWorkspace}
                        appliedOptimistic={appliedOptimistic}
                        applyingId={applyingId}
                      />
                    );
                  }
                  const op = item.data;
                  return (
                    <div
                      key={`sideop-${op.id}`}
                      className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto_auto_auto] gap-3 sm:gap-4 items-center py-3 px-4 rounded-lg border-2 border-blue-500/40 bg-app-card/80 transition-all shadow-[0_0_20px_rgba(59,130,246,0.08)] hover:border-blue-500/60 hover:shadow-[0_0_24px_rgba(59,130,246,0.12)]"
                    >
                      <div className="min-w-0">
                        <span className="text-amber-400 text-xs font-medium mr-2">Side Op</span>
                        <span className="font-semibold text-app">{op.title}</span>
                      </div>
                      <span className="shrink-0">—</span>
                      <span className="shrink-0">—</span>
                      <span className="text-blue-400 text-sm shrink-0">+{op.xp_reward} MP</span>
                      <span className="text-sm text-app-muted shrink-0">
                        Est.{' '}
                        {op.estimated_minutes != null
                          ? op.estimated_minutes < 60
                            ? `${op.estimated_minutes}m`
                            : `${Math.floor(op.estimated_minutes / 60)}h`
                          : '—'}
                      </span>
                      <div className="shrink-0">
                        <Button
                          size="sm"
                          variant="secondary"
                          className="gap-1 text-xs"
                          disabled={claimingBountyId === op.id}
                          onClick={() => handleClaimSideOp(op.id)}
                        >
                          <Zap className="w-3 h-3" /> {claimingBountyId === op.id ? 'Claiming…' : 'Claim Op'}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {!isLoading && filteredOpportunities.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-app-muted">
              <p className="text-lg">No opportunities found</p>
              <p className="text-sm mt-1">
                Try adjusting filters or search. Create projects in Admin → Project Marketplace, or filter by Side Ops to post one.
              </p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="tasks" className="flex-1 overflow-hidden flex flex-col min-h-0">
          {activeProjectIds.size === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-6 text-center text-app-muted shrink-0">
              <p className="text-lg text-app font-medium">No active projects yet</p>
              <p className="text-sm mt-2 max-w-md">
                Tasks appear here only for projects that are <strong className="text-app">launched</strong> (recruitment status active) and that you are part of. Apply from the Opportunity Hub and wait for approval, then open your project from a card.
              </p>
            </div>
          ) : launchedTaskCount === 0 ? (
            <div className="px-4 py-3 text-sm text-app-muted border-b border-app-border shrink-0 bg-app-surface-tertiary/30">
              You have active projects, but no tasks are assigned yet. Check back soon or ask your project lead in chat.
            </div>
          ) : null}
          {activeProjectIds.size > 1 ? (
            <div className="shrink-0 px-4 pt-3 flex flex-wrap items-center gap-2 border-b border-app-border">
              <label htmlFor="task-project-filter" className="text-xs text-app-muted shrink-0">
                Show tasks for
              </label>
              <select
                id="task-project-filter"
                value={taskProjectFilter}
                onChange={(e) => setTaskProjectFilter(e.target.value === 'all' ? 'all' : e.target.value)}
                className="h-9 rounded-lg bg-app-surface-tertiary border border-app-border px-3 text-sm text-app max-w-[min(100%,20rem)]"
              >
                <option value="all">All active projects</option>
                {activeProjectsList.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <div className="flex-1 min-h-0">
            <TaskBoard
              activeProjectIds={taskBoardProjectIds}
              isLoadingTasks={tasksLoading}
              getProjectName={(id) => marketplaceProjects.find((p) => p.id === id)?.name}
              onSelectProject={(id) => {
                const p = marketplaceProjects.find((pr) => pr.id === id);
                if (p) setSelectedProject(p);
              }}
            />
          </div>
        </TabsContent>
      </Tabs>

      <Modal
        isOpen={!!selectedProject}
        onClose={closeProjectModal}
        title={selectedProject?.name ?? 'Project details'}
        size="lg"
        contentRef={projectModalRef}
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
                <span
                  className={cn(
                    'ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium',
                    selectedProject.reward_currency === 'MSP'
                      ? 'bg-yellow-500/25 text-yellow-400'
                      : 'bg-blue-500/20 text-blue-400'
                  )}
                >
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
            <div className="flex items-center gap-4 text-sm text-app-muted flex-wrap">
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
            {(selectedProject.recruitment_status === 'recruiting' || selectedProject.recruitment_status === undefined) &&
              selectedProject.user_application_status !== 'pending' &&
              selectedProject.user_application_status !== 'approved' && (
                <div className="space-y-2 pt-2 border-t border-app-border">
                  <label className="block text-xs text-app-muted" htmlFor="detail-apply-note">
                    Note to reviewer (optional)
                  </label>
                  <textarea
                    id="detail-apply-note"
                    value={detailApplyNote}
                    onChange={(e) => setDetailApplyNote(e.target.value)}
                    rows={3}
                    className="w-full rounded-lg bg-app-surface-tertiary border border-app-border px-3 py-2 text-sm text-app placeholder:text-app-muted focus:outline-none focus:ring-1 focus:ring-primary-500"
                    placeholder="Why you want to join this project…"
                  />
                </div>
              )}
            <div className="flex flex-wrap gap-2 pt-4 border-t border-app-border">
              {selectedProject.user_application_status === 'approved' && (
                <Button
                  type="button"
                  variant="primary"
                  className="gap-1.5"
                  onClick={() => {
                    handleGoToWorkspace(selectedProject);
                    closeProjectModal();
                  }}
                >
                  <ExternalLink className="w-3.5 h-3.5" /> Go to workspace
                </Button>
              )}
              {(selectedProject.recruitment_status === 'recruiting' || selectedProject.recruitment_status === undefined) &&
                selectedProject.user_application_status !== 'pending' &&
                selectedProject.user_application_status !== 'approved' && (
                  <Button
                    type="button"
                    variant="primary"
                    disabled={applyingId === selectedProject.id}
                    onClick={() => {
                      void handleApplyProject(selectedProject, undefined, detailApplyNote);
                      closeProjectModal();
                    }}
                  >
                    {applyingId === selectedProject.id ? 'Applying…' : 'Join project'}
                  </Button>
                )}
            </div>
          </div>
        )}
      </Modal>

      <Modal
        isOpen={!!slotPickProject}
        onClose={() => setSlotPickProject(null)}
        title="Choose role"
        size="sm"
        contentRef={slotModalRef}
      >
        {slotPickProject && (
          <div className="space-y-4">
            <p className="text-sm text-app-muted">
              This project has openings in multiple departments. Pick which role you are applying for.
            </p>
            <label className="block text-xs text-app-muted mb-1">Department slot</label>
            <select
              value={slotChoice}
              onChange={(e) => setSlotChoice(e.target.value)}
              className="w-full h-10 rounded-lg bg-app-surface-tertiary border border-app-border px-3 text-sm text-app"
            >
              {getDistinctRecruitmentDepts(slotPickProject).map((d) => (
                <option key={d} value={d}>
                  {d.charAt(0).toUpperCase() + d.slice(1)}
                </option>
              ))}
            </select>
            <div>
              <label className="block text-xs text-app-muted mb-1" htmlFor="slot-apply-note">
                Note (optional)
              </label>
              <textarea
                id="slot-apply-note"
                value={slotApplyMessage}
                onChange={(e) => setSlotApplyMessage(e.target.value)}
                rows={2}
                className="w-full rounded-lg bg-app-surface-tertiary border border-app-border px-3 py-2 text-sm text-app"
                placeholder="Optional message to the reviewer"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={() => setSlotPickProject(null)}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                onClick={() => {
                  const p = slotPickProject;
                  const dept = slotChoice || getDistinctRecruitmentDepts(p)[0];
                  setSlotPickProject(null);
                  const msg = slotApplyMessage.trim();
                  if (p && dept) void runApply(p.id, { slot_department: dept, ...(msg ? { message: msg } : {}) });
                }}
              >
                Apply
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <ProposeProjectModal
        isOpen={showProposeModal}
        onClose={() => setShowProposeModal(false)}
        onSuccess={() => {
          if (user?.id) void queryClient.invalidateQueries({ queryKey: marketplaceProjectsQueryKey(user.id) });
          void refetch();
        }}
      />
    </div>
  );
}
