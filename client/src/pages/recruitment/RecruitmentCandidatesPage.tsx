import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDebouncedCallback } from '@/hooks';
import { Users } from 'lucide-react';
import { DoraInsightBar } from '@/components/dora/DoraInsightBar';
import { KPICard } from '@/components/finance/KPICard';
import { DataTable, type ColumnDef } from '@/components/ui/DataTable';
import { Badge } from '@/components/ui/Badge';
import { useAuthStore } from '@/stores/authStore';
import { recruitmentAPI, type RecruitmentCandidate } from '@/lib/recruitmentApi';
import { RecruitmentNav } from './components/RecruitmentNav';

export function RecruitmentCandidatesPage() {
  const { user } = useAuthStore();
  const userId = user?.authUserId || user?.id || '';
  const [candidates, setCandidates] = useState<RecruitmentCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const result = await recruitmentAPI.listCandidates(userId, {
        page: String(page + 1),
        pageSize: '20',
      });
      setCandidates(result.data);
      setTotal(result.total);
    } finally {
      setLoading(false);
    }
  }, [page, userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const debouncedSearch = useDebouncedCallback(async (search: string) => {
    if (!userId) return;
    setPage(0);
    setLoading(true);
    try {
      const result = await recruitmentAPI.listCandidates(userId, { page: '1', pageSize: '20', search });
      setCandidates(result.data);
      setTotal(result.total);
    } finally {
      setLoading(false);
    }
  }, 300);

  const columns = useMemo<ColumnDef<RecruitmentCandidate>[]>(() => [
    {
      key: 'first_name',
      header: 'Name',
      render: (_value, row) => <span className="font-medium text-app-text">{row.first_name} {row.last_name || ''}</span>,
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
      render: (value) => value ? <a href={String(value)} target="_blank" rel="noreferrer" className="text-primary-300 hover:underline">Open</a> : <span className="text-app-muted">Missing</span>,
    },
  ], []);

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[1600px] mx-auto px-6 pt-6 pb-4">
          <RecruitmentNav />
          <DoraInsightBar module="recruitment" fallback="Dora screens resumes and tracks hiring pipeline efficiency." />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <KPICard title="Candidate Pool" value={total} icon={Users} />
            <KPICard title="With Resume" value={candidates.filter((candidate) => candidate.resume_url).length} icon={Users} />
            <KPICard title="AI Parsed" value={candidates.filter((candidate) => Object.keys(candidate.resume_parsed || {}).length > 0).length} icon={Users} />
          </div>
          <DataTable
            data={candidates}
            columns={columns}
            isLoading={loading}
            searchable
            searchPlaceholder="Search candidates…"
            onSearch={debouncedSearch}
            pagination
            pageSize={20}
            totalItems={total}
            currentPage={page}
            onPageChange={setPage}
            emptyMessage="No candidates yet."
          />
        </div>
      </div>
    </div>
  );
}
