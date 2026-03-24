import { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { financeAPI } from '@/lib/financeApi';
import { StatusBadge } from '@/components/finance/StatusBadge';
import { cn } from '@/lib/utils';
import { Plus, Search, Building2, Filter, Download, CheckSquare, Square, Ban } from 'lucide-react';

interface Props {
  onCreateNew: () => void;
  onViewVendor: (id: string) => void;
}

const VENDOR_FIELDS = [
  { key: 'name', label: 'Company Name', required: true },
  { key: 'legal_name', label: 'Legal Name' },
  { key: 'email', label: 'Email', type: 'email' },
  { key: 'phone', label: 'Phone', type: 'tel' },
  { key: 'vendor_code', label: 'Vendor Code' },
  { key: 'tax_id', label: 'Tax ID' },
  { key: 'website', label: 'Website', type: 'url' },
  { key: 'country', label: 'Country' },
  { key: 'default_currency', label: 'Currency', type: 'select', options: ['USD', 'EUR', 'GBP', 'TRY'] },
  { key: 'payment_terms', label: 'Payment Terms', type: 'select', options: ['Net 15', 'Net 30', 'Net 45', 'Net 60', 'Due on Receipt'] },
];

export function VendorsPage({ onViewVendor }: Props) {
  const { user, isAdmin } = useAuthStore();
  const userId = user?.authUserId || user?.id || '';
  const [vendors, setVendors] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('active');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [creating, setCreating] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [countryFilter, setCountryFilter] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const toggleSelection = (id: string) =>
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  const clearSelection = () => setSelectedIds([]);

  const fetchVendors = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const filters: Record<string, string> = {};
      if (search) filters.search = search;
      if (statusFilter !== 'all') filters.active_only = statusFilter === 'active' ? 'true' : 'false';
      const data = await financeAPI.listVendors(userId, filters);
      setVendors(data as Array<Record<string, unknown>>);
    } catch {}
    setLoading(false);
  }, [userId, search, statusFilter]);

  useEffect(() => { fetchVendors(); }, [fetchVendors]);

  const handleCreate = async () => {
    if (!formData.name) return;
    setCreating(true);
    try {
      await financeAPI.createVendor(userId, formData);
      setShowCreateForm(false);
      setFormData({});
      fetchVendors();
    } catch (err) {
      console.error('Create vendor failed:', err);
    }
    setCreating(false);
  };

  const handleBulkDeactivate = async () => {
    if (selectedIds.length === 0 || !confirm(`Deactivate ${selectedIds.length} vendor(s)?`)) return;
    try {
      await financeAPI.bulkDeactivateVendors(userId, selectedIds);
      clearSelection();
      fetchVendors();
    } catch (err) {
      console.error('Bulk deactivate failed:', err);
    }
  };

  const handleExportCSV = () => {
    const headers = ['Name', 'Code', 'Email', 'Country', 'Payment Terms', 'Currency', 'Status'];
    const dataToExport = selectedIds.length > 0
      ? filteredVendors.filter((v) => selectedIds.includes(v.id as string))
      : filteredVendors;
    const rows = dataToExport.map((v) => [
      v.name as string || '', v.vendor_code as string || '', v.email as string || '',
      v.country as string || '', v.payment_terms as string || '', v.default_currency as string || 'USD',
      v.is_active ? 'Active' : 'Inactive',
    ]);
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `vendors-${new Date().toISOString().split('T')[0]}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  const filteredVendors = vendors.filter((v) => {
    if (categoryFilter && !(v.category as string)?.toLowerCase().includes(categoryFilter.toLowerCase())) return false;
    if (countryFilter && !(v.country as string)?.toLowerCase().includes(countryFilter.toLowerCase())) return false;
    if (statusFilter === 'active' && !v.is_active) return false;
    if (statusFilter === 'inactive' && v.is_active) return false;
    return true;
  });

  const allSelected = filteredVendors.length > 0 && selectedIds.length === filteredVendors.length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-app-text">Vendor Management</h3>
        <div className="flex items-center gap-2">
          <button onClick={handleExportCSV}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-app-surface-tertiary border border-app-border text-sm text-app-muted hover:bg-app-hover hover:text-app-text">
            <Download className="h-4 w-4" /> Export
          </button>
          {isAdmin && (
            <button onClick={() => setShowCreateForm(!showCreateForm)}
              className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-app-text rounded-lg text-sm font-medium hover:bg-primary-600">
              <Plus className="h-4 w-4" /> New Vendor
            </button>
          )}
        </div>
      </div>

      {showCreateForm && (
        <div className="rounded-xl border border-app-border bg-app-surface-tertiary p-5 space-y-4">
          <h4 className="font-semibold text-app-text">Create New Vendor</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {VENDOR_FIELDS.map(({ key, label, type, required, options }) => (
              <div key={key}>
                <label className="block text-xs text-app-muted mb-1">{label}{required && ' *'}</label>
                {type === 'select' ? (
                  <select value={formData[key] || ''} onChange={(e) => setFormData((p) => ({ ...p, [key]: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg bg-app-surface-tertiary border border-app-border text-sm text-app-text focus:border-primary-500 focus:outline-none">
                    <option value="">Select...</option>
                    {options?.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : (
                  <input type={type || 'text'} value={formData[key] || ''}
                    onChange={(e) => setFormData((p) => ({ ...p, [key]: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg bg-app-surface-tertiary border border-app-border text-sm text-app-text placeholder:text-app-muted focus:border-primary-500 focus:outline-none" />
                )}
              </div>
            ))}
            <div className="sm:col-span-2 lg:col-span-3">
              <label className="block text-xs text-app-muted mb-1">Address</label>
              <textarea value={formData.address || ''} onChange={(e) => setFormData((p) => ({ ...p, address: e.target.value }))} rows={2}
                className="w-full px-3 py-2 rounded-lg bg-app-surface-tertiary border border-app-border text-sm text-app-text focus:border-primary-500 focus:outline-none" />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleCreate} disabled={!formData.name || creating}
              className="px-4 py-2 bg-primary-500 text-app-text rounded-lg text-sm font-medium hover:bg-primary-600 disabled:opacity-50">
              {creating ? 'Creating...' : 'Create Vendor'}
            </button>
            <button onClick={() => setShowCreateForm(false)}
              className="px-4 py-2 text-app-muted hover:text-app-text text-sm hover:bg-app-nav-hover rounded-lg">Cancel</button>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-app-muted" />
          <input type="text" placeholder="Search vendors..." value={search} onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-lg bg-app-surface-tertiary border border-app-border text-sm text-app-text placeholder:text-app-muted focus:border-primary-500 focus:outline-none" />
        </div>
        <button onClick={() => setShowFilters(!showFilters)}
          className={cn('flex items-center gap-2 px-3 py-2 rounded-lg text-sm border transition-colors',
            showFilters ? 'bg-primary-500/10 border-primary-500/30 text-primary-400' : 'bg-app-surface-tertiary border-app-border text-app-muted')}>
          <Filter className="h-4 w-4" /> Filters
        </button>
        <div className="flex items-center gap-1 rounded-lg border border-app-border bg-app-surface-tertiary p-0.5">
          {(['all', 'active', 'inactive'] as const).map((s) => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={cn('px-3 py-1.5 rounded-md text-xs font-medium transition-colors capitalize',
                statusFilter === s ? 'bg-primary-500/20 text-primary-400' : 'text-app-muted hover:text-app-text')}>{s}</button>
          ))}
        </div>
      </div>

      {showFilters && (
        <div className="rounded-xl border border-app-border bg-app-surface-tertiary p-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-app-muted mb-1">Category</label>
              <input type="text" placeholder="Filter by category" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}
                className="w-full px-2 py-1.5 rounded-lg bg-app-surface-tertiary border border-app-border text-xs text-app-text focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs text-app-muted mb-1">Country</label>
              <input type="text" placeholder="Filter by country" value={countryFilter} onChange={(e) => setCountryFilter(e.target.value)}
                className="w-full px-2 py-1.5 rounded-lg bg-app-surface-tertiary border border-app-border text-xs text-app-text focus:outline-none" />
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-14 bg-app-surface-tertiary rounded-lg animate-pulse" />)}</div>
      ) : filteredVendors.length === 0 ? (
        <div className="rounded-xl border border-app-border bg-app-surface-tertiary p-8 text-center">
          <Building2 className="h-10 w-10 mx-auto text-app-muted mb-3" />
          <p className="text-app-muted text-sm">No vendors found</p>
          {isAdmin && (
            <button onClick={() => setShowCreateForm(true)} className="mt-3 text-primary-400 hover:text-primary-300 text-sm font-medium">
              Add your first vendor
            </button>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-app-border bg-app-surface-tertiary overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-app-border text-xs text-app-muted uppercase tracking-wide">
                <th className="p-3 text-left w-10">
                  <button onClick={() => allSelected ? clearSelection() : setSelectedIds(filteredVendors.map((v) => v.id as string))}>
                    {allSelected ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
                  </button>
                </th>
                <th className="px-4 py-3 text-left">Name</th>
                <th className="px-4 py-3 text-left">Contact</th>
                <th className="px-4 py-3 text-left">Payment Terms</th>
                <th className="px-4 py-3 text-left">Currency</th>
                <th className="px-4 py-3 text-left">Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredVendors.map((v) => (
                <tr key={v.id as string} onClick={() => onViewVendor(v.id as string)}
                  className="border-b border-app-border hover:bg-app-nav-hover transition-colors cursor-pointer">
                  <td className="p-3" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => toggleSelection(v.id as string)}>
                      {selectedIds.includes(v.id as string) ? <CheckSquare className="h-4 w-4 text-primary-400" /> : <Square className="h-4 w-4 text-app-muted" />}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-app-text font-medium">{v.name != null ? String(v.name) : ''}</div>
                    {v.vendor_code != null && <div className="text-xs text-app-muted">{String(v.vendor_code)}</div>}
                  </td>
                  <td className="px-4 py-3 text-app-muted text-xs">{(v.email as string) || '—'}</td>
                  <td className="px-4 py-3 text-app-muted text-xs">{(v.payment_terms as string) || 'Net 30'}</td>
                  <td className="px-4 py-3 text-app-muted text-xs">{(v.default_currency as string) || 'USD'}</td>
                  <td className="px-4 py-3"><StatusBadge status={v.is_active ? 'active' : 'closed'} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-4 py-3 border-t border-app-border text-xs text-app-muted">
            Showing {filteredVendors.length} vendor{filteredVendors.length !== 1 ? 's' : ''}
          </div>
        </div>
      )}

      {selectedIds.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3 px-6 py-3 rounded-xl bg-app-card border border-app-border shadow-xl backdrop-blur-xl z-50">
          <span className="text-sm text-app-text font-medium">{selectedIds.length} selected</span>
          {isAdmin && (
            <button onClick={handleBulkDeactivate}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-red-500/20 text-red-400 text-sm font-medium hover:bg-red-500/30">
              <Ban className="h-3.5 w-3.5" /> Deactivate
            </button>
          )}
          <button onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-app-surface-tertiary text-app-muted text-sm font-medium hover:bg-app-hover">
            <Download className="h-3.5 w-3.5" /> Export Selected
          </button>
          <button onClick={clearSelection} className="px-4 py-1.5 rounded-lg bg-app-surface-tertiary text-app-muted text-sm hover:bg-app-hover">Clear</button>
        </div>
      )}
    </div>
  );
}
