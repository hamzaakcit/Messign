import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDebouncedCallback } from '@/hooks';
import { DollarSign, Megaphone, Plus, Target, TrendingUp, Wallet } from 'lucide-react';
import { DoraInsightBar } from '@/components/dora/DoraInsightBar';
import { KPICard } from '@/components/finance/KPICard';
import { DataTable, type ColumnDef } from '@/components/ui/DataTable';
import { SlideOverPanel } from '@/components/ui/SlideOverPanel';
import { Badge } from '@/components/ui/Badge';
import { useAuthStore } from '@/stores/authStore';
import { marketingAPI, type Campaign, type CampaignMetricsSummary, type DashboardMetrics } from '@/lib/marketingApi';
import { MarketingNav } from './components/MarketingNav';
import { CampaignDetailPanel } from './components/CampaignDetailPanel';
import { CampaignCreatePanel } from './components/CampaignCreatePanel';

function formatCurrency(value: number, currency = 'EUR') {
  return new Intl.NumberFormat('en-IE', { style: 'currency', currency }).format(value || 0);
}

function channelVariant(channel: string): 'default' | 'blue' | 'purple' | 'green' | 'orange' | 'red' {
  if (channel === 'email' || channel === 'content') return 'blue';
  if (channel === 'social' || channel === 'paid_social') return 'purple';
  if (channel === 'webinar' || channel === 'event') return 'orange';
  return 'default';
}

function statusVariant(status: string): 'default' | 'blue' | 'purple' | 'green' | 'orange' | 'red' {
  if (status === 'active' || status === 'completed') return 'green';
  if (status === 'paused' || status === 'scheduled') return 'orange';
  if (status === 'cancelled') return 'red';
  return 'default';
}

