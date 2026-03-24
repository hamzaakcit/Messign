import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pause, Play, CheckCircle2, PencilLine, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { marketingAPI, type Campaign, type ContentItem, type Lead, type SpendEntry } from '@/lib/marketingApi';
import { useAuthStore } from '@/stores/authStore';

interface CampaignDetailPanelProps {
  campaignId: string;
  onUpdated: () => void;
}

type TabKey = 'overview' | 'spend' | 'content' | 'leads';

const tabOrder: Array<{ id: TabKey; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'spend', label: 'Spend' },
  { id: 'content', label: 'Content' },
  { id: 'leads', label: 'Leads' },
];

const inputClass =
  'w-full rounded-lg border border-app-border bg-app-card px-3 py-2 text-sm text-app-text focus:outline-none focus:ring-1 focus:ring-primary-500';

function formatCurrency(value: number, currency: string = 'EUR') {
  return new Intl.NumberFormat('en-IE', { style: 'currency', currency }).format(value || 0);
}

function getStatusVariant(status: string) {
  if (status === 'active' || status === 'completed') return 'green';
  if (status === 'paused' || status === 'scheduled') return 'orange';
  return 'default';
}

function getChannelVariant(channel: string) {
  return ['social', 'paid_social'].includes(channel) ? 'purple' : ['content', 'email'].includes(channel) ? 'blue' : 'default';
}

