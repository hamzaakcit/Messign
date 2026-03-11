import { useState } from 'react';
import { recruitmentAPI } from '@/lib/recruitmentApi';
import { useAuthStore } from '@/stores/authStore';

interface JobCreatePanelProps {
  onCreated: () => void;
  onCancel: () => void;
}

export function JobCreatePanel({ onCreated, onCancel }: JobCreatePanelProps) {
  const { user } = useAuthStore();
  const userId = user?.authUserId || user?.id || '';
  const [submitting, setSubmitting] = useState(false);
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
    positions_count: '1',
  });

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!userId) return;
    setSubmitting(true);
    try {
      await recruitmentAPI.createJob(userId, {
        title: form.title,
        department: form.department || undefined,
        location: form.location || undefined,
        location_type: form.location_type,
        employment_type: form.employment_type,
        description: form.description || undefined,
        description_html: form.description || undefined,
        requirements: form.requirements.split(',').map((item) => item.trim()).filter(Boolean),
        salary_min: form.salary_min ? Number(form.salary_min) : undefined,
        salary_max: form.salary_max ? Number(form.salary_max) : undefined,
        positions_count: Number(form.positions_count || 1),
        status: 'draft',
      });
      onCreated();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="p-6 space-y-4">
      <div>
        <label className="block text-xs text-app-muted mb-1">Title</label>
        <input className="w-full rounded-lg border border-app-border bg-app-card px-3 py-2 text-sm text-app-text" value={form.title} onChange={(e) => setForm((current) => ({ ...current, title: e.target.value }))} required />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-app-muted mb-1">Department</label>
          <input className="w-full rounded-lg border border-app-border bg-app-card px-3 py-2 text-sm text-app-text" value={form.department} onChange={(e) => setForm((current) => ({ ...current, department: e.target.value }))} />
        </div>
        <div>
          <label className="block text-xs text-app-muted mb-1">Location</label>
          <input className="w-full rounded-lg border border-app-border bg-app-card px-3 py-2 text-sm text-app-text" value={form.location} onChange={(e) => setForm((current) => ({ ...current, location: e.target.value }))} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-app-muted mb-1">Location Type</label>
          <select className="w-full rounded-lg border border-app-border bg-app-card px-3 py-2 text-sm text-app-text" value={form.location_type} onChange={(e) => setForm((current) => ({ ...current, location_type: e.target.value }))}>
            <option value="remote">Remote</option>
            <option value="hybrid">Hybrid</option>
            <option value="onsite">Onsite</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-app-muted mb-1">Employment Type</label>
          <select className="w-full rounded-lg border border-app-border bg-app-card px-3 py-2 text-sm text-app-text" value={form.employment_type} onChange={(e) => setForm((current) => ({ ...current, employment_type: e.target.value }))}>
            <option value="full_time">Full Time</option>
            <option value="part_time">Part Time</option>
            <option value="contract">Contract</option>
            <option value="internship">Internship</option>
          </select>
        </div>
      </div>
      <div>
        <label className="block text-xs text-app-muted mb-1">Requirements</label>
        <input className="w-full rounded-lg border border-app-border bg-app-card px-3 py-2 text-sm text-app-text" placeholder="React, TypeScript, Hiring experience" value={form.requirements} onChange={(e) => setForm((current) => ({ ...current, requirements: e.target.value }))} />
      </div>
      <div>
        <label className="block text-xs text-app-muted mb-1">Description</label>
        <textarea className="w-full min-h-[160px] rounded-lg border border-app-border bg-app-card px-3 py-2 text-sm text-app-text" value={form.description} onChange={(e) => setForm((current) => ({ ...current, description: e.target.value }))} />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-xs text-app-muted mb-1">Salary Min</label>
          <input type="number" className="w-full rounded-lg border border-app-border bg-app-card px-3 py-2 text-sm text-app-text" value={form.salary_min} onChange={(e) => setForm((current) => ({ ...current, salary_min: e.target.value }))} />
        </div>
        <div>
          <label className="block text-xs text-app-muted mb-1">Salary Max</label>
          <input type="number" className="w-full rounded-lg border border-app-border bg-app-card px-3 py-2 text-sm text-app-text" value={form.salary_max} onChange={(e) => setForm((current) => ({ ...current, salary_max: e.target.value }))} />
        </div>
        <div>
          <label className="block text-xs text-app-muted mb-1">Positions</label>
          <input type="number" min={1} className="w-full rounded-lg border border-app-border bg-app-card px-3 py-2 text-sm text-app-text" value={form.positions_count} onChange={(e) => setForm((current) => ({ ...current, positions_count: e.target.value }))} />
        </div>
      </div>
      <div className="flex items-center justify-end gap-2 pt-2">
        <button type="button" onClick={onCancel} className="px-3 py-2 rounded-lg text-sm text-app-muted hover:text-app-text">Cancel</button>
        <button type="submit" disabled={submitting} className="px-3 py-2 rounded-lg text-sm font-medium bg-primary-500 text-white hover:bg-primary-600 disabled:opacity-60">
          {submitting ? 'Creating…' : 'Create Job'}
        </button>
      </div>
    </form>
  );
}
