import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bolt, Bot, CheckCircle2, Rocket, Timer } from 'lucide-react';
import { DataTable, type ColumnDef } from '@/components/ui/DataTable';
import { SlideOverPanel } from '@/components/ui/SlideOverPanel';
import { Button } from '@/components/ui/Button';
import { KPICard } from '@/components/finance/KPICard';
import { useAuthStore } from '@/stores/authStore';
import { doraAutomationsApi } from '@/lib/doraAutomationsApi';
import { PolicyBuilderPanel } from './components/PolicyBuilderPanel';

export function AutomationPoliciesPage() {
  const { user } = useAuthStore();
  const userId = user?.authUserId || user?.id || '';
  const [stats, setStats] = useState<any>(null);
  const [policies, setPolicies] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [builderOpen, setBuilderOpen] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const [s, p] = await Promise.all([
        doraAutomationsApi.getStats(userId),
        doraAutomationsApi.listPolicies(userId),
      ]);
      setStats(s);
      setPolicies(Array.isArray(p?.policies) ? p.policies : []);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const columns = useMemo<ColumnDef<any>[]>(() => [
    { key: 'name', header: 'Name', render: (_v, row) => <div><div className="font-medium text-app">{row.name}</div><div className="text-xs text-app-muted">{row.description || ''}</div></div> },
    { key: 'trigger_event', header: 'Trigger' },
    {
      key: 'conditions',
      header: 'Conditions',
      render: (_v, row) => {
        if (!Array.isArray(row.conditions) || row.conditions.length === 0) return 'Any';
        return row.conditions.map((c: any) => `${c.field} ${c.operator} ${String(c.value)}`).join(' AND ');
      },
    },
    { key: 'action_type', header: 'Action' },
    { key: 'risk_level', header: 'Risk' },
    { key: 'execution_count', header: 'Executions' },
    {
      key: 'is_active',
      header: 'Active',
      render: (_v, row) => (
        <button
          type="button"
          className={`rounded-full px-2 py-1 text-xs ${row.is_active ? 'bg-emerald-600/20 text-emerald-400' : 'bg-app-hover text-app-muted'}`}
          onClick={async () => {
            await doraAutomationsApi.togglePolicy(userId, row.id, !row.is_active);
            await load();
          }}
        >
          {row.is_active ? 'On' : 'Off'}
        </button>
      ),
    },
  ], [load, userId]);

  return (
    <div className="flex h-full flex-col bg-app px-6 py-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-app">Dora Automations</h1>
          <p className="text-sm text-app-muted">Define rules for Dora to execute automatically.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/dora/automations/log" className="rounded-lg border border-app-border px-3 py-2 text-sm text-app-muted hover:text-app">
            View Log
          </Link>
          <Button onClick={() => setBuilderOpen(true)}>
            <span className="inline-flex items-center gap-1"><Bolt className="w-4 h-4" />New Policy</span>
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KPICard title="Active Policies" value={String(stats?.activePolicies ?? 0)} icon={Bot} />
        <KPICard title="Executions This Week" value={String(stats?.executionsThisWeek ?? 0)} icon={Rocket} />
        <KPICard title="Actions Auto-Approved" value={String(stats?.autoApprovedCount ?? 0)} icon={CheckCircle2} />
        <KPICard title="Estimated Time Saved" value={`${stats?.estimatedTimeSavedMinutes ?? 0} min`} icon={Timer} />
      </div>

      <div className="mt-4 rounded-xl border border-app-border bg-app-card p-3">
        <DataTable data={policies} columns={columns} isLoading={loading} emptyMessage="No automation policies yet." />
      </div>

      <SlideOverPanel
        isOpen={builderOpen}
        onClose={() => setBuilderOpen(false)}
        title="Create Automation Policy"
        width={720}
      >
        <PolicyBuilderPanel
          onCancel={() => setBuilderOpen(false)}
          onCreate={async (payload) => {
            await doraAutomationsApi.createPolicy(userId, payload);
            setBuilderOpen(false);
            await load();
          }}
        />
      </SlideOverPanel>
    </div>
  );
}
