import { useState, useEffect, useCallback } from 'react';
import { Plus } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { CRMNav } from '@/components/crm/CRMNav';
import { DoraInsightBar } from '@/components/dora/DoraInsightBar';
import { DataTable, type ColumnDef } from '@/components/ui/DataTable';
import { SlideOverPanel } from '@/components/ui/SlideOverPanel';
import { NLFilterBar } from '@/components/ui/NLFilterBar';
import { CompanyDetailPanel } from '@/components/crm/CompanyDetailPanel';
import { CompanyCreatePanel } from '@/components/crm/CompanyCreatePanel';
import { crmAPI, type Company } from '@/lib/crmApi';

function formatCurrency(value: number | null | undefined): string {
  if (value == null) return '—';
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toLocaleString()}`;
}

const columns: ColumnDef<Company>[] = [
  {
    key: 'name',
    header: 'Name',
    sortable: true,
    render: (v) => <span className="font-medium text-app-text">{v}</span>,
  },
  { key: 'domain', header: 'Domain', sortable: true },
  { key: 'industry', header: 'Industry', sortable: true },
  { key: 'size', header: 'Size' },
  {
    key: 'annual_revenue',
    header: 'Annual Revenue',
    sortable: true,
    render: (v) => <span className="text-emerald-400">{formatCurrency(v)}</span>,
  },
  {
    key: 'deal_count',
    header: 'Deals',
    sortable: true,
    render: (v) => v ?? 0,
  },
  {
    key: 'total_deal_value',
    header: 'Total Deal Value',
    sortable: true,
    render: (v) => <span className="text-emerald-400">{formatCurrency(v)}</span>,
  },
];

export function CRMCompaniesPage() {
  const { user } = useAuthStore();
  const userId = user?.authUserId || user?.id || '';

  const [companies, setCompanies] = useState<Company[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);

  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [nlFilters, setNlFilters] = useState<Record<string, unknown>>({});

  const fetchCompanies = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const params: Record<string, string> = { page: String(page + 1), pageSize: '20' };
      if (nlFilters.industry && typeof nlFilters.industry === 'string') params.industry = nlFilters.industry;
      if (nlFilters.size && typeof nlFilters.size === 'string') params.size = nlFilters.size;
      if (nlFilters.search && typeof nlFilters.search === 'string') params.search = nlFilters.search;

      const res = await crmAPI.listCompanies(userId, params);
      let filtered = res.data;
      const revMin = nlFilters.revenueMin as number | undefined;
      const revMax = nlFilters.revenueMax as number | undefined;
      const countryStr = nlFilters.country as string | undefined;
      if (typeof revMin === 'number' && revMin > 0) {
        filtered = filtered.filter((c) => (c.annual_revenue ?? 0) >= revMin);
      }
      if (typeof revMax === 'number' && revMax > 0) {
        filtered = filtered.filter((c) => (c.annual_revenue ?? 0) <= revMax);
      }
      if (countryStr) {
        const lower = countryStr.toLowerCase();
        filtered = filtered.filter((c) => c.country?.toLowerCase().includes(lower));
      }

      setCompanies(filtered);
      setTotal(res.total);
    } catch {
      setCompanies([]);
    } finally {
      setLoading(false);
    }
  }, [userId, page, nlFilters]);

  useEffect(() => {
    fetchCompanies();
  }, [fetchCompanies]);

  const handleRowClick = (row: Company) => {
    setSelectedCompanyId(row.id);
  };

  const handleCreated = () => {
    setCreateOpen(false);
    fetchCompanies();
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[1600px] mx-auto px-6 pt-6 pb-4 flex flex-col min-h-full">
          <CRMNav />
          <DoraInsightBar module="sales" />

          <div className="flex items-center justify-between mb-4 mt-4">
            <h2 className="text-lg font-semibold text-app-text">Companies</h2>
            <button
              onClick={() => setCreateOpen(true)}
              className="px-3 py-1.5 text-sm font-medium rounded-lg bg-primary-500 text-white hover:bg-primary-600 transition-colors flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              New Company
            </button>
          </div>

          <NLFilterBar
            placeholder="Try: &quot;companies with revenue over 1M in technology&quot;"
            availableFields={[
              { key: 'industry', label: 'Industry', type: 'string' },
              { key: 'revenueMin', label: 'Revenue', type: 'number' },
              { key: 'revenueMax', label: 'Revenue', type: 'number' },
              { key: 'size', label: 'Company Size', type: 'string' },
              { key: 'country', label: 'Country', type: 'string' },
            ]}
            module="crm"
            onFiltersApplied={(f) => setNlFilters(f)}
          />

          <DataTable
            data={companies}
            columns={columns}
            isLoading={loading}
            onRowClick={handleRowClick}
            sortable
            searchable
            searchPlaceholder="Search companies…"
            pagination
            pageSize={20}
            totalItems={total}
            currentPage={page}
            onPageChange={setPage}
            emptyMessage="No companies yet. Create your first company to get started."
          />
        </div>
      </div>

      <SlideOverPanel
        isOpen={!!selectedCompanyId}
        onClose={() => setSelectedCompanyId(null)}
        title="Company Details"
        width={560}
      >
        {selectedCompanyId && (
          <CompanyDetailPanel
            companyId={selectedCompanyId}
            onUpdated={fetchCompanies}
          />
        )}
      </SlideOverPanel>

      <SlideOverPanel
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        title="New Company"
        width={480}
      >
        <CompanyCreatePanel onCreated={handleCreated} onCancel={() => setCreateOpen(false)} />
      </SlideOverPanel>
    </div>
  );
}
