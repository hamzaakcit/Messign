import { useCallback, useEffect, useMemo, useState } from 'react';
import { DoraInsightBar } from '@/components/dora/DoraInsightBar';
import { KPICard } from '@/components/finance/KPICard';
import { DataTable, type ColumnDef } from '@/components/ui/DataTable';
import { SlideOverPanel } from '@/components/ui/SlideOverPanel';
import { Badge } from '@/components/ui/Badge';
import { NLFilterBar, type AvailableField } from '@/components/ui/NLFilterBar';
import { useAuthStore } from '@/stores/authStore';
import { assetsAPI, type Asset, type License } from '@/lib/assetsApi';
import { AssetsNav } from './components/AssetsNav';
import { BarChart3, Box, Euro, ShieldAlert, Sparkles } from 'lucide-react';

const ASSET_FILTER_FIELDS: AvailableField[] = [
  { key: 'status', label: 'Status', type: 'enum', values: ['available', 'assigned', 'in_maintenance', 'retired', 'lost'] },
  { key: 'category', label: 'Category', type: 'string' },
  { key: 'manufacturer', label: 'Manufacturer', type: 'string' },
  { key: 'purchaseCostMin', label: 'Purchase Cost', type: 'number' },
  { key: 'purchaseCostMax', label: 'Purchase Cost', type: 'number' },
  { key: 'warrantyExpiring', label: 'Warranty Expiring', type: 'enum', values: ['true', 'false'] },
];

type Tab = 'equipment' | 'licenses' | 'dashboard';

interface Props {
  initialTab?: Tab;
}

function statusVariant(status: string): 'green' | 'blue' | 'orange' | 'default' {
  if (status === 'available') return 'green';
  if (status === 'assigned') return 'blue';
  if (status === 'in_maintenance') return 'orange';
  return 'default';
}

