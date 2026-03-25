import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarClock } from 'lucide-react';
import { toast } from 'sonner';
import { DoraInsightBar } from '@/components/dora/DoraInsightBar';
import { KPICard } from '@/components/finance/KPICard';
import { DataTable, type ColumnDef } from '@/components/ui/DataTable';
import { Badge } from '@/components/ui/Badge';
import { useAuthStore } from '@/stores/authStore';
import { recruitmentAPI, type RecruitmentInterview } from '@/lib/recruitmentApi';
import { RecruitmentNav } from './components/RecruitmentNav';
import { getCurrentWeekRange, isDateInRange } from './interviewMetrics';

function statusVariant(status: string): 'default' | 'blue' | 'purple' | 'green' | 'orange' | 'red' {
  if (status === 'completed') return 'green';
  if (status === 'scheduled') return 'blue';
  if (status === 'cancelled' || status === 'no_show') return 'red';
  return 'default';
}

const RECOMMENDATIONS = ['strong_yes', 'yes', 'neutral', 'no', 'strong_no'] as const;

export function RecruitmentInterviewsPage() {
  const { user } = useAuthStore();
  const userId = user?.authUserId || user?.id || '';
  const [interviews, setInterviews] = useState<RecruitmentInterview[]>([]);
  const [loading, setLoading] = useState(true);

  /** Bound interview list to recent window (scheduled_at) to keep payload reasonable; KPIs still use this set. */
  const listDateFromIso = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 120);
    return d.toISOString();
  }, []);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const result = await recruitmentAPI.listInterviews(userId, { dateFrom: listDateFromIso });
      setInterviews(result.data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load interviews');
    } finally {
      setLoading(false);
    }
  }, [userId, listDateFromIso]);

  useEffect(() => {
    void load();
  }, [load]);

  const weekRange = useMemo(() => getCurrentWeekRange(), []);

  const upcomingCount = useMemo(
    () =>
      interviews.filter(
        (item) => item.status === 'scheduled' && new Date(item.scheduled_at).getTime() >= Date.now(),
      ).length,
    [interviews],
  );

  const completedThisWeekCount = useMemo(
    () =>
      interviews.filter(
        (item) =>
          item.status === 'completed' &&
          item.completed_at != null &&
          isDateInRange(item.completed_at, weekRange),
      ).length,
    [interviews, weekRange],
  );

  const ratedInterviews = useMemo(() => interviews.filter((item) => item.rating != null), [interviews]);
  const avgRating = useMemo(() => {
    if (ratedInterviews.length === 0) return '—';
    const sum = ratedInterviews.reduce((s, item) => s + Number(item.rating ?? 0), 0);
    return (sum / ratedInterviews.length).toFixed(1);
  }, [ratedInterviews]);

  const columns = useMemo<ColumnDef<RecruitmentInterview>[]>(() => [
    { key: 'job_title', header: 'Role' },
    {
      key: 'first_name',
      header: 'Candidate',
      render: (_value, row) => (
        <span className="font-medium text-app-text">
          {row.first_name} {row.last_name || ''}
        </span>
      ),
    },
    { key: 'interviewer_name', header: 'Interviewer' },
    { key: 'interview_type', header: 'Type' },
    { key: 'scheduled_at', header: 'Scheduled' },
    {
      key: 'status',
      header: 'Status',
      render: (value) => <Badge variant={statusVariant(String(value))}>{String(value)}</Badge>,
    },
    {
      key: 'id',
      header: 'Actions',
      render: (_value, row) => (
        <InterviewActionsRow interview={row} userId={userId} onDone={load} />
      ),
    },
  ], [userId, load]);

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[1600px] mx-auto px-6 pt-6 pb-4">
          <RecruitmentNav />
          <DoraInsightBar module="recruitment" fallback="Dora screens resumes and tracks hiring pipeline efficiency." />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <KPICard title="Upcoming Interviews" value={upcomingCount} icon={CalendarClock} />
            <KPICard title="Completed This Week" value={completedThisWeekCount} icon={CalendarClock} />
            <KPICard title="Average Rating" value={avgRating} icon={CalendarClock} />
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

function InterviewActionsRow({
  interview,
  userId,
  onDone,
}: {
  interview: RecruitmentInterview;
  userId: string;
  onDone: () => void;
}) {
  const [rating, setRating] = useState(String(interview.rating ?? 3));
  const [recommendation, setRecommendation] = useState<string>(
    interview.recommendation && (RECOMMENDATIONS as readonly string[]).includes(interview.recommendation)
      ? interview.recommendation
      : 'neutral',
  );

  if (interview.status !== 'scheduled') {
    return <span className="text-xs text-app-muted">—</span>;
  }

  return (
    <div className="flex flex-wrap gap-1 items-center">
      <select
        className="rounded border border-app-border bg-app-card px-1 py-0.5 text-[11px] text-app-text max-w-[52px]"
        value={rating}
        onChange={(e) => setRating(e.target.value)}
        aria-label="Rating"
      >
        {[1, 2, 3, 4, 5].map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
      <select
        className="rounded border border-app-border bg-app-card px-1 py-0.5 text-[11px] text-app-text max-w-[88px]"
        value={recommendation}
        onChange={(e) => setRecommendation(e.target.value)}
        aria-label="Recommendation"
      >
        {RECOMMENDATIONS.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="text-[11px] px-1.5 py-0.5 rounded bg-primary-500/80 text-app-text"
        onClick={() =>
          void (async () => {
            try {
              await recruitmentAPI.completeInterview(userId, interview.id, {
                rating: Number(rating),
                recommendation,
              });
              toast.success('Interview completed');
              onDone();
            } catch (e) {
              toast.error(e instanceof Error ? e.message : 'Failed to complete');
            }
          })()
        }
      >
        Done
      </button>
      <button
        type="button"
        className="text-[11px] px-1.5 py-0.5 rounded bg-app-surface-tertiary text-app-text"
        onClick={() =>
          void (async () => {
            const notes = window.prompt('Cancel notes (optional)') ?? undefined;
            try {
              await recruitmentAPI.cancelInterview(userId, interview.id, notes);
              toast.success('Interview cancelled');
              onDone();
            } catch (e) {
              toast.error(e instanceof Error ? e.message : 'Failed to cancel');
            }
          })()
        }
      >
        Cancel
      </button>
    </div>
  );
}
