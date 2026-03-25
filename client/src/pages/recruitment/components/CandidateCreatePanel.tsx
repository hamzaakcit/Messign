import { useState } from 'react';
import { toast } from 'sonner';
import { recruitmentAPI } from '@/lib/recruitmentApi';
import { useAuthStore } from '@/stores/authStore';

interface CandidateCreatePanelProps {
  onCreated: () => void;
  onCancel: () => void;
}

export function CandidateCreatePanel({ onCreated, onCancel }: CandidateCreatePanelProps) {
  const { user } = useAuthStore();
  const userId = user?.authUserId || user?.id || '';
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    current_company: '',
    current_title: '',
    source: '',
  });

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!userId) return;
    setSubmitting(true);
    try {
      await recruitmentAPI.createCandidate(userId, {
        first_name: form.first_name,
        last_name: form.last_name || undefined,
        email: form.email,
        phone: form.phone || undefined,
        current_company: form.current_company || undefined,
        current_title: form.current_title || undefined,
        source: form.source || undefined,
      });
      toast.success('Candidate created');
      onCreated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to create candidate');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="p-6 space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-app-muted mb-1">First name</label>
          <input
            className="w-full rounded-lg border border-app-border bg-app-card px-3 py-2 text-sm text-app-text"
            value={form.first_name}
            onChange={(e) => setForm((c) => ({ ...c, first_name: e.target.value }))}
            required
          />
        </div>
        <div>
          <label className="block text-xs text-app-muted mb-1">Last name</label>
          <input
            className="w-full rounded-lg border border-app-border bg-app-card px-3 py-2 text-sm text-app-text"
            value={form.last_name}
            onChange={(e) => setForm((c) => ({ ...c, last_name: e.target.value }))}
          />
        </div>
      </div>
      <div>
        <label className="block text-xs text-app-muted mb-1">Email</label>
        <input
          type="email"
          className="w-full rounded-lg border border-app-border bg-app-card px-3 py-2 text-sm text-app-text"
          value={form.email}
          onChange={(e) => setForm((c) => ({ ...c, email: e.target.value }))}
          required
        />
      </div>
      <div>
        <label className="block text-xs text-app-muted mb-1">Phone</label>
        <input
          className="w-full rounded-lg border border-app-border bg-app-card px-3 py-2 text-sm text-app-text"
          value={form.phone}
          onChange={(e) => setForm((c) => ({ ...c, phone: e.target.value }))}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-app-muted mb-1">Company</label>
          <input
            className="w-full rounded-lg border border-app-border bg-app-card px-3 py-2 text-sm text-app-text"
            value={form.current_company}
            onChange={(e) => setForm((c) => ({ ...c, current_company: e.target.value }))}
          />
        </div>
        <div>
          <label className="block text-xs text-app-muted mb-1">Title</label>
          <input
            className="w-full rounded-lg border border-app-border bg-app-card px-3 py-2 text-sm text-app-text"
            value={form.current_title}
            onChange={(e) => setForm((c) => ({ ...c, current_title: e.target.value }))}
          />
        </div>
      </div>
      <div>
        <label className="block text-xs text-app-muted mb-1">Source</label>
        <input
          className="w-full rounded-lg border border-app-border bg-app-card px-3 py-2 text-sm text-app-text"
          placeholder="LinkedIn, referral…"
          value={form.source}
          onChange={(e) => setForm((c) => ({ ...c, source: e.target.value }))}
        />
      </div>
      <div className="flex items-center justify-end gap-2 pt-2">
        <button type="button" onClick={onCancel} className="px-3 py-2 rounded-lg text-sm text-app-muted hover:text-app-text">
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="px-3 py-2 rounded-lg text-sm font-medium bg-primary-500 text-app-text hover:bg-primary-600 disabled:opacity-60"
        >
          {submitting ? 'Creating…' : 'Create candidate'}
        </button>
      </div>
    </form>
  );
}
