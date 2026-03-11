import { useCallback, useEffect, useMemo, useState } from 'react';
import { DoraInsightBar } from '@/components/dora/DoraInsightBar';
import { KPICard } from '@/components/finance/KPICard';
import { SlideOverPanel } from '@/components/ui/SlideOverPanel';
import { Badge } from '@/components/ui/Badge';
import { Briefcase, KanbanSquare, Sparkles, UserCheck } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { recruitmentAPI, type RecruitmentApplication, type RecruitmentJob } from '@/lib/recruitmentApi';
import { RecruitmentNav } from './components/RecruitmentNav';
import { ApplicationDetailPanel } from './components/ApplicationDetailPanel';

const STAGES = [
  { id: 'applied', label: 'Applied' },
  { id: 'screening', label: 'Screening' },
  { id: 'phone_screen', label: 'Phone Screen' },
  { id: 'interview', label: 'Interview' },
  { id: 'assessment', label: 'Assessment' },
  { id: 'final_interview', label: 'Final Interview' },
  { id: 'offer', label: 'Offer' },
  { id: 'hired', label: 'Hired' },
];

function scoreVariant(score: number): 'green' | 'orange' | 'red' {
  if (score >= 80) return 'green';
  if (score >= 50) return 'orange';
  return 'red';
}

function daysSince(dateIso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(dateIso).getTime()) / 86400000));
}

export function RecruitmentPipelinePage() {
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
    } finally {
      setLoading(false);
    }
  }, [selectedJobId, userId]);

  useEffect(() => {
    void load();
  }, [load]);

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
                    setApplicationsByStage(await recruitmentAPI.getApplicationsByStage(userId, nextJobId));
                  }
                }}
              >
                {jobs.map((job) => (
                  <option key={job.id} value={job.id}>{job.title}</option>
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
          ) : (
            <div className="flex gap-3 overflow-x-auto pb-2">
              {STAGES.map((stage) => {
                const items = applicationsByStage[stage.id] || [];
                return (
                  <div
                    key={stage.id}
                    data-testid={stage.id === 'hired' ? 'recruitment-stage-hired' : `recruitment-stage-${stage.id}`}
                    className="w-[290px] min-w-[290px] rounded-xl border border-app-border bg-app-card/60 flex flex-col"
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={async () => {
                      if (!draggedApplication || draggedApplication.stage === stage.id) return;
                      await recruitmentAPI.moveApplicationStage(userId, draggedApplication.id, stage.id);
                      setDraggedApplication(null);
                      await load();
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
                        return (
                          <button
                            key={application.id}
                            data-testid={`application-card-${application.id}`}
                            draggable
                            onDragStart={() => setDraggedApplication(application)}
                            onClick={() => setSelectedApplicationId(application.id)}
                            className="w-full text-left rounded-lg border border-app-border bg-app-card p-3 hover:bg-white/5 transition-colors"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <div className="text-sm font-medium text-app-text">
                                  {candidate?.first_name} {candidate?.last_name}
                                </div>
                                <div className="text-xs text-app-muted">
                                  {candidate?.current_company || 'No current company'}{candidate?.current_title ? ` • ${candidate.current_title}` : ''}
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
