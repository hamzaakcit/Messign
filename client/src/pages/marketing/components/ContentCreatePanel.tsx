import { useEffect, useState } from 'react';
import { marketingAPI, type Campaign } from '@/lib/marketingApi';
import { useAuthStore } from '@/stores/authStore';
import { BrandSelector } from './BrandSelector';

/** Preset for new content rows (e.g. Instagram social). */
export type ContentCreatePreset = 'default' | 'instagram';

interface ContentCreatePanelProps {
  onCreated: () => void;
  onCancel: () => void;
  initialDate?: string;
  /** When `instagram`, sets social + channel for IG drafts. */
  preset?: ContentCreatePreset;
  /** Opens Lucy Marketing + Instagram agent flow (parent wires). */
  onDraftWithMarketingAgent?: () => void;
}

const inputClass =
  'w-full rounded-lg border border-app-border bg-app-card px-3 py-2 text-sm text-app-text focus:outline-none focus:ring-1 focus:ring-primary-500';

export function ContentCreatePanel({
  onCreated,
  onCancel,
  initialDate,
  preset = 'default',
  onDraftWithMarketingAgent,
}: ContentCreatePanelProps): JSX.Element {
  const { user } = useAuthStore();
  const userId = user?.authUserId || user?.id || '';
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: '',
    content_type: 'blog',
    channel: 'blog',
    campaign_id: '',
    brand_profile_id: '',
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

  useEffect(() => {
    if (preset === 'instagram') {
      setForm((current) => ({
        ...current,
        content_type: 'social',
        channel: 'instagram',
        tags: current.tags ? current.tags : 'instagram, social',
      }));
    }
  }, [preset]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!userId) return;
    setSaving(true);
    try {
      await marketingAPI.createContent(userId, {
        ...form,
        campaign_id: form.campaign_id || undefined,
        brand_profile_id: form.brand_profile_id || undefined,
        tags: form.tags.split(',').map((tag) => tag.trim()).filter(Boolean),
      });
      onCreated();
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="p-6 space-y-4">
      {preset === 'instagram' && (
        <div className="rounded-lg border border-pink-500/25 bg-pink-500/10 px-3 py-2 text-xs text-app-text">
          <span className="font-medium text-pink-200">Instagram draft</span>
          {' — '}
          Saved as workspace content. Schedule and publish from the board or calendar; live posting uses your connected accounts in the Marketing hub.
        </div>
      )}
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
          <input
            className={inputClass}
            value={form.channel}
            onChange={(e) => setForm((current) => ({ ...current, channel: e.target.value }))}
            placeholder="instagram, linkedin, …"
          />
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
        <label className="block text-sm text-app-muted mb-1">Brand</label>
        <BrandSelector
          selectedBrandId={form.brand_profile_id || null}
          onBrandChange={(id) => setForm((current) => ({ ...current, brand_profile_id: id || '' }))}
        />
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
      {onDraftWithMarketingAgent && (
        <div className="pt-1">
          <button
            type="button"
            onClick={() => onDraftWithMarketingAgent()}
            className="w-full rounded-lg border border-primary-500/40 bg-primary-500/10 px-3 py-2 text-sm font-medium text-primary-200 hover:bg-primary-500/20"
          >
            Draft with Marketing agent (Lucy)
          </button>
          <p className="mt-1.5 text-[11px] text-app-muted">Opens Lucy with the Instagram prompt helper. Paste the result into the body when ready.</p>
        </div>
      )}
      <div className="flex items-center justify-end gap-3 pt-2">
        <button type="button" onClick={onCancel} className="px-3 py-2 rounded-lg text-sm text-app-muted hover:text-app-text">
          Cancel
        </button>
        <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg text-sm font-medium bg-primary-500 text-app-text hover:bg-primary-600 disabled:opacity-50">
          {saving ? 'Saving…' : 'Create Content'}
        </button>
      </div>
    </form>
  );
}
