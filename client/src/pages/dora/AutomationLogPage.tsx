import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { DataTable, type ColumnDef } from '@/components/ui/DataTable';
import { SlideOverPanel } from '@/components/ui/SlideOverPanel';
import { useAuthStore } from '@/stores/authStore';
import { doraAutomationsApi } from '@/lib/doraAutomationsApi';

export function AutomationLogPage() {
  const { user } = useAuthStore();
  const userId = user?.authUserId || user?.id || '';
  const [rows, setRows] = useState<any[]>([]);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<any | null>(null);

  const load = useCallback(async (nextPage: number = page) => {
    if (!userId) return;
    setLoading(true);
    try {
      const result = await doraAutomationsApi.listLog(userId, { page: nextPage + 1 });
      setRows(Array.isArray(result?.data) ? result.data : []);
      setTotal(Number(result?.total ?? 0));
      setPage(nextPage);
    } finally {
      setLoading(false);
    }
  }, [page, userId]);

  useEffect(() => {
    void load(0);
  }, [load]);

  const columns = useMemo<ColumnDef<any>[]>(() => [
    { key: 'created_at', header: 'Time' },
    { key: 'policy_name', header: 'Policy' },
    { key: 'trigger_event', header: 'Trigger Event' },
    { key: 'action_type', header: 'Action' },
    { key: 'risk_level', header: 'Risk' },
    { key: 'execution_status', header: 'Status' },
    {
      key: 'can_undo',
      header: 'Undo',
      render: (_v, row) => {
        const canUndo = row.can_undo && row.undo_deadline && !row.undone_at && new Date(row.undo_deadline).getTime() > Date.now();
        if (!canUndo) return '-';
        return (
          <button
            type="button"
            className="rounded-lg border border-app-border px-2 py-1 text-xs text-app-muted hover:text-app"
            onClick={async (e) => {
              e.stopPropagation();
              await doraAutomationsApi.undoLog(userId, row.id);
              await load(page);
            }}
          >
            Undo
          </button>
        );
      },
    },
  ], [load, page, userId]);

  return (
    <div className="flex h-full flex-col bg-app px-6 py-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-app">Automation Log</h1>
          <p className="text-sm text-app-muted">Recent autonomous actions and outcomes.</p>
        </div>
        <Link to="/dora/automations" className="rounded-lg border border-app-border px-3 py-2 text-sm text-app-muted hover:text-app">
          Back to Policies
        </Link>
      </div>

      <div className="rounded-xl border border-app-border bg-app-card p-3">
        <DataTable
          data={rows}
          columns={columns}
          isLoading={loading}
          emptyMessage="No automation executions yet."
          pagination
          currentPage={page}
          totalItems={total}
          pageSize={30}
          onPageChange={(nextPage) => void load(nextPage)}
          onRowClick={async (row) => {
            const detail = await doraAutomationsApi.getLogDetail(userId, row.id);
            setSelected(detail);
          }}
        />
      </div>

      <SlideOverPanel
        isOpen={Boolean(selected)}
        onClose={() => setSelected(null)}
        title="Execution Detail"
        width={760}
      >
        <div className="space-y-4 p-5 text-sm">
          <div>
            <div className="text-app-muted">Policy</div>
            <div className="text-app">{selected?.policy_name}</div>
          </div>
          <div>
            <div className="text-app-muted">Trigger Event</div>
            <div className="text-app">{selected?.trigger_event}</div>
          </div>
          <div>
            <div className="text-app-muted">Result</div>
            <pre className="mt-1 overflow-auto rounded-lg border border-app-border bg-app p-3 text-xs text-app">
              {JSON.stringify(selected?.result ?? selected?.error_message ?? {}, null, 2)}
            </pre>
          </div>
          <div>
            <div className="text-app-muted">Payload</div>
            <pre className="mt-1 overflow-auto rounded-lg border border-app-border bg-app p-3 text-xs text-app">
              {JSON.stringify(selected?.trigger_payload ?? {}, null, 2)}
            </pre>
          </div>
        </div>
      </SlideOverPanel>
    </div>
  );
}
