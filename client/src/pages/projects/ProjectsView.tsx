import { useState, useEffect, useCallback, useMemo } from 'react';
import { Calendar, Users, Zap, Tag, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStore } from '@/stores/authStore';
import { DoraInsightBar } from '@/components/dora/DoraInsightBar';
import { useProjectStore } from '@/stores/projectStore';
import { projectsAPI, bountiesAPI, type MarketplaceProject } from '@/lib/api';
import { Button, Modal } from '@/components/ui';
import { Tabs, TabsContent } from '@/components/ui';
import { MarketplaceNavBar } from '@/components/marketplace';
import { TaskBoard } from '@/components/projects/TaskBoard';
import { ProposeProjectModal } from '@/components/projects/ProposeProjectModal';
import { cn } from '@/lib/utils';

import type { SideOpItem, OpportunityFilter } from './types';
import { getDeptColor, formatDate, isMspdProject, isSideOpProject } from './types';
import { OpenSlotsVisual } from './OpenSlotsVisual';
import { MarketplaceCard } from './MarketplaceCard';
import { SideOpCard } from './SideOpCard';
import { MSPDCard } from './MSPDCard';
import { MarketplaceListRow } from './MarketplaceListRow';

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
      <div className="px-6 pt-4">
        <DoraInsightBar module="projects" />
      </div>
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
