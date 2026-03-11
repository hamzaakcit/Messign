import { useCallback, useEffect, useMemo, useState } from 'react';
import { DoraInsightBar } from '@/components/dora/DoraInsightBar';
import { KPICard } from '@/components/finance/KPICard';
import { DataTable, type ColumnDef } from '@/components/ui/DataTable';
import { SlideOverPanel } from '@/components/ui/SlideOverPanel';
import { Badge } from '@/components/ui/Badge';
import { useAuthStore } from '@/stores/authStore';
import { contractsAPI, type Contract } from '@/lib/contractsApi';
import { ContractsNav } from './components/ContractsNav';
import { BellRing, CheckCheck, ClipboardList, FileSignature, FileText } from 'lucide-react';

type Tab = 'contracts' | 'renewals' | 'obligations' | 'dashboard';

interface Props {
  initialTab?: Tab;
}

function statusVariant(status: string): 'green' | 'blue' | 'orange' | 'red' | 'default' {
  if (status === 'active') return 'green';
  if (status === 'pending_signature') return 'blue';
  if (status === 'expiring') return 'orange';
  if (status === 'terminated') return 'red';
  return 'default';
}

export function ContractsPage({ initialTab = 'contracts' }: Props) {
  const { user } = useAuthStore();
  const userId = user?.authUserId || user?.id || '';
  const [tab] = useState<Tab>(initialTab);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [expiring, setExpiring] = useState<Array<Record<string, unknown>>>([]);
  const [obligations, setObligations] = useState<Array<Record<string, unknown>>>([]);
  const [metrics, setMetrics] = useState<Record<string, number>>({});
  const [selectedContractId, setSelectedContractId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const [contractRes, expiringRes, obligationsRes, metricsRes] = await Promise.all([
        contractsAPI.listContracts(userId, { page: '1', pageSize: '50' }),
        contractsAPI.getExpiring(userId, 90),
        contractsAPI.listObligations(userId),
        contractsAPI.getMetrics(userId),
      ]);
      setContracts(contractRes.data);
      setExpiring(expiringRes);
      setObligations(obligationsRes);
      setMetrics(metricsRes);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const pendingSignatures = useMemo(
    () =>
      contracts.reduce((sum, c) => {
        const sigs = c.signatories || [];
        return sum + sigs.filter((s) => String(s.status) === 'pending').length;
      }, 0),
    [contracts],
  );

  const contractColumns = useMemo<ColumnDef<Contract>[]>(
    () => [
      { key: 'title', header: 'Title' },
      { key: 'type', header: 'Type', render: (value: string) => <Badge variant="default">{value}</Badge> },
      { key: 'counterparty_name', header: 'Counterparty' },
      { key: 'total_value', header: 'Value', render: (value: number, row) => (value ? `${row.currency} ${Number(value).toLocaleString()}` : '-') },
      { key: 'status', header: 'Status', render: (value: string) => <Badge variant={statusVariant(value)}>{value}</Badge> },
      {
        key: 'dates',
        header: 'Start-End',
        render: (_value, row) => `${row.start_date ?? '-'} → ${row.end_date ?? '-'}`,
      },
      {
        key: 'days',
        header: 'Days to Expiry',
        render: (_value, row) => {
          if (!row.end_date) return '-';
          const days = Math.floor((new Date(row.end_date).getTime() - Date.now()) / 86400000);
          return <span className={days < 30 ? 'text-red-400' : days < 60 ? 'text-amber-400' : 'text-app-text'}>{days}</span>;
        },
      },
      { key: 'auto_renew', header: 'Auto-Renew', render: (v: boolean) => <Badge variant={v ? 'green' : 'default'}>{v ? 'ON' : 'OFF'}</Badge> },
      {
        key: 'signatures',
        header: 'Signatures',
        render: (_v, row) => `${(row.signatories || []).filter((s) => String(s.status) === 'signed').length}/${(row.signatories || []).length}`,
      },
    ],
    [],
  );

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[1600px] mx-auto px-6 pt-6 pb-4">
          <ContractsNav />
          <DoraInsightBar module="contracts" fallback="Dora tracks renewals and extracts key terms from your contracts." />

          <div className="grid grid-cols-1 sm:grid-cols-5 gap-4 mb-6">
            <KPICard title="Active Contracts" value={metrics.totalActive ?? 0} icon={FileText} />
            <KPICard title="Total Value" value={`€${Number(metrics.totalValue ?? 0).toLocaleString()}`} icon={FileSignature} />
            <KPICard title="Expiring This Month" value={metrics.expiringThisMonth ?? 0} icon={BellRing} />
            <KPICard title="Pending Signatures" value={pendingSignatures} icon={CheckCheck} />
            <KPICard title="Compliance Due" value={metrics.complianceDue ?? 0} icon={ClipboardList} />
          </div>

          {tab === 'contracts' && (
            <DataTable
              data={contracts}
              columns={contractColumns}
              isLoading={loading}
              onRowClick={(row) => setSelectedContractId(row.id)}
              emptyMessage="No contracts found."
            />
          )}

          {tab === 'renewals' && (
            <div className="space-y-3">
              {expiring.map((item) => {
                const days = Number(item.days_until_expiry ?? 999);
                const cls = days < 30 ? 'border-red-500/30' : days < 60 ? 'border-amber-500/30' : 'border-green-500/30';
                return (
                  <div key={String(item.contract_id)} className={`rounded-lg border ${cls} bg-app-card p-4`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-semibold text-app-text">{String(item.title)}</div>
                        <div className="text-xs text-app-muted">{String(item.counterparty_name ?? '')}</div>
                      </div>
                      <Badge variant={days < 30 ? 'red' : days < 60 ? 'orange' : 'green'}>{days}d</Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {tab === 'obligations' && (
            <DataTable
              data={obligations}
              columns={[
                { key: 'contract_title', header: 'Contract' },
                { key: 'description', header: 'Description' },
                { key: 'obligation_type', header: 'Type' },
                { key: 'responsible_party', header: 'Responsible' },
                { key: 'due_date', header: 'Due Date' },
                { key: 'status', header: 'Status', render: (value: string) => <Badge variant={value === 'overdue' ? 'red' : value === 'completed' ? 'green' : 'default'}>{value}</Badge> },
                {
                  key: 'actions',
                  header: 'Action',
                  render: (_v, row: Record<string, unknown>) => (
                    <button
                      className="text-xs text-primary-300"
                      onClick={(e) => {
                        e.stopPropagation();
                        void contractsAPI.completeObligation(userId, String(row.id)).then(load);
                      }}
                    >
                      Mark complete
                    </button>
                  ),
                },
              ]}
              isLoading={loading}
              rowClassName={(row) => String(row.status) === 'overdue' ? 'bg-red-500/5' : ''}
              emptyMessage="No obligations found."
            />
          )}

          {tab === 'dashboard' && (
            <div className="rounded-xl border border-app-border bg-app-card p-5">
              <h3 className="text-lg font-semibold text-app-text mb-2">Renewal + Compliance Summary</h3>
              <p className="text-sm text-app-muted">
                {expiring.length} contracts are within the next 90 days. {obligations.filter((o) => String(o.status) === 'overdue').length} obligations are overdue.
              </p>
            </div>
          )}
        </div>
      </div>

      <SlideOverPanel isOpen={!!selectedContractId} onClose={() => setSelectedContractId(null)} title="Contract Detail" width={760}>
        {selectedContractId && <ContractDetail contractId={selectedContractId} userId={userId} onUpdated={load} />}
      </SlideOverPanel>
    </div>
  );
}

function ContractDetail({ contractId, userId, onUpdated }: { contractId: string; userId: string; onUpdated: () => Promise<void> }) {
  const [contract, setContract] = useState<Contract | null>(null);
  useEffect(() => {
    void contractsAPI.getContract(userId, contractId).then(setContract);
  }, [contractId, userId]);
  if (!contract) return <div className="text-sm text-app-muted">Loading…</div>;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Badge variant={statusVariant(contract.status)}>{contract.status}</Badge>
        <Badge variant="default">{contract.type}</Badge>
      </div>
      <h3 className="text-lg font-semibold text-app-text">{contract.title}</h3>
      <div className="text-sm text-app-muted">{contract.counterparty_name}</div>
      {contract.dora_extracted_terms && (
        <div className="rounded-lg border border-app-border p-3">
          <div className="text-xs uppercase text-app-muted mb-2">Dora AI Terms</div>
          <pre className="text-xs whitespace-pre-wrap">{JSON.stringify(contract.dora_extracted_terms, null, 2)}</pre>
        </div>
      )}
      <div className="flex gap-2">
        <button className="px-3 py-2 rounded-lg bg-primary-500/20 text-primary-300 text-sm" onClick={() => void contractsAPI.extractTerms(userId, contract.id).then(onUpdated)}>
          Extract Terms with Dora
        </button>
        <button className="px-3 py-2 rounded-lg bg-white/10 text-app-text text-sm" onClick={() => void contractsAPI.activateContract(userId, contract.id).then(onUpdated)}>
          Activate
        </button>
      </div>
    </div>
  );
}