export function CampaignDetailPanel({ campaignId, onUpdated }: CampaignDetailPanelProps) {
  const { user } = useAuthStore();
  const userId = user?.authUserId || user?.id || '';
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [content, setContent] = useState<ContentItem[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [tab, setTab] = useState<TabKey>('overview');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [spendFormOpen, setSpendFormOpen] = useState(false);
  const [spendForm, setSpendForm] = useState({ amount: '', category: 'ad_spend', date: new Date().toISOString().slice(0, 10), description: '' });

  const fetchCampaign = useCallback(async () => {
    if (!userId || !campaignId) return;
    setLoading(true);
    try {
      const [campaignRes, contentRes, leadsRes] = await Promise.all([
        marketingAPI.getCampaign(userId, campaignId),
        marketingAPI.listContent(userId, { campaignId, pageSize: '20' }),
        marketingAPI.listLeads(userId, { campaignId, pageSize: '20' }),
      ]);
      setCampaign(campaignRes);
      setContent(contentRes.data);
      setLeads(leadsRes.data);
    } finally {
      setLoading(false);
    }
  }, [campaignId, userId]);

  useEffect(() => {
    fetchCampaign();
  }, [fetchCampaign]);

  const spendEntries = useMemo<SpendEntry[]>(() => campaign?.spend_entries ?? [], [campaign]);
  const spendPercent = campaign && campaign.budget_eur > 0 ? (campaign.actual_spend_eur / campaign.budget_eur) * 100 : 0;

  const mutate = async (task: () => Promise<unknown>) => {
    setSaving(true);
    try {
      await task();
      await fetchCampaign();
      onUpdated();
    } finally {
      setSaving(false);
    }
  };

  if (loading || !campaign) {
    return <div className="p-6 text-sm text-app-muted">Loading campaign…</div>;
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Badge variant={getStatusVariant(campaign.status)}>{campaign.status}</Badge>
          <Badge variant={getChannelVariant(campaign.channel)}>{campaign.channel}</Badge>
        </div>
        <h3 className="text-2xl font-semibold text-app-text">{campaign.name}</h3>
        <p className="text-sm text-app-muted mt-2">Owned by {campaign.owner_name ?? 'Unassigned'}</p>
      </div>

      <div className="rounded-xl border border-white/10 bg-white/5 p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-app-muted">Budget vs Spend</span>
          <span className="text-sm text-app-text">
            {formatCurrency(campaign.actual_spend_eur, campaign.currency)} / {formatCurrency(campaign.budget_eur, campaign.currency)}
          </span>
        </div>
        <ProgressBar value={Math.min(spendPercent, 100)} variant={spendPercent > 100 ? 'warning' : 'success'} size="lg" />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[
          ['Impressions', campaign.impressions],
          ['Clicks', campaign.clicks],
          ['Conversions', campaign.conversions],
          ['Leads', campaign.leads_generated],
          ['CPL', formatCurrency(campaign.cost_per_lead ?? 0, campaign.currency)],
          ['ROI', `${(campaign.roi ?? 0).toFixed(2)}x`],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs uppercase tracking-wide text-app-muted">{label}</p>
            <p className="text-xl font-semibold text-app-text mt-2">{value}</p>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-1">
          {tabOrder.map((item) => (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              className={`px-3 py-1.5 rounded-lg text-sm ${tab === item.id ? 'bg-primary-500/20 text-primary-400' : 'text-app-muted hover:text-app-text hover:bg-white/5'}`}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            disabled={saving}
            onClick={() => mutate(() => marketingAPI.launchCampaign(userId, campaign.id))}
            className="px-3 py-1.5 rounded-lg text-sm bg-emerald-500/20 text-emerald-300 flex items-center gap-1.5"
          >
            <Play className="w-4 h-4" /> Launch
          </button>
          <button
            disabled={saving}
            onClick={() => mutate(() => marketingAPI.pauseCampaign(userId, campaign.id))}
            className="px-3 py-1.5 rounded-lg text-sm bg-amber-500/20 text-amber-300 flex items-center gap-1.5"
          >
            <Pause className="w-4 h-4" /> Pause
          </button>
          <button
            disabled={saving}
            onClick={() => mutate(() => marketingAPI.completeCampaign(userId, campaign.id))}
            className="px-3 py-1.5 rounded-lg text-sm bg-primary-500/20 text-primary-300 flex items-center gap-1.5"
          >
            <CheckCircle2 className="w-4 h-4" /> Complete
          </button>
          <button className="px-3 py-1.5 rounded-lg text-sm bg-white/5 text-app-text flex items-center gap-1.5">
            <PencilLine className="w-4 h-4" /> Edit
          </button>
        </div>
      </div>

      {tab === 'overview' && (
        <div className="space-y-4">
          <Section title="Description">{campaign.description || 'No description provided.'}</Section>
          <Section title="Goals">{campaign.goals || 'No goals defined.'}</Section>
          <Section title="Target Audience">{campaign.target_audience || 'No audience specified.'}</Section>
          <Section title="Dates">
            {campaign.start_date || 'TBD'} to {campaign.end_date || 'TBD'}
          </Section>
          <Section title="Tags">{campaign.tags && campaign.tags.length > 0 ? campaign.tags.join(', ') : 'No tags.'}</Section>
        </div>
      )}

      {tab === 'spend' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h4 className="text-sm font-semibold text-app-text">Spend Entries</h4>
            <button onClick={() => setSpendFormOpen((value) => !value)} className="px-3 py-1.5 rounded-lg text-sm bg-primary-500 text-app-text flex items-center gap-1.5">
              <Plus className="w-4 h-4" /> Record Spend
            </button>
          </div>
          {spendFormOpen && (
            <form
              className="rounded-xl border border-white/10 bg-white/5 p-4 grid grid-cols-1 md:grid-cols-4 gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                void mutate(async () => {
                  await marketingAPI.recordSpend(userId, campaign.id, {
                    amount: Number(spendForm.amount || 0),
                    category: spendForm.category,
                    date: spendForm.date,
                    description: spendForm.description,
                  });
                  setSpendForm({ amount: '', category: 'ad_spend', date: new Date().toISOString().slice(0, 10), description: '' });
                  setSpendFormOpen(false);
                });
              }}
            >
              <input className={inputClass} placeholder="Amount" type="number" value={spendForm.amount} onChange={(e) => setSpendForm((current) => ({ ...current, amount: e.target.value }))} />
              <select className={inputClass} value={spendForm.category} onChange={(e) => setSpendForm((current) => ({ ...current, category: e.target.value }))}>
                <option value="ad_spend">Ad Spend</option>
                <option value="content_creation">Content Creation</option>
                <option value="tools">Tools</option>
                <option value="events">Events</option>
                <option value="agency_fees">Agency Fees</option>
              </select>
              <input className={inputClass} type="date" value={spendForm.date} onChange={(e) => setSpendForm((current) => ({ ...current, date: e.target.value }))} />
              <input className={inputClass} placeholder="Description" value={spendForm.description} onChange={(e) => setSpendForm((current) => ({ ...current, description: e.target.value }))} />
              <div className="md:col-span-4 flex justify-end">
                <button type="submit" className="px-3 py-2 rounded-lg text-sm bg-primary-500 text-app-text">Save Spend</button>
              </div>
            </form>
          )}
          <div className="space-y-3">
            {spendEntries.length === 0 ? (
              <p className="text-sm text-app-muted">No spend entries yet.</p>
            ) : (
              spendEntries.map((entry) => (
                <div key={entry.id} className="rounded-xl border border-white/10 bg-white/5 p-4 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-app-text">{entry.category ?? 'Spend'}</p>
                    <p className="text-xs text-app-muted">{entry.description || 'No description'} • {new Date(entry.date).toLocaleDateString()}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-app-text">{formatCurrency(entry.amount_eur ?? entry.amount, entry.currency)}</p>
                    <p className="text-xs text-app-muted">{entry.vendor || 'No vendor'}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {tab === 'content' && (
        <div className="space-y-3">
          {content.length === 0 ? (
            <p className="text-sm text-app-muted">No linked content yet.</p>
          ) : (
            content.map((item) => (
              <div key={item.id} className="rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="blue">{item.content_type}</Badge>
                  <Badge variant="default">{item.status}</Badge>
                </div>
                <p className="text-sm font-medium text-app-text">{item.title}</p>
                <p className="text-xs text-app-muted mt-1">{item.channel || 'No channel'} • {item.scheduled_date || 'Unscheduled'}</p>
              </div>
            ))
          )}
        </div>
      )}

      {tab === 'leads' && (
        <div className="space-y-3">
          {leads.length === 0 ? (
            <p className="text-sm text-app-muted">No attributed leads yet.</p>
          ) : (
            leads.map((lead) => (
              <div key={lead.id} className="rounded-xl border border-white/10 bg-white/5 p-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-app-text">{[lead.first_name, lead.last_name].filter(Boolean).join(' ') || lead.email}</p>
                  <p className="text-xs text-app-muted">{lead.company_name || 'No company'} • {lead.source}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-app-text">{lead.score}/100</p>
                  <p className="text-xs text-app-muted">{lead.status}</p>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <p className="text-xs uppercase tracking-wide text-app-muted mb-2">{title}</p>
      <div className="text-sm text-app-text">{children}</div>
    </div>
  );
}
