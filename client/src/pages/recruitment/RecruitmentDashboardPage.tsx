import { useCallback, useEffect, useMemo, useState } from 'react';
import { ResponsiveContainer, BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip, PieChart, Pie, Cell, LineChart, Line, FunnelChart, Funnel, LabelList } from 'recharts';
import { DoraInsightBar } from '@/components/dora/DoraInsightBar';
import { KPICard } from '@/components/finance/KPICard';
import { Briefcase, CalendarClock, TrendingUp, Users } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { recruitmentAPI, type RecruitmentDashboardMetrics } from '@/lib/recruitmentApi';
import { RecruitmentNav } from './components/RecruitmentNav';

const PIE_COLORS = ['#3b82f6', '#14b8a6', '#8b5cf6', '#f59e0b', '#ef4444'];

export function RecruitmentDashboardPage() {
  const { user } = useAuthStore();
  const userId = user?.authUserId || user?.id || '';
  const [metrics, setMetrics] = useState<RecruitmentDashboardMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      setMetrics(await recruitmentAPI.getDashboardMetrics(userId));
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const funnelData = useMemo(() => {
    const pipeline = metrics?.pipelineByStage || {};
    return [
      { value: pipeline.applied || 0, name: 'Applied' },
      { value: pipeline.screening || 0, name: 'Screening' },
      { value: pipeline.interviewing || 0, name: 'Interviewing' },
      { value: pipeline.offer || 0, name: 'Offer' },
      { value: pipeline.hired || 0, name: 'Hired' },
    ];
  }, [metrics]);

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[1600px] mx-auto px-6 pt-6 pb-6">
          <RecruitmentNav />
          <DoraInsightBar module="recruitment" fallback="Dora screens resumes and tracks hiring pipeline efficiency." />

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <KPICard title="Open Positions" value={metrics?.openPositions ?? 0} icon={Briefcase} />
            <KPICard title="Active Applicants" value={metrics?.activeApplicants ?? 0} icon={Users} />
            <KPICard title="Avg Time to Hire" value={`${(metrics?.avgTimeToHire ?? 0).toFixed(1)}d`} icon={TrendingUp} />
            <KPICard title="Upcoming Interviews" value={metrics?.upcomingInterviews?.length ?? 0} icon={CalendarClock} />
          </div>

          {loading || !metrics ? (
            <div className="text-sm text-app-muted">Loading recruitment dashboard…</div>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
              <div className="xl:col-span-2 space-y-6">
                <div className="rounded-xl border border-app-border bg-app-card p-4">
                  <h3 className="text-sm font-semibold text-app-text mb-4">Funnel Conversion</h3>
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <FunnelChart>
                        <Tooltip />
                        <Funnel dataKey="value" data={funnelData} isAnimationActive>
                          <LabelList position="right" fill="#cbd5e1" stroke="none" dataKey="name" />
                        </Funnel>
                      </FunnelChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="rounded-xl border border-app-border bg-app-card p-4">
                  <h3 className="text-sm font-semibold text-app-text mb-4">Time to Hire Trend</h3>
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={metrics.timeToHireTrend}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                        <XAxis dataKey="month" stroke="#94a3b8" />
                        <YAxis stroke="#94a3b8" />
                        <Tooltip />
                        <Line type="monotone" dataKey="avg_days" stroke="#3b82f6" strokeWidth={2} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="rounded-xl border border-app-border bg-app-card p-4">
                  <h3 className="text-sm font-semibold text-app-text mb-4">Open Positions by Department</h3>
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={metrics.positionsByDepartment}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                        <XAxis dataKey="department" stroke="#94a3b8" />
                        <YAxis stroke="#94a3b8" />
                        <Tooltip />
                        <Bar dataKey="open_positions" fill="#14b8a6" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                <div className="rounded-xl border border-app-border bg-app-card p-4">
                  <h3 className="text-sm font-semibold text-app-text mb-4">Source Effectiveness</h3>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={metrics.sourceEffectiveness} dataKey="count" nameKey="source" innerRadius={45} outerRadius={80}>
                          {metrics.sourceEffectiveness.map((entry, index) => (
                            <Cell key={`${entry.source}-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="rounded-xl border border-app-border bg-app-card p-4">
                  <h3 className="text-sm font-semibold text-app-text mb-4">Upcoming Interviews</h3>
                  <div className="space-y-3">
                    {metrics.upcomingInterviews.length > 0 ? metrics.upcomingInterviews.map((interview) => (
                      <div key={interview.id} className="rounded-lg border border-app-border bg-app-card px-3 py-2">
                        <div className="text-sm text-app-text">{interview.first_name} {interview.last_name || ''}</div>
                        <div className="text-xs text-app-muted">{interview.job_title || 'Interview'} • {interview.scheduled_at}</div>
                      </div>
                    )) : <div className="text-sm text-app-muted">No interviews scheduled this week.</div>}
                  </div>
                </div>

                <div className="rounded-xl border border-app-border bg-app-card p-4">
                  <h3 className="text-sm font-semibold text-app-text mb-4">Offer Acceptance Rate</h3>
                  <div className="h-48">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={[{ name: 'Accepted', rate: Number((metrics.offerAcceptanceRate * 100).toFixed(0)) }]}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                        <XAxis dataKey="name" stroke="#94a3b8" />
                        <YAxis stroke="#94a3b8" />
                        <Tooltip />
                        <Bar dataKey="rate" fill="#8b5cf6" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
