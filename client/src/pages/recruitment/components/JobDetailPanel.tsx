import { useEffect, useState } from 'react';
import { recruitmentAPI, type RecruitmentJob } from '@/lib/recruitmentApi';
import { useAuthStore } from '@/stores/authStore';
import { Badge } from '@/components/ui/Badge';

interface JobDetailPanelProps {
  jobId: string;
  onUpdated: () => void;
}

function formatCurrency(value: number | null | undefined, currency = 'EUR') {
  return new Intl.NumberFormat('en-IE', { style: 'currency', currency }).format(value || 0);
}

function statusVariant(status: string): 'default' | 'blue' | 'purple' | 'green' | 'orange' | 'red' {
  if (status === 'open' || status === 'filled') return 'green';
  if (status === 'paused') return 'orange';
  if (status === 'closed') return 'red';
  return 'default';
}

export function JobDetailPanel({ jobId, onUpdated }: JobDetailPanelProps) {
  const { user } = useAuthStore();
  const userId = user?.authUserId || user?.id || '';
  const [job, setJob] = useState<RecruitmentJob | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!userId) return;
    setLoading(true);
    try {
      setJob(await recruitmentAPI.getJob(userId, jobId));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [jobId, userId]);

  if (loading) {
    return <div className="p-6 text-sm text-app-muted">Loading job…</div>;
  }
  if (!job) {
    return <div className="p-6 text-sm text-app-muted">Job not found.</div>;
  }

  const requirements = Array.isArray(job.requirements) ? job.requirements : [];

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-app-text">{job.title}</h3>
          <p className="text-sm text-app-muted">{job.department || 'Unassigned department'} • {job.location_type}</p>
        </div>
        <Badge variant={statusVariant(job.status)}>{job.status}</Badge>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-xl border border-app-border bg-app-card p-4">
          <div className="text-xs text-app-muted mb-1">Salary Range</div>
          <div className="text-sm text-app-text">{formatCurrency(job.salary_min, job.salary_currency)} - {formatCurrency(job.salary_max, job.salary_currency)}</div>
        </div>
        <div className="rounded-xl border border-app-border bg-app-card p-4">
          <div className="text-xs text-app-muted mb-1">Positions</div>
          <div className="text-sm text-app-text">{job.positions_filled}/{job.positions_count} filled</div>
        </div>
      </div>

      <div>
        <h4 className="text-sm font-semibold text-app-text mb-2">Description</h4>
        <p className="text-sm text-app-muted whitespace-pre-wrap">{job.description || 'No description added yet.'}</p>
      </div>

      <div>
        <h4 className="text-sm font-semibold text-app-text mb-2">Requirements</h4>
        <div className="flex flex-wrap gap-2">
          {requirements.length > 0 ? requirements.map((item) => (
            <Badge key={item} variant="blue">{item}</Badge>
          )) : <span className="text-sm text-app-muted">No requirements listed.</span>}
        </div>
      </div>

      <div>
        <h4 className="text-sm font-semibold text-app-text mb-2">Applicants</h4>
        <div className="space-y-2">
          {(job.applicants || []).length > 0 ? (job.applicants || []).map((applicant) => (
            <div key={String(applicant.id)} className="rounded-lg border border-app-border bg-app-card px-3 py-2">
              <div className="text-sm text-app-text">{String(applicant.first_name ?? '')} {String(applicant.last_name ?? '')}</div>
              <div className="text-xs text-app-muted">{String(applicant.email ?? '')} • {String(applicant.stage ?? 'applied')}</div>
            </div>
          )) : <div className="text-sm text-app-muted">No applicants yet.</div>}
        </div>
      </div>

      <div className="flex items-center gap-2 pt-2">
        <button
          onClick={async () => {
            await recruitmentAPI.publishJob(userId, job.id);
            await load();
            onUpdated();
          }}
          className="px-3 py-2 rounded-lg text-sm font-medium bg-primary-500 text-app-text hover:bg-primary-600"
        >
          Publish
        </button>
        <button
          onClick={async () => {
            await recruitmentAPI.closeJob(userId, job.id, 'Closed from detail panel');
            await load();
            onUpdated();
          }}
          className="px-3 py-2 rounded-lg text-sm font-medium bg-white/5 text-app-text hover:bg-white/10"
        >
          Close
        </button>
      </div>
    </div>
  );
}
