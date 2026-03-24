import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRightLeft } from 'lucide-react';
import { DoraInsightBar } from '@/components/dora/DoraInsightBar';
import { DataTable, type ColumnDef } from '@/components/ui/DataTable';
import { SlideOverPanel } from '@/components/ui/SlideOverPanel';
import { Badge } from '@/components/ui/Badge';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { NLFilterBar } from '@/components/ui/NLFilterBar';
import { useAuthStore } from '@/stores/authStore';
import { marketingAPI, type Lead, type LeadFunnelMetrics } from '@/lib/marketingApi';

import { LeadDetailPanel } from './components/LeadDetailPanel';

function scoreColor(score: number) {
  if (score < 30) return 'bg-red-500';
  if (score < 70) return 'bg-amber-500';
  return 'bg-emerald-500';
}

const funnelStages: Array<keyof LeadFunnelMetrics> = ['new', 'contacted', 'nurturing', 'qualified', 'converted'];

export function MarketingLeadsPage() {
  const { user } = useAuthStore();
  const userId = user?.authUserId || user?.id || '';
  const [leads, setLeads] = useState<Lead[]>([]);
  const [funnel, setFunnel] = useState<LeadFunnelMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [hotOnly, setHotOnly] = useState(false);
  const [nlFilters, setNlFilters] = useState<Record<string, unknown>>({});

  const fetchData = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const hasNlFilters = Object.keys(nlFilters).length > 0;
      const params: Record<string, string> = { pageSize: '100' };
      if (nlFilters.status && typeof nlFilters.status === 'string') params.status = nlFilters.status;
      if (nlFilters.source && typeof nlFilters.source === 'string') params.source = nlFilters.source;
      if (typeof nlFilters.scoreMin === 'number') params.scoreMin = String(nlFilters.scoreMin);
      if (typeof nlFilters.scoreMax === 'number') params.scoreMax = String(nlFilters.scoreMax);
      if (nlFilters.search && typeof nlFilters.search === 'string') params.search = nlFilters.search;

      const [leadRes, funnelRes] = await Promise.all([
        hasNlFilters
          ? marketingAPI.listLeads(userId, params).then((result) => result.data)
          : hotOnly
            ? marketingAPI.getHotLeads(userId)
            : marketingAPI.listLeads(userId, { pageSize: '100' }).then((result) => result.data),
        marketingAPI.getLeadFunnel(userId),
      ]);
      setLeads(leadRes);
      setFunnel(funnelRes);
    } finally {
      setLoading(false);
    }
  }, [hotOnly, nlFilters, userId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const columns = useMemo<ColumnDef<Lead>[]>(() => [
    {
      key: 'first_name',
      header: 'Name',
      render: (_value, row) => <span className="font-medium text-app-text">{[row.first_name, row.last_name].filter(Boolean).join(' ') || row.email}</span>,
    },
    { key: 'email', header: 'Email' },
    { key: 'company_name', header: 'Company' },
    {
      key: 'source',
      header: 'Source',
      render: (value) => <Badge variant="default">{String(value)}</Badge>,
    },
    { key: 'campaign_name', header: 'Campaign' },
    {
      key: 'score',
      header: 'Score',
      render: (value) => (
        <div className="w-28">
          <div className="flex items-center justify-between text-xs text-app-muted mb-1">
            <span>{Number(value)}</span>
            <span>/100</span>
          </div>
          <div className="h-2 rounded-full bg-app-surface-tertiary overflow-hidden">
            <div className={`h-full ${scoreColor(Number(value))}`} style={{ width: `${Math.min(Number(value), 100)}%` }} />
          </div>
        </div>
      ),
    },
    { key: 'status', header: 'Status' },
    {
      key: 'last_activity_at',
      header: 'Last Activity',
      render: (value) => value ? new Date(String(value)).toLocaleDateString() : '—',
    },
  ], []);

  const maxFunnelValue = Math.max(1, ...funnelStages.map((stage) => funnel?.[stage] ?? 0));

  const runBulk = async (action: 'qualify' | 'disqualify' | 'convert') => {
    const ids = Array.from(selectedIds);
    for (const id of ids) {
      if (action === 'qualify') {
        await marketingAPI.qualifyLead(userId, id);
      } else if (action === 'convert') {
        await marketingAPI.convertLeadToCRM(userId, id);
      } else {
        await marketingAPI.updateLead(userId, id, { status: 'disqualified' });
      }
    }
    setSelectedIds(new Set());
    await fetchData();
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[1600px] mx-auto px-6 pt-6 pb-4">
          <DoraInsightBar module="marketing" />

          <div className="rounded-xl border border-app-border bg-app-surface-tertiary p-5 mb-6">
            <h3 className="text-lg font-semibold text-app-text mb-4">Lead Funnel</h3>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
              {funnelStages.map((stage) => {
                const value = funnel?.[stage] ?? 0;
                return (
                  <div key={stage} className="rounded-xl border border-app-border bg-app-card p-4">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-xs uppercase tracking-wide text-app-muted">{stage}</p>
                      <span className="text-sm font-semibold text-app-text">{value}</span>
                    </div>
                    <ProgressBar value={value} max={maxFunnelValue} variant={stage === 'converted' ? 'success' : 'default'} />
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
            <label className="inline-flex items-center gap-2 text-sm text-app-text">
              <input type="checkbox" checked={hotOnly} onChange={(e) => setHotOnly(e.target.checked)} />
              Hot Leads
            </label>
            <div className="flex items-center gap-2 flex-wrap">
              <button disabled={selectedIds.size === 0} onClick={() => { void runBulk('qualify'); }} className="px-3 py-2 rounded-lg text-sm bg-primary-500/20 text-primary-300 disabled:opacity-50">
                Qualify
              </button>
              <button disabled={selectedIds.size === 0} onClick={() => { void runBulk('disqualify'); }} className="px-3 py-2 rounded-lg text-sm bg-red-500/20 text-red-300 disabled:opacity-50">
                Disqualify
              </button>
              <button disabled={selectedIds.size === 0} onClick={() => { void runBulk('convert'); }} className="px-3 py-2 rounded-lg text-sm bg-emerald-500/20 text-emerald-300 disabled:opacity-50 flex items-center gap-1.5">
                <ArrowRightLeft className="w-4 h-4" />
                Convert to CRM
              </button>
            </div>
          </div>

          <NLFilterBar
            placeholder="Try: &quot;hot leads from LinkedIn with score over 70&quot;"
            availableFields={[
              { key: 'status', label: 'Status', type: 'enum', values: ['new', 'contacted', 'nurturing', 'qualified', 'converted', 'disqualified'] },
              { key: 'source', label: 'Source', type: 'string' },
              { key: 'scoreMin', label: 'Score', type: 'number' },
              { key: 'scoreMax', label: 'Score', type: 'number' },
              { key: 'company', label: 'Company', type: 'string' },
            ]}
            module="marketing"
            onFiltersApplied={(f) => setNlFilters(f)}
          />

          <DataTable
            data={leads}
            columns={columns}
            isLoading={loading}
            selectable
            selectedIds={selectedIds}
            onSelectionChange={setSelectedIds}
            onRowClick={(row) => setSelectedLeadId(row.id)}
            emptyMessage="No leads found."
            virtualized
          />
        </div>
      </div>

      <SlideOverPanel isOpen={!!selectedLeadId} onClose={() => setSelectedLeadId(null)} title="Lead Detail" width={720}>
        {selectedLeadId && <LeadDetailPanel leadId={selectedLeadId} onUpdated={fetchData} />}
      </SlideOverPanel>
    </div>
  );
}