export function MarketingCampaignsPage() {
  const { user } = useAuthStore();
  const userId = user?.authUserId || user?.id || '';
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState<CampaignMetricsSummary | null>(null);
  const [dashboard, setDashboard] = useState<DashboardMetrics | null>(null);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [filters, setFilters] = useState({
    status: '',
    channel: '',
    search: '',
    dateFrom: '',
    dateTo: '',
  });

  const fetchData = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const queryFilters: Record<string, string> = {
        page: String(page + 1),
        pageSize: '20',
      };
      if (filters.status) queryFilters.status = filters.status;
      if (filters.channel) queryFilters.channel = filters.channel;
      if (filters.search) queryFilters.search = filters.search;
      if (filters.dateFrom) queryFilters.dateFrom = filters.dateFrom;
      if (filters.dateTo) queryFilters.dateTo = filters.dateTo;

      const [campaignRes, metricsRes, dashboardRes] = await Promise.all([
        marketingAPI.listCampaigns(userId, queryFilters),
        marketingAPI.getCampaignMetrics(userId),
        marketingAPI.getDashboardMetrics(userId),
      ]);
      setCampaigns(campaignRes.data);
      setTotal(campaignRes.total);
      setMetrics(metricsRes);
      setDashboard(dashboardRes);
    } finally {
      setLoading(false);
    }
  }, [filters, page, userId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const debouncedSearch = useDebouncedCallback((search: string) => {
    setFilters((current) => ({ ...current, search }));
  }, 300);

  const columns = useMemo<ColumnDef<Campaign>[]>(() => [
    {
      key: 'name',
      header: 'Name',
      sortable: true,
      render: (_value, row) => <span className="font-medium text-app-text">{row.name}</span>,
    },
    {
      key: 'channel',
      header: 'Channel',
      render: (value) => <Badge variant={channelVariant(String(value))}>{String(value)}</Badge>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (value) => <Badge variant={statusVariant(String(value))}>{String(value)}</Badge>,
    },
    {
      key: 'budget_eur',
      header: 'Budget',
      render: (value, row) => formatCurrency(Number(value), row.currency),
    },
    {
      key: 'actual_spend_eur',
      header: 'Spend',
      render: (value, row) => formatCurrency(Number(value), row.currency),
    },
    { key: 'leads_generated', header: 'Leads', sortable: true },
    {
      key: 'cost_per_lead',
      header: 'CPL',
      render: (value, row) => formatCurrency(Number(value ?? 0), row.currency),
    },
    {
      key: 'roi',
      header: 'ROI',
      sortable: true,
      render: (value) => {
        const roi = Number(value ?? 0);
        const color = roi > 2 ? 'text-emerald-300' : roi >= 1 ? 'text-amber-300' : 'text-red-300';
        return <span className={color}>{roi.toFixed(2)}x</span>;
      },
    },
    { key: 'owner_name', header: 'Owner' },
    {
      key: 'start_date',
      header: 'Dates',
      render: (_value, row) => `${row.start_date || 'TBD'} - ${row.end_date || 'TBD'}`,
    },
  ], []);

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[1600px] mx-auto px-6 pt-6 pb-4">
          <MarketingNav />
          <DoraInsightBar module="marketing" fallback="Dora tracks campaign ROI and identifies your highest-performing channels." />

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
            <KPICard title="MQLs Generated" value={dashboard?.mqls ?? 0} icon={Target} />
            <KPICard title="Avg Campaign ROI" value={`${(metrics?.avgROI ?? 0).toFixed(2)}x`} icon={TrendingUp} />
            <KPICard title="CAC" value={formatCurrency(dashboard?.cac ?? 0)} icon={DollarSign} />
            <KPICard title="Active Campaigns" value={metrics?.activeCampaigns ?? 0} icon={Megaphone} />
            <KPICard title="Total Spend" value={formatCurrency(metrics?.totalSpend ?? 0)} icon={Wallet} />
          </div>

          <div className="flex items-end justify-between gap-4 mb-4 flex-wrap">
            <div className="flex items-end gap-3 flex-wrap">
              <div>
                <label className="block text-xs text-app-muted mb-1">Status</label>
                <select className="rounded-lg border border-app-border bg-app-card px-3 py-2 text-sm text-app-text" value={filters.status} onChange={(e) => setFilters((current) => ({ ...current, status: e.target.value }))}>
                  <option value="">All</option>
                  <option value="draft">Draft</option>
                  <option value="scheduled">Scheduled</option>
                  <option value="active">Active</option>
                  <option value="paused">Paused</option>
                  <option value="completed">Completed</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-app-muted mb-1">Channel</label>
                <select className="rounded-lg border border-app-border bg-app-card px-3 py-2 text-sm text-app-text" value={filters.channel} onChange={(e) => setFilters((current) => ({ ...current, channel: e.target.value }))}>
                  <option value="">All</option>
                  <option value="email">Email</option>
                  <option value="social">Social</option>
                  <option value="paid_search">Paid Search</option>
                  <option value="paid_social">Paid Social</option>
                  <option value="content">Content</option>
                  <option value="event">Event</option>
                  <option value="webinar">Webinar</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-app-muted mb-1">From</label>
                <input className="rounded-lg border border-app-border bg-app-card px-3 py-2 text-sm text-app-text" type="date" value={filters.dateFrom} onChange={(e) => setFilters((current) => ({ ...current, dateFrom: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs text-app-muted mb-1">To</label>
                <input className="rounded-lg border border-app-border bg-app-card px-3 py-2 text-sm text-app-text" type="date" value={filters.dateTo} onChange={(e) => setFilters((current) => ({ ...current, dateTo: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs text-app-muted mb-1">Search</label>
                <input className="rounded-lg border border-app-border bg-app-card px-3 py-2 text-sm text-app-text" placeholder="Campaign name" value={filters.search} onChange={(e) => setFilters((current) => ({ ...current, search: e.target.value }))} />
              </div>
            </div>
            <button onClick={() => setCreateOpen(true)} className="px-3 py-2 rounded-lg text-sm font-medium bg-primary-500 text-white hover:bg-primary-600 flex items-center gap-1.5">
              <Plus className="w-4 h-4" />
              New Campaign
            </button>
          </div>

          <DataTable
            data={campaigns}
            columns={columns}
            isLoading={loading}
            sortable
            searchable
            searchPlaceholder="Search campaigns…"
            onSearch={debouncedSearch}
            pagination
            pageSize={20}
            totalItems={total}
            currentPage={page}
            onPageChange={setPage}
            onRowClick={(row) => setSelectedCampaignId(row.id)}
            emptyMessage="No campaigns found yet."
          />
        </div>
      </div>

      <SlideOverPanel isOpen={!!selectedCampaignId} onClose={() => setSelectedCampaignId(null)} title="Campaign Detail" width={760}>
        {selectedCampaignId && <CampaignDetailPanel campaignId={selectedCampaignId} onUpdated={fetchData} />}
      </SlideOverPanel>

      <SlideOverPanel isOpen={createOpen} onClose={() => setCreateOpen(false)} title="New Campaign" width={520}>
        <CampaignCreatePanel onCreated={() => { setCreateOpen(false); void fetchData(); }} onCancel={() => setCreateOpen(false)} />
      </SlideOverPanel>
    </div>
  );
}
