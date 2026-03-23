import { useState } from 'react';
import { marketingAPI } from '@/lib/marketingApi';
import { useAuthStore } from '@/stores/authStore';
import { BrandSelector } from './BrandSelector';

interface CampaignCreatePanelProps {
  onCreated: () => void;
  onCancel: () => void;
}

const inputClass =
  'w-full rounded-lg border border-app-border bg-app-card px-3 py-2 text-sm text-app-text focus:outline-none focus:ring-1 focus:ring-primary-500';

export function CampaignCreatePanel({ onCreated, onCancel }: CampaignCreatePanelProps) {
  const { user } = useAuthStore();
  const userId = user?.authUserId || user?.id || '';
  const [form, setForm] = useState({
    name: '',
    channel: 'email',
    budget: '',
    brand_profile_id: '',
    start_date: '',
    end_date: '',
    description: '',
    goals: '',
    target_audience: '',
  });
  const [saving, setSaving] = useState(false);

  const handleChange = (key: string, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!userId) return;
    setSaving(true);
    try {
      const { brand_profile_id: _brandId, ...campaignFields } = form;
      await marketingAPI.createCampaign(userId, {
        ...campaignFields,
        budget: Number(form.budget || 0),
      });
      onCreated();
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="p-6 space-y-4">
      <div>
        <label className="block text-sm text-app-muted mb-1">Name</label>
        <input className={inputClass} value={form.name} onChange={(e) => handleChange('name', e.target.value)} required />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm text-app-muted mb-1">Channel</label>
          <select className={inputClass} value={form.channel} onChange={(e) => handleChange('channel', e.target.value)}>
            <option value="email">Email</option>
            <option value="social">Social</option>
            <option value="paid_search">Paid Search</option>
            <option value="paid_social">Paid Social</option>
            <option value="content">Content</option>
            <option value="webinar">Webinar</option>
            <option value="event">Event</option>
            <option value="referral">Referral</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div>
          <label className="block text-sm text-app-muted mb-1">Budget</label>
          <input className={inputClass} type="number" value={form.budget} onChange={(e) => handleChange('budget', e.target.value)} />
        </div>
      </div>
      <div>
        <label className="block text-sm text-app-muted mb-1">Brand</label>
        <BrandSelector
          selectedBrandId={form.brand_profile_id || null}
          onBrandChange={(id) => handleChange('brand_profile_id', id || '')}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm text-app-muted mb-1">Start Date</label>
          <input className={inputClass} type="date" value={form.start_date} onChange={(e) => handleChange('start_date', e.target.value)} />
        </div>
        <div>
          <label className="block text-sm text-app-muted mb-1">End Date</label>
          <input className={inputClass} type="date" value={form.end_date} onChange={(e) => handleChange('end_date', e.target.value)} />
        </div>
      </div>
      <div>
        <label className="block text-sm text-app-muted mb-1">Description</label>
        <textarea className={`${inputClass} min-h-24`} value={form.description} onChange={(e) => handleChange('description', e.target.value)} />
      </div>
      <div>
        <label className="block text-sm text-app-muted mb-1">Goals</label>
        <textarea className={`${inputClass} min-h-20`} value={form.goals} onChange={(e) => handleChange('goals', e.target.value)} />
      </div>
      <div>
        <label className="block text-sm text-app-muted mb-1">Target Audience</label>
        <input className={inputClass} value={form.target_audience} onChange={(e) => handleChange('target_audience', e.target.value)} />
      </div>
      <div className="flex items-center justify-end gap-3 pt-2">
        <button type="button" onClick={onCancel} className="px-3 py-2 rounded-lg text-sm text-app-muted hover:text-app-text">
          Cancel
        </button>
        <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg text-sm font-medium bg-primary-500 text-white hover:bg-primary-600 disabled:opacity-50">
          {saving ? 'Saving…' : 'Create Campaign'}
        </button>
      </div>
    </form>
  );
}
