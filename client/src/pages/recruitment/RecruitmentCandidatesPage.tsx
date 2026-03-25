import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Users } from 'lucide-react';
import { toast } from 'sonner';
import { useDebouncedCallback } from '@/hooks';
import { DoraInsightBar } from '@/components/dora/DoraInsightBar';
import { KPICard } from '@/components/finance/KPICard';
import { DataTable, type ColumnDef } from '@/components/ui/DataTable';
import { SlideOverPanel } from '@/components/ui/SlideOverPanel';
import { Badge } from '@/components/ui/Badge';
import { useAuthStore } from '@/stores/authStore';
import {
  recruitmentAPI,
  type CandidatePoolMetrics,
  type RecruitmentCandidate,
} from '@/lib/recruitmentApi';
import { RecruitmentNav } from './components/RecruitmentNav';
import { CandidateCreatePanel } from './components/CandidateCreatePanel';
import { CandidateDetailPanel } from './components/CandidateDetailPanel';
import { publicResumeUrl } from './resumeUrl';

export function RecruitmentCandidatesPage() {
  const { user } = useAuthStore();
  const userId = user?.authUserId || user?.id || '';
  const [candidates, setCandidates] = useState<RecruitmentCandidate[]>([]);
  const [poolMetrics, setPoolMetrics] = useState<CandidatePoolMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [listSearch, setListSearch] = useState('');

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const params: Record<string, string> = {
        page: String(page + 1),
        pageSize: '20',
      };
      if (listSearch.trim()) params.search = listSearch.trim();
      const [result, metrics] = await Promise.all([
        recruitmentAPI.listCandidates(userId, params),
        recruitmentAPI.getCandidatePoolMetrics(userId),
      ]);
      setCandidates(result.data);
      setTotal(result.total);
      setPoolMetrics(metrics);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load candidates');
    } finally {
      setLoading(false);
    }
  }, [page, userId, listSearch]);

  useEffect(() => {
    void load();
  }, [load]);

  const debouncedCommitSearch = useDebouncedCallback((search: string) => {
    setListSearch(search);
    setPage(0);
  }, 300);

  const columns = useMemo<ColumnDef<RecruitmentCandidate>[]>(() => [
    {
      key: 'first_name',
      header: 'Name',
      render: (_value, row) => (
        <span className="font-medium text-app-text">
          {row.first_name} {row.last_name || ''}
        </span>
      ),
    },
    { key: 'email', header: 'Email' },
    { key: 'current_company', header: 'Company' },
    { key: 'current_title', header: 'Title' },
    {
      key: 'source',
      header: 'Source',
      render: (value) => <Badge variant="blue">{String(value || 'unknown')}</Badge>,
    },
    {
      key: 'resume_url',
      header: 'Resume',
      render: (value) => {
        const href = publicResumeUrl(value != null ? String(value) : null);
        return href ? (
          <a href={href} target="_blank" rel="noreferrer" className="text-primary-300 hover:underline">
            Open
          </a>
        ) : (
          <span className="text-app-muted">Missing</span>
        );
      },
    },
  ], []);

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[1600px] mx-auto px-6 pt-6 pb-4">
          <RecruitmentNav />
          <DoraInsightBar module="recruitment" fallback="Dora screens resumes and tracks hiring pipeline efficiency." />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <KPICard title="Candidate Pool" value={poolMetrics?.total ?? total} icon={Users} />
            <KPICard title="With Resume" value={poolMetrics?.withResume ?? 0} icon={Users} />
            <KPICard title="AI Parsed" value={poolMetrics?.aiParsed ?? 0} icon={Users} />
          </div>
          <div className="flex justify-end mb-4">
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="px-3 py-2 rounded-lg text-sm font-medium bg-primary-500 text-app-text hover:bg-primary-600 flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              Add candidate
            </button>
          </div>
          <DataTable
            data={candidates}
            columns={columns}
            isLoading={loading}
            searchable
            searchPlaceholder="Search candidates…"
            onSearch={debouncedCommitSearch}
            pagination
            pageSize={20}
            totalItems={total}
            currentPage={page}
            onPageChange={setPage}
            onRowClick={(row) => setSelectedId(row.id)}
            emptyMessage="No candidates yet."
          />
        </div>
      </div>

      <SlideOverPanel isOpen={!!selectedId} onClose={() => setSelectedId(null)} title="Candidate" width={560}>
        {selectedId && (
          <CandidateDetailPanel
            candidateId={selectedId}
            onUpdated={() => {
              void load();
            }}
          />
        )}
      </SlideOverPanel>

      <SlideOverPanel isOpen={createOpen} onClose={() => setCreateOpen(false)} title="New candidate" width={520}>
        <CandidateCreatePanel
          onCreated={() => {
            setCreateOpen(false);
            void load();
          }}
          onCancel={() => setCreateOpen(false)}
        />
      </SlideOverPanel>
    </div>
  );
}
