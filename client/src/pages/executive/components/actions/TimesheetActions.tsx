import { useEffect, useState, useCallback } from 'react';
import { Loader2, Check, X } from 'lucide-react';
import { toast } from 'sonner';
import { executiveAPI, type PendingItems } from '@/lib/executiveApi';

interface TimesheetActionsProps {
  userId: string;
  onSuccess: () => void;
}

export function TimesheetActions({ userId, onSuccess }: TimesheetActionsProps): JSX.Element {
  const [rows, setRows] = useState<PendingItems['timesheets']>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await executiveAPI.getPendingItems(userId);
      setRows(Array.isArray(data.timesheets) ? data.timesheets : []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleApprove = async (id: string): Promise<void> => {
    setActing(id);
    try {
      await executiveAPI.approveTimesheet(userId, id);
      toast.success('Timesheet approved');
      setRows((prev) => prev.filter((t) => t.id !== id));
      onSuccess();
    } catch {
      toast.error('Failed to approve timesheet');
    } finally {
      setActing(null);
    }
  };

  const handleReject = async (id: string): Promise<void> => {
    setActing(id);
    try {
      await executiveAPI.rejectTimesheet(userId, id, 'Rejected from Command Center');
      toast.success('Timesheet rejected');
      setRows((prev) => prev.filter((t) => t.id !== id));
      onSuccess();
    } catch {
      toast.error('Failed to reject timesheet');
    } finally {
      setActing(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-app-muted" />
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="text-center py-8 text-app-muted text-sm" data-testid="timesheet-actions">
        No pending timesheets
      </div>
    );
  }

  return (
    <div className="space-y-2" data-testid="timesheet-actions">
      {rows.map((t) => (
        <div
          key={t.id}
          className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-lg border border-app bg-app hover:bg-app-hover transition-colors"
        >
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-app truncate">{t.userName}</div>
            <div className="text-xs text-app-muted">
              Week {t.period} &middot; {t.totalHours.toFixed(1)}h
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => void handleApprove(t.id)}
              disabled={acting === t.id}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 transition-colors disabled:opacity-50"
              title="Approve"
            >
              {acting === t.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              Approve
            </button>
            <button
              type="button"
              onClick={() => void handleReject(t.id)}
              disabled={acting === t.id}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium bg-red-500/15 text-red-400 hover:bg-red-500/25 transition-colors disabled:opacity-50"
              title="Reject"
            >
              <X className="w-3.5 h-3.5" />
              Reject
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
