import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { DoraInsightBar } from '@/components/dora/DoraInsightBar';
import { KPICard } from '@/components/finance/KPICard';
import { SlideOverPanel } from '@/components/ui/SlideOverPanel';
import { Badge } from '@/components/ui/Badge';
import { Briefcase, KanbanSquare, Sparkles, UserCheck } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { ROUTES } from '@/lib/routes';
import { recruitmentAPI, type RecruitmentApplication, type RecruitmentJob } from '@/lib/recruitmentApi';
import { RecruitmentNav } from './components/RecruitmentNav';
import { ApplicationDetailPanel } from './components/ApplicationDetailPanel';
import { RECRUITMENT_KANBAN_STAGES } from './stages';

function scoreVariant(score: number): 'green' | 'orange' | 'red' {
  if (score >= 80) return 'green';
  if (score >= 50) return 'orange';
  return 'red';
}

function daysSince(dateIso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(dateIso).getTime()) / 86400000));
}

export function RecruitmentPipelinePage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const userId = user?.authUserId || user?.id || '';
  const [jobs, setJobs] = useState<RecruitmentJob[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string>('');
  const [applicationsByStage, setApplicationsByStage] = useState<Record<string, RecruitmentApplication[]>>({});
  const [selectedApplicationId, setSelectedApplicationId] = useState<string | null>(null);
  const [draggedApplication, setDraggedApplication] = useState<RecruitmentApplication | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const jobsRes = await recruitmentAPI.listJobs(userId, { status: 'open', page: '1', pageSize: '50' });
      setJobs(jobsRes.data);
      const activeJobId = selectedJobId || jobsRes.data[0]?.id || '';
      setSelectedJobId(activeJobId);
      if (activeJobId) {
        const pipeline = await recruitmentAPI.getApplicationsByStage(userId, activeJobId);
        setApplicationsByStage(pipeline);
      } else {
        setApplicationsByStage({});
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load pipeline');
    } finally {
      setLoading(false);
    }
  }, [selectedJobId, userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const moveToStage = async (application: RecruitmentApplication, stageId: string): Promise<void> => {
    if (application.stage === stageId) return;
    try {
      await recruitmentAPI.moveApplicationStage(userId, application.id, stageId);
      toast.success('Stage updated');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to move application');
    }
  };

  const selectedJob = useMemo(() => jobs.find((job) => job.id === selectedJobId) ?? null, [jobs, selectedJobId]);
  const totalApplicants = useMemo(
    () => Object.values(applicationsByStage).reduce((sum, items) => sum + items.length, 0),
    [applicationsByStage],
  );
  const aiScoredCount = useMemo(
    () => Object.values(applicationsByStage).flat().filter((app) => app.screened_method === 'ai').length,
    [applicationsByStage],
  );

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[1600px] mx-auto px-6 pt-6 pb-4 flex flex-col min-h-full">
          <RecruitmentNav />
          <DoraInsightBar module="recruitment" fallback="Dora screens resumes and tracks hiring pipeline efficiency." />

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <KPICard title="Open Role" value={selectedJob?.title || 'No open jobs'} icon={Briefcase} />
            <KPICard title="Applicants" value={totalApplicants} icon={UserCheck} />
            <KPICard title="AI Scored" value={aiScoredCount} icon={Sparkles} />
          </div>

          <div className="flex items-center justify-between mb-4 gap-4">
            <div className="flex items-center gap-3">
              <KanbanSquare className="w-5 h-5 text-app-muted" />
              <select
                className="rounded-lg border border-app-border bg-app-card px-3 py-2 text-sm text-app-text"
                value={selectedJobId}
                onChange={async (e) => {
                  const nextJobId = e.target.value;
                  setSelectedJobId(nextJobId);
                  if (nextJobId) {
                    try {
                      setApplicationsByStage(await recruitmentAPI.getApplicationsByStage(userId, nextJobId));
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : 'Failed to load pipeline');
                    }
                  }
                }}
              >
                {jobs.map((job) => (
                  <option key={job.id} value={job.id}>
                    {job.title}
                  </option>
                ))}
              </select>
            </div>
            {selectedJob && (
              <div className="text-sm text-app-muted">
                {selectedJob.positions_filled}/{selectedJob.positions_count} positions filled
              </div>
            )}
          </div>

          {loading ? (
            <div className="text-sm text-app-muted">Loading pipeline…</div>
          ) : jobs.length === 0 ? (
            <div className="rounded-xl border border-dashed border-app-border bg-app-card/40 px-6 py-10 text-center space-y-4 max-w-lg mx-auto">
              <p className="text-sm text-app-muted">
                No open jobs yet. Create a job and set its status to open to manage applicants on this board.
              </p>
              <button
                type="button"
                onClick={() => navigate(ROUTES.RECRUITMENT)}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-primary-500 text-app-text hover:bg-primary-600"
              >
                Go to Jobs
              </button>
            </div>
          ) : (
            <div className="flex gap-3 overflow-x-auto pb-2">
              {RECRUITMENT_KANBAN_STAGES.map((stage) => {
                const items = applicationsByStage[stage.id] || [];
                return (
                  <div
                    key={stage.id}
                    data-testid={stage.id === 'hired' ? 'recruitment-stage-hired' : `recruitment-stage-${stage.id}`}
                    className="w-[290px] min-w-[290px] rounded-xl border border-app-border bg-app-card/60 flex flex-col"
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={async () => {
                      if (!draggedApplication || draggedApplication.stage === stage.id) return;
                      try {
                        await recruitmentAPI.moveApplicationStage(userId, draggedApplication.id, stage.id);
                        toast.success('Stage updated');
                        setDraggedApplication(null);
                        await load();
                      } catch (e) {
                        toast.error(e instanceof Error ? e.message : 'Failed to move application');
                      }
                    }}
                  >
                    <div className="px-3 py-2.5 border-b border-app-border flex items-center justify-between">
                      <span className="text-sm font-medium text-app-text">{stage.label}</span>
                      <Badge variant="default">{items.length}</Badge>
                    </div>
                    <div className="p-2 space-y-2 min-h-[180px]">
                      {items.map((application) => {
                        const score = application.match_score ?? 0;
                        const candidate = application.candidate;
                        const name = `${candidate?.first_name ?? ''} ${candidate?.last_name ?? ''}`.trim() || 'Candidate';
                        return (
                          <div
                            key={application.id}
                            data-testid={`application-card-${application.id}`}
                            draggable
                            onDragStart={() => setDraggedApplication(application)}
                            className="rounded-lg border border-app-border bg-app-card hover:bg-app-nav-hover transition-colors"
                          >
                            <button
                              type="button"
                              onClick={() => setSelectedApplicationId(application.id)}
                              className="w-full text-left p-3"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <div className="text-sm font-medium text-app-text">
                                    {candidate?.first_name} {candidate?.last_name}
                                  </div>
                                  <div className="text-xs text-app-muted">
                                    {candidate?.current_company || 'No current company'}
                                    {candidate?.current_title ? ` • ${candidate.current_title}` : ''}
                                  </div>
                                </div>
                                <Badge variant={scoreVariant(score)}>{score}%</Badge>
                              </div>
                              <div className="mt-2 flex items-center justify-between text-xs text-app-muted">
                                <span>{application.source || candidate?.source || 'unknown'}</span>
                                <span>{daysSince(application.last_stage_change_at)}d in stage</span>
                              </div>
                              {application.screened_method === 'ai' && (
                                <div className="mt-2">
                                  <Badge variant="purple">AI Scored</Badge>
                                </div>
                              )}
                            </button>
                            <div className="px-3 pb-2" onClick={(ev) => ev.stopPropagation()}>
                              <label htmlFor={`move-stage-${application.id}`} className="sr-only">
                                Move {name} to another stage
                              </label>
                              <select
                                id={`move-stage-${application.id}`}
                                className="w-full rounded-md border border-app-border bg-app-surface-tertiary px-2 py-1.5 text-xs text-app-text"
                                defaultValue=""
                                onChange={(e) => {
                                  const v = e.target.value;
                                  e.target.value = '';
                                  if (v) void moveToStage(application, v);
                                }}
                              >
                                <option value="">Move to… (keyboard)</option>
                                {RECRUITMENT_KANBAN_STAGES.filter((s) => s.id !== application.stage).map((s) => (
                                  <option key={s.id} value={s.id}>
                                    {s.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <SlideOverPanel isOpen={!!selectedApplicationId} onClose={() => setSelectedApplicationId(null)} title="Application Detail" width={760}>
        {selectedApplicationId && <ApplicationDetailPanel applicationId={selectedApplicationId} onUpdated={load} />}
      </SlideOverPanel>
    </div>
  );
}
