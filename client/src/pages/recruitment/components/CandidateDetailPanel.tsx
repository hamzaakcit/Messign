import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { recruitmentAPI, type RecruitmentCandidate } from '@/lib/recruitmentApi';
import { useAuthStore } from '@/stores/authStore';
import { API_ORIGIN } from '@/lib/apiCore';

interface CandidateDetailPanelProps {
  candidateId: string;
  onUpdated: () => void;
}

function resumeHref(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return `${API_ORIGIN}${url.startsWith('/') ? '' : '/'}${url}`;
}

export function CandidateDetailPanel({ candidateId, onUpdated }: CandidateDetailPanelProps) {
  const { user } = useAuthStore();
  const userId = user?.authUserId || user?.id || '';
  const [candidate, setCandidate] = useState<RecruitmentCandidate | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    current_company: '',
    current_title: '',
    source: '',
    notes: '',
  });

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const c = await recruitmentAPI.getCandidate(userId, candidateId);
      setCandidate(c);
      setForm({
        first_name: c.first_name,
        last_name: c.last_name || '',
        email: c.email,
        phone: c.phone || '',
        current_company: c.current_company || '',
        current_title: c.current_title || '',
        source: c.source || '',
        notes: c.notes || '',
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load candidate');
      setCandidate(null);
    } finally {
      setLoading(false);
    }
  }, [candidateId, userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSave = async () => {
    if (!userId || !candidate) return;
    setSaving(true);
    try {
      await recruitmentAPI.updateCandidate(userId, candidate.id, {
        first_name: form.first_name,
        last_name: form.last_name || undefined,
        email: form.email,
        phone: form.phone || undefined,
        current_company: form.current_company || undefined,
        current_title: form.current_title || undefined,
        source: form.source || undefined,
        notes: form.notes || undefined,
      });
      toast.success('Candidate updated');
      await load();
      onUpdated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const onResumeFile = async (file: File | null) => {
    if (!file || !userId || !candidate) return;
    setUploading(true);
    try {
      await recruitmentAPI.uploadResume(userId, candidate.id, file);
      toast.success('Resume uploaded');
      await load();
      onUpdated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  if (loading) {
    return <div className="p-6 text-sm text-app-muted">Loading candidate…</div>;
  }
  if (!candidate) {
    return <div className="p-6 text-sm text-app-muted">Candidate not found.</div>;
  }

  const href = resumeHref(candidate.resume_url);

  return (
    <div className="p-6 space-y-5">
      <div>
        <h3 className="text-lg font-semibold text-app-text">
          {candidate.first_name} {candidate.last_name || ''}
        </h3>
        <p className="text-sm text-app-muted">{candidate.email}</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-app-muted mb-1">First name</label>
          <input
            className="w-full rounded-lg border border-app-border bg-app-card px-3 py-2 text-sm text-app-text"
            value={form.first_name}
            onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))}
          />
        </div>
        <div>
          <label className="block text-xs text-app-muted mb-1">Last name</label>
          <input
            className="w-full rounded-lg border border-app-border bg-app-card px-3 py-2 text-sm text-app-text"
            value={form.last_name}
            onChange={(e) => setForm((f) => ({ ...f, last_name: e.target.value }))}
          />
        </div>
      </div>
      <div>
        <label className="block text-xs text-app-muted mb-1">Email</label>
        <input
          type="email"
          className="w-full rounded-lg border border-app-border bg-app-card px-3 py-2 text-sm text-app-text"
          value={form.email}
          onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
        />
      </div>
      <div>
        <label className="block text-xs text-app-muted mb-1">Phone</label>
        <input
          className="w-full rounded-lg border border-app-border bg-app-card px-3 py-2 text-sm text-app-text"
          value={form.phone}
          onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-app-muted mb-1">Company</label>
          <input
            className="w-full rounded-lg border border-app-border bg-app-card px-3 py-2 text-sm text-app-text"
            value={form.current_company}
            onChange={(e) => setForm((f) => ({ ...f, current_company: e.target.value }))}
          />
        </div>
        <div>
          <label className="block text-xs text-app-muted mb-1">Title</label>
          <input
            className="w-full rounded-lg border border-app-border bg-app-card px-3 py-2 text-sm text-app-text"
            value={form.current_title}
            onChange={(e) => setForm((f) => ({ ...f, current_title: e.target.value }))}
          />
        </div>
      </div>
      <div>
        <label className="block text-xs text-app-muted mb-1">Source</label>
        <input
          className="w-full rounded-lg border border-app-border bg-app-card px-3 py-2 text-sm text-app-text"
          value={form.source}
          onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))}
        />
      </div>
      <div>
        <label className="block text-xs text-app-muted mb-1">Notes</label>
        <textarea
          className="w-full min-h-[80px] rounded-lg border border-app-border bg-app-card px-3 py-2 text-sm text-app-text"
          value={form.notes}
          onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
        />
      </div>

      <div className="rounded-xl border border-app-border bg-app-card p-4 space-y-2">
        <div className="text-xs text-app-muted">Resume</div>
        {href ? (
          <a href={href} target="_blank" rel="noreferrer" className="text-sm text-primary-300 hover:underline">
            Open resume ({candidate.resume_file_name || 'file'})
          </a>
        ) : (
          <p className="text-sm text-app-muted">No resume on file.</p>
        )}
        <div>
          <label className="block text-xs text-app-muted mb-1">Upload / replace</label>
          <input
            type="file"
            accept=".pdf,.doc,.docx,.txt,application/pdf"
            disabled={uploading}
            onChange={(e) => void onResumeFile(e.target.files?.[0] ?? null)}
            className="text-sm text-app-text"
          />
        </div>
      </div>

      <button
        type="button"
        disabled={saving}
        onClick={() => void handleSave()}
        className="w-full px-3 py-2 rounded-lg text-sm font-medium bg-primary-500 text-app-text hover:bg-primary-600 disabled:opacity-60"
      >
        {saving ? 'Saving…' : 'Save changes'}
      </button>
    </div>
  );
}
