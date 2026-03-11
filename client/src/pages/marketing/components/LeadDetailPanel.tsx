import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { marketingAPI, type Lead } from '@/lib/marketingApi';
import { useAuthStore } from '@/stores/authStore';

interface LeadDetailPanelProps {
  leadId: string;
  onUpdated: () => void;
}

const signalOptions = [
  'page_view',
  'content_download',
  'email_open',
  'email_click',
  'webinar_register',
  'webinar_attend',
  'form_submit',
  'demo_request',
  'pricing_view',
  'return_visit',
];

function scoreVariant(score: number): 'red' | 'orange' | 'green' {
  if (score < 30) return 'red';
  if (score < 70) return 'orange';
  return 'green';
}

export function LeadDetailPanel({ leadId, onUpdated }: LeadDetailPanelProps) {
  const { user } = useAuthStore();
  const userId = user?.authUserId || user?.id || '';
  const [lead, setLead] = useState<Lead | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedSignal, setSelectedSignal] = useState(signalOptions[0]);

  const fetchLead = useCallback(async () => {
    if (!userId || !leadId) return;
    setLoading(true);
    try {
      const result = await marketingAPI.getLead(userId, leadId);
      setLead(result);
    } finally {
      setLoading(false);
    }
  }, [leadId, userId]);

  useEffect(() => {
    fetchLead();
  }, [fetchLead]);

  const scoreEntries = useMemo(
    () => Object.entries(lead?.score_factors ?? {}).sort((a, b) => b[1] - a[1]),
    [lead],
  );

  const mutate = async (task: () => Promise<unknown>) => {
    await task();
    await fetchLead();
    onUpdated();
  };

  if (loading || !lead) {
    return <div className="p-6 text-sm text-app-muted">Loading lead…</div>;
  }

  return (
    <div className="p-6 space-y-5">
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Badge variant={scoreVariant(lead.score)}>{lead.status}</Badge>
          <Badge variant="default">{lead.source}</Badge>
        </div>
        <h3 className="text-2xl font-semibold text-app-text">{[lead.first_name, lead.last_name].filter(Boolean).join(' ') || lead.email}</h3>
        <p className="text-sm text-app-muted mt-2">{lead.company_name || 'No company'} • {lead.job_title || 'No title'}</p>
      </div>

      <div className="rounded-xl border border-white/10 bg-white/5 p-5">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm text-app-muted">Lead Score</span>
          <span className="text-2xl font-semibold text-app-text">{lead.score}/100</span>
        </div>
        <ProgressBar value={lead.score} max={100} variant={lead.score >= 70 ? 'success' : 'warning'} size="lg" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <InfoCard title="Lead Info">
          <p>{lead.email}</p>
          <p>{lead.phone || 'No phone'}</p>
          <p>{lead.campaign_name || 'No campaign'}</p>
        </InfoCard>
        <InfoCard title="UTM / Source">
          <p>Source: {lead.source}</p>
          <p>UTM Source: {lead.utm_source || '—'}</p>
          <p>UTM Medium: {lead.utm_medium || '—'}</p>
          <p>UTM Campaign: {lead.utm_campaign || '—'}</p>
        </InfoCard>
      </div>

      <InfoCard title="Score Breakdown">
        <div className="space-y-2">
          {scoreEntries.length === 0 ? (
            <p className="text-sm text-app-muted">No score signals recorded yet.</p>
          ) : (
            scoreEntries.map(([signal, points]) => (
              <div key={signal} className="flex items-center justify-between text-sm">
                <span className="text-app-text">{signal}</span>
                <span className="text-emerald-300">+{points}</span>
              </div>
            ))
          )}
        </div>
      </InfoCard>

      <InfoCard title="CRM Linkage">
        <p>Contact: {lead.crm_contact_name || lead.crm_contact_id || 'Not converted'}</p>
        <p>Deal: {lead.crm_deal_title || lead.crm_deal_id || 'Not converted'}</p>
      </InfoCard>

      <InfoCard title="Activity Timeline">
        <p>Last activity: {lead.last_activity_at ? new Date(lead.last_activity_at).toLocaleString() : 'No activity recorded'}</p>
        <p>Created: {new Date(lead.created_at).toLocaleString()}</p>
        <p>Converted: {lead.converted_at ? new Date(lead.converted_at).toLocaleString() : 'Not converted'}</p>
      </InfoCard>

      <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
        <div className="flex items-center gap-3">
          <select className="rounded-lg border border-app-border bg-app-card px-3 py-2 text-sm text-app-text" value={selectedSignal} onChange={(e) => setSelectedSignal(e.target.value)}>
            {signalOptions.map((signal) => (
              <option key={signal} value={signal}>{signal}</option>
            ))}
          </select>
          <button onClick={() => { void mutate(() => marketingAPI.scoreLead(userId, lead.id, selectedSignal)); }} className="px-3 py-2 rounded-lg text-sm bg-white/5 text-app-text">
            Score
          </button>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => { void mutate(() => marketingAPI.qualifyLead(userId, lead.id)); }} className="px-3 py-2 rounded-lg text-sm bg-primary-500/20 text-primary-300">
            Qualify
          </button>
          <button onClick={() => { void mutate(() => marketingAPI.convertLeadToCRM(userId, lead.id)); }} className="px-3 py-2 rounded-lg text-sm bg-emerald-500/20 text-emerald-300">
            Convert to CRM
          </button>
          <button onClick={() => { void mutate(() => marketingAPI.updateLead(userId, lead.id, { status: 'disqualified' })); }} className="px-3 py-2 rounded-lg text-sm bg-red-500/20 text-red-300">
            Disqualify
          </button>
        </div>
      </div>
    </div>
  );
}

function InfoCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <p className="text-xs uppercase tracking-wide text-app-muted mb-3">{title}</p>
      <div className="space-y-2 text-sm text-app-text">{children}</div>
    </div>
  );
}
