import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarClock } from 'lucide-react';
import { DoraInsightBar } from '@/components/dora/DoraInsightBar';
import { KPICard } from '@/components/finance/KPICard';
import { DataTable, type ColumnDef } from '@/components/ui/DataTable';
import { Badge } from '@/components/ui/Badge';
import { useAuthStore } from '@/stores/authStore';
import { recruitmentAPI, type RecruitmentInterview } from '@/lib/recruitmentApi';
import { RecruitmentNav } from './components/RecruitmentNav';

function statusVariant(status: string): 'default' | 'blue' | 'purple' | 'green' | 'orange' | 'red' {
  if (status === 'completed') return 'green';
  if (status === 'scheduled') return 'blue';
  if (status === 'cancelled' || status === 'no_show') return 'red';
  return 'default';
}

export function RecruitmentInterviewsPage() {
  const { user } = useAuthStore();
  const userId = user?.authUserId || user?.id || '';
  const [interviews, setInterviews] = useState<RecruitmentInterview[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const result = await recruitmentAPI.listInterviews(userId);
      setInterviews(result.data);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const columns = useMemo<ColumnDef<RecruitmentInterview>[]>(() => [
    { key: 'job_title', header: 'Role' },
    {
      key: 'first_name',
      header: 'Candidate',
      render: (_value, row) => <span className="font-medium text-app-text">{row.first_name} {row.last_name || ''}</span>,
    },
    { key: 'interviewer_name', header: 'Interviewer' },
    { key: 'interview_type', header: 'Type' },
    { key: 'scheduled_at', header: 'Scheduled' },
    {
      key: 'status',
      header: 'Status',
      render: (value) => <Badge variant={statusVariant(String(value))}>{String(value)}</Badge>,
    },
  ], []);

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[1600px] mx-auto px-6 pt-6 pb-4">
          <RecruitmentNav />
          <DoraInsightBar module="recruitment" fallback="Dora screens resumes and tracks hiring pipeline efficiency." />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <KPICard title="Upcoming Interviews" value={interviews.filter((item) => item.status === 'scheduled').length} icon={CalendarClock} />
            <KPICard title="Completed This Week" value={interviews.filter((item) => item.status === 'completed').length} icon={CalendarClock} />
            <KPICard title="Average Rating" value={(interviews.filter((item) => item.rating).reduce((sum, item) => sum + Number(item.rating || 0), 0) / Math.max(1, interviews.filter((item) => item.rating).length)).toFixed(1)} icon={CalendarClock} />
          </div>
          <DataTable
            data={interviews}
            columns={columns}
            isLoading={loading}
            searchable
            searchPlaceholder="Search interviews…"
            pagination={false}
            emptyMessage="No interviews scheduled."
          />
        </div>
      </div>
    </div>
  );
}
