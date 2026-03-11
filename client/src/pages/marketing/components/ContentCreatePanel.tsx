import { useEffect, useState } from 'react';
import { marketingAPI, type Campaign } from '@/lib/marketingApi';
import { useAuthStore } from '@/stores/authStore';

interface ContentCreatePanelProps {
  onCreated: () => void;
  onCancel: () => void;
  initialDate?: string;
}

const inputClass =
  'w-full rounded-lg border border-app-border bg-app-card px-3 py-2 text-sm text-app-text focus:outline-none focus:ring-1 focus:ring-primary-500';

export function ContentCreatePanel({ onCreated, onCancel, initialDate }: ContentCreatePanelProps) {
  const { user } = useAuthStore();
  const userId = user?.authUserId || user?.id || '';
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: '',
    content_type: 'blog',
    channel: 'blog',
    campaign_id: '',
    scheduled_date: initialDate ?? '',
    body: '',
    tags: '',
  });

  useEffect(() => {
    if (!userId) return;
    marketingAPI.listCampaigns(userId, { pageSize: '100' }).then((result) => setCampaigns(result.data)).catch(() => setCampaigns([]));
  }, [userId]);

  useEffect(() => {
    if (initialDate) {
      setForm((current) => ({ ...current, scheduled_date: initialDate }));
    }
  }, [initialDate]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!userId) return;
    setSaving(true);
    try {
      await marketingAPI.createContent(userId, {
        ...form,
        campaign_id: form.campaign_id || undefined,
        tags: form.tags.split(',').map((tag) => tag.trim()).filter(Boolean),
      });
      onCreated();
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="p-6 space-y-4">
      <div>
        <label className="block text-sm text-app-muted mb-1">Title</label>
        <input className={inputClass} value={form.title} onChange={(e) => setForm((current) => ({ ...current, title: e.target.value }))} required />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm text-app-muted mb-1">Content Type</label>
          <select className={inputClass} value={form.content_type} onChange={(e) => setForm((current) => ({ ...current, content_type: e.target.value }))}>
            <option value="blog">Blog</option>
            <option value="social">Social</option>
            <option value="email">Email</option>
            <option value="video">Video</option>
            <option value="webinar">Webinar</option>
            <option value="case_study">Case Study</option>
            <option value="whitepaper">Whitepaper</option>
            <option value="podcast">Podcast</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div>
          <label className="block text-sm text-app-muted mb-1">Channel</label>
          <input className={inputClass} value={form.channel} onChange={(e) => setForm((current) => ({ ...current, channel: e.target.value }))} />
        </div>
      </div>
      <div>
        <label className="block text-sm text-app-muted mb-1">Campaign</label>
        <select className={inputClass} value={form.campaign_id} onChange={(e) => setForm((current) => ({ ...current, campaign_id: e.target.value }))}>
          <option value="">No Campaign</option>
          {campaigns.map((campaign) => (
            <option key={campaign.id} value={campaign.id}>{campaign.name}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-sm text-app-muted mb-1">Scheduled Date</label>
        <input className={inputClass} type="date" value={form.scheduled_date} onChange={(e) => setForm((current) => ({ ...current, scheduled_date: e.target.value }))} />
      </div>
      <div>
        <label className="block text-sm text-app-muted mb-1">Body</label>
        <textarea className={`${inputClass} min-h-32`} value={form.body} onChange={(e) => setForm((current) => ({ ...current, body: e.target.value }))} />
      </div>
      <div>
        <label className="block text-sm text-app-muted mb-1">Tags</label>
        <input className={inputClass} value={form.tags} onChange={(e) => setForm((current) => ({ ...current, tags: e.target.value }))} placeholder="brand, launch, nurture" />
      </div>
      <div className="flex items-center justify-end gap-3 pt-2">
        <button type="button" onClick={onCancel} className="px-3 py-2 rounded-lg text-sm text-app-muted hover:text-app-text">
          Cancel
        </button>
        <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg text-sm font-medium bg-primary-500 text-white hover:bg-primary-600 disabled:opacity-50">
          {saving ? 'Saving…' : 'Create Content'}
        </button>
      </div>
    </form>
  );
}
