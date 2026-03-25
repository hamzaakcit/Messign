import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useDebouncedCallback } from '@/hooks';
import { Briefcase, Clock3, Plus, Users, Waypoints } from 'lucide-react';
import { DoraInsightBar } from '@/components/dora/DoraInsightBar';
import { KPICard } from '@/components/finance/KPICard';
import { DataTable, type ColumnDef } from '@/components/ui/DataTable';
import { SlideOverPanel } from '@/components/ui/SlideOverPanel';
import { Badge } from '@/components/ui/Badge';
import { useAuthStore } from '@/stores/authStore';
import { recruitmentAPI, type RecruitmentDashboardMetrics, type RecruitmentJob } from '@/lib/recruitmentApi';
import { RecruitmentNav } from './components/RecruitmentNav';
import { JobDetailPanel } from './components/JobDetailPanel';
import { JobCreatePanel } from './components/JobCreatePanel';

function statusVariant(status: string): 'default' | 'blue' | 'purple' | 'green' | 'orange' | 'red' {
  if (status === 'open' || status === 'filled') return 'green';
  if (status === 'paused') return 'orange';
  if (status === 'closed') return 'red';
  return 'default';
}

export function RecruitmentJobsPage() {
  const { user } = useAuthStore();
  const userId = user?.authUserId || user?.id || '';
  const [jobs, setJobs] = useState<RecruitmentJob[]>([]);
  const [metrics, setMetrics] = useState<RecruitmentDashboardMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [filters, setFilters] = useState({
    status: '',
    department: '',
    search: '',
  });
  const [searchDraft, setSearchDraft] = useState('');

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const params: Record<string, string> = { page: String(page + 1), pageSize: '20' };
      if (filters.status) params.status = filters.status;
      if (filters.department) params.department = filters.department;
      if (filters.search) params.search = filters.search;
      const [jobsRes, metricsRes] = await Promise.all([
        recruitmentAPI.listJobs(userId, params),
        recruitmentAPI.getDashboardMetrics(userId),
      ]);
      setJobs(jobsRes.data);
      setTotal(jobsRes.total);
      setMetrics(metricsRes);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load jobs');
    } finally {
      setLoading(false);
    }
  }, [filters, page, userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const debouncedCommitSearch = useDebouncedCallback((search: string) => {
    setFilters((current) => ({ ...current, search }));
    setPage(0);
  }, 300);

  const columns = useMemo<ColumnDef<RecruitmentJob>[]>(() => [
    {
      key: 'title',
      header: 'Title',
      sortable: true,
      render: (_value, row) => <span className="font-medium text-app-text">{row.title}</span>,
    },
    { key: 'department', header: 'Department' },
    { key: 'location_type', header: 'Location Type' },
    {
      key: 'applicant_count',
      header: 'Applicants',
      render: (value) => Number(value ?? 0),
    },
    {
      key: 'positions_count',
      header: 'Positions',
      render: (_value, row) => `${row.positions_filled}/${row.positions_count}`,
    },
    {
      key: 'status',
      header: 'Status',
      render: (value) => <Badge variant={statusVariant(String(value))}>{String(value)}</Badge>,
    },
    {
      key: 'published_at',
      header: 'Posted Date',
      render: (_value, row) => row.published_at || row.created_at.slice(0, 10),
    },
  ], []);

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[1600px] mx-auto px-6 pt-6 pb-4">
          <RecruitmentNav />
          <DoraInsightBar module="recruitment" fallback="Dora screens resumes and tracks hiring pipeline efficiency." />

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <KPICard title="Open Positions" value={metrics?.openPositions ?? 0} icon={Briefcase} />
            <KPICard title="Active Applicants" value={metrics?.activeApplicants ?? 0} icon={Users} />
            <KPICard title="Avg Time to Hire" value={`${(metrics?.avgTimeToHire ?? 0).toFixed(1)} days`} icon={Clock3} />
            <KPICard title="Offer Accept Rate" value={`${((metrics?.offerAcceptanceRate ?? 0) * 100).toFixed(0)}%`} icon={Waypoints} />
          </div>

          <div className="flex items-end justify-between gap-4 mb-4 flex-wrap">
            <div className="flex items-end gap-3 flex-wrap">
              <div>
                <label className="block text-xs text-app-muted mb-1">Status</label>
                <select className="rounded-lg border border-app-border bg-app-card px-3 py-2 text-sm text-app-text" value={filters.status} onChange={(e) => setFilters((current) => ({ ...current, status: e.target.value }))}>
                  <option value="">All</option>
                  <option value="draft">Draft</option>
                  <option value="open">Open</option>
                  <option value="paused">Paused</option>
                  <option value="closed">Closed</option>
                  <option value="filled">Filled</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-app-muted mb-1">Department</label>
                <input className="rounded-lg border border-app-border bg-app-card px-3 py-2 text-sm text-app-text" value={filters.department} onChange={(e) => setFilters((current) => ({ ...current, department: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs text-app-muted mb-1">Search</label>
                <input
                  className="rounded-lg border border-app-border bg-app-card px-3 py-2 text-sm text-app-text"
                  value={searchDraft}
                  onChange={(e) => {
                    const v = e.target.value;
                    setSearchDraft(v);
                    debouncedCommitSearch(v);
                  }}
                  placeholder="Title, department…"
                />
              </div>
            </div>
            <button onClick={() => setCreateOpen(true)} className="px-3 py-2 rounded-lg text-sm font-medium bg-primary-500 text-app-text hover:bg-primary-600 flex items-center gap-1.5">
              <Plus className="w-4 h-4" />
              New Job
            </button>
          </div>

          <DataTable
            data={jobs}
            columns={columns}
            isLoading={loading}
            sortable
            pagination
            pageSize={20}
            totalItems={total}
            currentPage={page}
            onPageChange={setPage}
            onRowClick={(row) => setSelectedJobId(row.id)}
            emptyMessage="No jobs created yet."
          />
        </div>
      </div>

      <SlideOverPanel isOpen={!!selectedJobId} onClose={() => setSelectedJobId(null)} title="Job Detail" width={720}>
        {selectedJobId && <JobDetailPanel jobId={selectedJobId} onUpdated={load} />}
      </SlideOverPanel>

      <SlideOverPanel isOpen={createOpen} onClose={() => setCreateOpen(false)} title="New Job" width={560}>
        <JobCreatePanel onCreated={() => { setCreateOpen(false); void load(); }} onCancel={() => setCreateOpen(false)} />
      </SlideOverPanel>
    </div>
  );
}
