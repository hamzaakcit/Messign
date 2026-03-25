import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { recruitmentAPI, type RecruitmentJob } from '@/lib/recruitmentApi';
import { useAuthStore } from '@/stores/authStore';
import { Badge } from '@/components/ui/Badge';
import { JobAddCandidateSection } from './JobAddCandidateSection';

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
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: '',
    department: '',
    location: '',
    location_type: 'hybrid',
    employment_type: 'full_time',
    description: '',
    requirements: '',
    salary_min: '',
    salary_max: '',
    salary_currency: 'EUR',
    positions_count: '1',
    status: 'draft' as string,
  });

  const load = async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const j = await recruitmentAPI.getJob(userId, jobId);
      setJob(j);
      setForm({
        title: j.title,
        department: j.department || '',
        location: j.location || '',
        location_type: j.location_type || 'hybrid',
        employment_type: j.employment_type || 'full_time',
        description: j.description || '',
        requirements: Array.isArray(j.requirements) ? j.requirements.join(', ') : '',
        salary_min: j.salary_min != null ? String(j.salary_min) : '',
        salary_max: j.salary_max != null ? String(j.salary_max) : '',
        salary_currency: j.salary_currency || 'EUR',
        positions_count: String(j.positions_count ?? 1),
        status: j.status || 'draft',
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load job');
      setJob(null);
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

  const handleSave = async () => {
    if (!userId) return;
    setSaving(true);
    try {
      await recruitmentAPI.updateJob(userId, job.id, {
        title: form.title,
        department: form.department || undefined,
        location: form.location || undefined,
        location_type: form.location_type,
        employment_type: form.employment_type,
        description: form.description || undefined,
        description_html: form.description || undefined,
        requirements: form.requirements
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean),
        salary_min: form.salary_min ? Number(form.salary_min) : undefined,
        salary_max: form.salary_max ? Number(form.salary_max) : undefined,
        salary_currency: form.salary_currency,
        positions_count: Number(form.positions_count || 1),
        status: form.status,
      });
      toast.success('Job updated');
      setEditing(false);
      await load();
      onUpdated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save job');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-lg font-semibold text-app-text">{job.title}</h3>
          <p className="text-sm text-app-muted">
            {job.department || 'Unassigned department'} • {job.location_type}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={statusVariant(job.status)}>{job.status}</Badge>
          <button
            type="button"
            onClick={() => (editing ? setEditing(false) : setEditing(true))}
            className="px-3 py-1.5 rounded-lg text-sm font-medium bg-app-surface-tertiary text-app-text hover:bg-app-hover"
          >
            {editing ? 'Cancel edit' : 'Edit'}
          </button>
        </div>
      </div>

      {editing ? (
        <div className="space-y-4 border border-app-border rounded-xl p-4 bg-app-card/40">
          <div>
            <label className="block text-xs text-app-muted mb-1">Title</label>
            <input
              className="w-full rounded-lg border border-app-border bg-app-card px-3 py-2 text-sm text-app-text"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-app-muted mb-1">Department</label>
              <input
                className="w-full rounded-lg border border-app-border bg-app-card px-3 py-2 text-sm text-app-text"
                value={form.department}
                onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-xs text-app-muted mb-1">Location</label>
              <input
                className="w-full rounded-lg border border-app-border bg-app-card px-3 py-2 text-sm text-app-text"
                value={form.location}
                onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-app-muted mb-1">Location type</label>
              <select
                className="w-full rounded-lg border border-app-border bg-app-card px-3 py-2 text-sm text-app-text"
                value={form.location_type}
                onChange={(e) => setForm((f) => ({ ...f, location_type: e.target.value }))}
              >
                <option value="remote">Remote</option>
                <option value="hybrid">Hybrid</option>
                <option value="onsite">Onsite</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-app-muted mb-1">Employment</label>
              <select
                className="w-full rounded-lg border border-app-border bg-app-card px-3 py-2 text-sm text-app-text"
                value={form.employment_type}
                onChange={(e) => setForm((f) => ({ ...f, employment_type: e.target.value }))}
              >
                <option value="full_time">Full Time</option>
                <option value="part_time">Part Time</option>
                <option value="contract">Contract</option>
                <option value="internship">Internship</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs text-app-muted mb-1">Status</label>
            <select
              className="w-full rounded-lg border border-app-border bg-app-card px-3 py-2 text-sm text-app-text"
              value={form.status}
              onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
            >
              <option value="draft">Draft</option>
              <option value="open">Open</option>
              <option value="paused">Paused</option>
              <option value="closed">Closed</option>
              <option value="filled">Filled</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-app-muted mb-1">Requirements (comma-separated)</label>
            <input
              className="w-full rounded-lg border border-app-border bg-app-card px-3 py-2 text-sm text-app-text"
              value={form.requirements}
              onChange={(e) => setForm((f) => ({ ...f, requirements: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-xs text-app-muted mb-1">Description</label>
            <textarea
              className="w-full min-h-[120px] rounded-lg border border-app-border bg-app-card px-3 py-2 text-sm text-app-text"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-app-muted mb-1">Salary min</label>
              <input
                type="number"
                className="w-full rounded-lg border border-app-border bg-app-card px-3 py-2 text-sm text-app-text"
                value={form.salary_min}
                onChange={(e) => setForm((f) => ({ ...f, salary_min: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-xs text-app-muted mb-1">Salary max</label>
              <input
                type="number"
                className="w-full rounded-lg border border-app-border bg-app-card px-3 py-2 text-sm text-app-text"
                value={form.salary_max}
                onChange={(e) => setForm((f) => ({ ...f, salary_max: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-xs text-app-muted mb-1">Positions</label>
              <input
                type="number"
                min={1}
                className="w-full rounded-lg border border-app-border bg-app-card px-3 py-2 text-sm text-app-text"
                value={form.positions_count}
                onChange={(e) => setForm((f) => ({ ...f, positions_count: e.target.value }))}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="px-3 py-2 rounded-lg text-sm text-app-muted hover:text-app-text"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleSave()}
              className="px-3 py-2 rounded-lg text-sm font-medium bg-primary-500 text-app-text hover:bg-primary-600 disabled:opacity-60"
            >
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-xl border border-app-border bg-app-card p-4">
              <div className="text-xs text-app-muted mb-1">Salary Range</div>
              <div className="text-sm text-app-text">
                {formatCurrency(job.salary_min, job.salary_currency)} - {formatCurrency(job.salary_max, job.salary_currency)}
              </div>
            </div>
            <div className="rounded-xl border border-app-border bg-app-card p-4">
              <div className="text-xs text-app-muted mb-1">Positions</div>
              <div className="text-sm text-app-text">
                {job.positions_filled}/{job.positions_count} filled
              </div>
            </div>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-app-text mb-2">Description</h4>
            <p className="text-sm text-app-muted whitespace-pre-wrap">{job.description || 'No description added yet.'}</p>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-app-text mb-2">Requirements</h4>
            <div className="flex flex-wrap gap-2">
              {requirements.length > 0 ? (
                requirements.map((item) => (
                  <Badge key={item} variant="blue">
                    {item}
                  </Badge>
                ))
              ) : (
                <span className="text-sm text-app-muted">No requirements listed.</span>
              )}
            </div>
          </div>
        </>
      )}

      <JobAddCandidateSection
        userId={userId}
        jobId={job.id}
        onAdded={() => {
          void load().then(() => onUpdated());
        }}
      />

      <div>
        <h4 className="text-sm font-semibold text-app-text mb-2">Applicants</h4>
        <div className="space-y-2">
          {(job.applicants || []).length > 0 ? (
            (job.applicants || []).map((applicant) => (
              <div key={String(applicant.id)} className="rounded-lg border border-app-border bg-app-card px-3 py-2">
                <div className="text-sm text-app-text">
                  {String(applicant.first_name ?? '')} {String(applicant.last_name ?? '')}
                </div>
                <div className="text-xs text-app-muted">
                  {String(applicant.email ?? '')} • {String(applicant.stage ?? 'applied')}
                </div>
              </div>
            ))
          ) : (
            <div className="text-sm text-app-muted">No applicants yet.</div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 pt-2">
        <button
          type="button"
          onClick={() =>
            void (async () => {
              try {
                await recruitmentAPI.publishJob(userId, job.id);
                toast.success('Job published');
                await load();
                onUpdated();
              } catch (e) {
                toast.error(e instanceof Error ? e.message : 'Publish failed');
              }
            })()
          }
          className="px-3 py-2 rounded-lg text-sm font-medium bg-primary-500 text-app-text hover:bg-primary-600"
        >
          Publish
        </button>
        <button
          type="button"
          onClick={() =>
            void (async () => {
              try {
                await recruitmentAPI.closeJob(userId, job.id, 'Closed from detail panel');
                toast.success('Job closed');
                await load();
                onUpdated();
              } catch (e) {
                toast.error(e instanceof Error ? e.message : 'Close failed');
              }
            })()
          }
          className="px-3 py-2 rounded-lg text-sm font-medium bg-app-surface-tertiary text-app-text hover:bg-app-hover"
        >
          Close
        </button>
      </div>
    </div>
  );
}