export function AssetsPage({ initialTab = 'equipment' }: Props) {
  const { user } = useAuthStore();
  const userId = user?.authUserId || user?.id || '';
  const [tab] = useState<Tab>(initialTab);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [licenses, setLicenses] = useState<License[]>([]);
  const [metrics, setMetrics] = useState<Record<string, number>>({});
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [selectedLicenseId, setSelectedLicenseId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const [assetRes, licenseRes, metricRes] = await Promise.all([
        assetsAPI.listAssets(userId, { page: '1', pageSize: '50' }),
        assetsAPI.listLicenses(userId, { page: '1', pageSize: '50' }),
        assetsAPI.getMetrics(userId),
      ]);
      setAssets(assetRes.data);
      setLicenses(licenseRes.data);
      setMetrics(metricRes);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const savingsPotential = useMemo(
    () =>
      licenses
        .filter((l) => l.seats_purchased > 0 && l.seats_used / l.seats_purchased < 0.5)
        .reduce((sum, l) => sum + (l.total_monthly_cost ?? 0) * 0.4, 0),
    [licenses],
  );

  const assetColumns = useMemo<ColumnDef<Asset>[]>(
    () => [
      { key: 'asset_tag', header: 'Asset Tag' },
      { key: 'name', header: 'Name' },
      { key: 'category_name', header: 'Category' },
      {
        key: 'status',
        header: 'Status',
        render: (value: string) => <Badge variant={statusVariant(value)}>{value}</Badge>,
      },
      { key: 'assigned_to_name', header: 'Assigned To' },
      { key: 'purchase_cost', header: 'Purchase Cost', render: (value: number) => (value ? `€${Number(value).toLocaleString()}` : '-') },
      { key: 'current_value', header: 'Current Value', render: (value: number) => (value ? `€${Number(value).toLocaleString()}` : '-') },
      {
        key: 'warranty_end',
        header: 'Warranty',
        render: (value: string | null) => {
          if (!value) return '-';
          const days = Math.floor((new Date(value).getTime() - Date.now()) / 86400000);
          return <span className={days < 30 ? 'text-red-400' : 'text-app-text'}>{days}d</span>;
        },
      },
    ],
    [],
  );

  const licenseColumns = useMemo<ColumnDef<License>[]>(
    () => [
      { key: 'software_name', header: 'Software' },
      { key: 'vendor', header: 'Vendor' },
      { key: 'license_type', header: 'Type' },
      {
        key: 'seats',
        header: 'Seats',
        render: (_v, row) => `${row.seats_used}/${row.seats_purchased}`,
      },
      {
        key: 'util',
        header: 'Utilization',
        render: (_v, row) => {
          const pct = row.seats_purchased > 0 ? (row.seats_used / row.seats_purchased) * 100 : 0;
          const cls = pct > 70 ? 'text-green-400' : pct >= 40 ? 'text-amber-400' : 'text-red-400';
          return <span className={cls}>{pct.toFixed(1)}%</span>;
        },
      },
      { key: 'total_monthly_cost', header: 'Monthly Cost', render: (v: number) => (v ? `€${Number(v).toLocaleString()}` : '-') },
      {
        key: 'expiry_date',
        header: 'Expiry',
        render: (v: string | null) => {
          if (!v) return '-';
          const days = Math.floor((new Date(v).getTime() - Date.now()) / 86400000);
          return <span className={days < 30 ? 'text-red-400' : 'text-app-text'}>{v}</span>;
        },
      },
      { key: 'status', header: 'Status', render: (v: string) => <Badge variant={v === 'active' ? 'green' : 'orange'}>{v}</Badge> },
    ],
    [],
  );

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[1600px] mx-auto px-6 pt-6 pb-4">
          <AssetsNav />
          <DoraInsightBar module="assets" fallback="Dora monitors equipment warranties and license utilization." />

          <div className="grid grid-cols-1 sm:grid-cols-5 gap-4 mb-6">
            <KPICard title="Total Assets" value={metrics.totalAssets ?? assets.length} icon={Box} />
            <KPICard title="Total Value" value={`€${Number(metrics.totalValue ?? 0).toLocaleString()}`} icon={Euro} />
            <KPICard title="Available" value={metrics.available ?? assets.filter((a) => a.status === 'available').length} icon={Box} />
            <KPICard title="Warranty Expiring (30d)" value={metrics.warrantyExpiring ?? 0} icon={ShieldAlert} />
            <KPICard title="License Savings Potential" value={`€${savingsPotential.toFixed(0)}`} icon={Sparkles} />
          </div>

          {tab === 'equipment' && (
            <div className="space-y-4">
              <NLFilterBar
                placeholder="Try: &quot;available laptops over €1000&quot;"
                availableFields={ASSET_FILTER_FIELDS}
                module="assets"
                onFiltersApplied={() => {}}
              />
            <DataTable
              data={assets}
              columns={assetColumns}
              isLoading={loading}
              onRowClick={(row) => setSelectedAssetId(row.id)}
              rowClassName={(row) => (row.status === 'retired' ? 'opacity-70' : '')}
              emptyMessage="No assets found."
            />
            </div>
          )}

          {tab === 'licenses' && (
            <DataTable
              data={licenses}
              columns={licenseColumns}
              isLoading={loading}
              onRowClick={(row) => setSelectedLicenseId(row.id)}
              rowClassName={(row) => (row.seats_purchased > 0 && row.seats_used / row.seats_purchased < 0.5 ? 'bg-amber-500/5' : '')}
              emptyMessage="No licenses found."
            />
          )}

          {tab === 'dashboard' && (
            <div className="rounded-xl border border-app-border bg-app-card p-5">
              <div className="flex items-center gap-2 mb-2">
                <BarChart3 className="w-5 h-5 text-app-muted" />
                <h3 className="text-lg font-semibold text-app-text">Asset + License Overview</h3>
              </div>
              <p className="text-sm text-app-muted mb-4">
                Total assets: {metrics.totalAssets ?? 0}, assigned: {metrics.assigned ?? 0}, available: {metrics.available ?? 0}, depreciation this month: €
                {Number(metrics.depreciationThisMonth ?? 0).toFixed(2)}.
              </p>
              <div className="space-y-2">
                {licenses.slice(0, 8).map((license) => {
                  const pct = license.seats_purchased > 0 ? (license.seats_used / license.seats_purchased) * 100 : 0;
                  return (
                    <div key={license.id} className="flex items-center gap-3">
                      <div className="w-52 truncate text-sm text-app-text">{license.software_name}</div>
                      <div className="flex-1 h-2 rounded-full bg-white/10 overflow-hidden">
                        <div className="h-full bg-primary-500" style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
                      </div>
                      <div className="w-20 text-right text-sm text-app-muted">{pct.toFixed(1)}%</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      <SlideOverPanel isOpen={!!selectedAssetId} onClose={() => setSelectedAssetId(null)} title="Asset Detail" width={720}>
        {selectedAssetId && <AssetDetail assetId={selectedAssetId} userId={userId} onUpdated={load} />}
      </SlideOverPanel>
      <SlideOverPanel isOpen={!!selectedLicenseId} onClose={() => setSelectedLicenseId(null)} title="License Detail" width={720}>
        {selectedLicenseId && <LicenseDetail licenseId={selectedLicenseId} userId={userId} onUpdated={load} />}
      </SlideOverPanel>
    </div>
  );
}

function AssetDetail({ assetId, userId, onUpdated }: { assetId: string; userId: string; onUpdated: () => Promise<void> }) {
  const [asset, setAsset] = useState<Asset | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true);
    void assetsAPI.getAsset(userId, assetId).then(setAsset).finally(() => setLoading(false));
  }, [assetId, userId]);
  if (loading || !asset) return <div className="text-sm text-app-muted">Loading…</div>;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Badge variant={statusVariant(asset.status)}>{asset.status}</Badge>
        <span className="text-sm text-app-muted">{asset.asset_tag || 'No tag'}</span>
      </div>
      <h3 className="text-lg font-semibold text-app-text">{asset.name}</h3>
      <div className="text-sm text-app-muted">{asset.manufacturer} {asset.model}</div>
      <div className="rounded-lg border border-app-border p-3">
        <div className="text-xs uppercase text-app-muted mb-2">Specifications</div>
        <pre className="text-xs text-app-text whitespace-pre-wrap">{JSON.stringify(asset.specifications ?? {}, null, 2)}</pre>
      </div>
      <div className="flex gap-2">
        <button className="px-3 py-2 rounded-lg bg-primary-500/20 text-primary-300 text-sm" onClick={() => void assetsAPI.retireAsset(userId, asset.id, 'Retired from asset panel').then(onUpdated)}>
          Retire
        </button>
        <button className="px-3 py-2 rounded-lg bg-white/10 text-app-text text-sm" onClick={() => void assetsAPI.returnAsset(userId, asset.id, 'good').then(onUpdated)}>
          Return
        </button>
      </div>
    </div>
  );
}

function LicenseDetail({ licenseId, userId, onUpdated }: { licenseId: string; userId: string; onUpdated: () => Promise<void> }) {
  const [license, setLicense] = useState<License | null>(null);
  useEffect(() => {
    void assetsAPI.getLicense(userId, licenseId).then(setLicense);
  }, [licenseId, userId]);
  if (!license) return <div className="text-sm text-app-muted">Loading…</div>;
  return (
    <div className="space-y-3">
      <h3 className="text-lg font-semibold text-app-text">{license.software_name}</h3>
      <div className="text-sm text-app-muted">{license.vendor || 'Unknown vendor'}</div>
      <div className="text-sm text-app-text">Seats: {license.seats_used}/{license.seats_purchased}</div>
      <div className="text-sm text-app-text">Monthly cost: €{Number(license.total_monthly_cost ?? 0).toFixed(2)}</div>
      <div className="space-y-2">
        {(license.seats || []).map((seat) => (
          <div key={String(seat.id)} className="flex justify-between text-sm">
            <span>{String(seat.user_name ?? seat.user_id)}</span>
            <button className="text-red-300" onClick={() => void assetsAPI.removeSeat(userId, license.id, String(seat.user_id)).then(onUpdated)}>Remove</button>
          </div>
        ))}
      </div>
    </div>
  );
}
