import { useEffect, useState, useCallback } from 'react';
import { Check, X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { timeApi } from '@/lib/api';

interface Timesheet {
  id: string;
  user_name?: string;
  week_start_date?: string;
  total_hours?: number;
  status: string;
}

interface TimesheetActionsProps {
  userId: string;
  onSuccess: () => void;
}

export function TimesheetActions({ userId, onSuccess }: TimesheetActionsProps): JSX.Element {
  const [sheets, setSheets] = useState<Timesheet[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);

  const loadSheets = useCallback(async () => {
    try {
      setLoading(true);
      const result = await timeApi.listTimesheets(userId, { status: 'submitted' });
      const items = (result as { data?: Timesheet[] })?.data ?? [];
      setSheets(Array.isArray(items) ? items : []);
    } catch {
      setSheets([]);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { loadSheets(); }, [loadSheets]);

  const handleApprove = async (id: string): Promise<void> => {
    setActing(id);
    try {
      await timeApi.approveTimesheet(userId, id);
      toast.success('Timesheet approved');
      setSheets((prev) => prev.filter((s) => s.id !== id));
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
      await timeApi.rejectTimesheet(userId, id, 'Rejected from command center');
      toast.success('Timesheet rejected');
      setSheets((prev) => prev.filter((s) => s.id !== id));
      onSuccess();
    } catch {
      toast.error('Failed to reject timesheet');
    } finally {
      setActing(null);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-app-muted" /></div>;
  }

  if (sheets.length === 0) {
    return <div className="text-center py-8 text-app-muted text-sm">No pending timesheets</div>;
  }

  return (
    <div className="space-y-2" data-testid="timesheet-actions">
      {sheets.map((ts) => (
        <div key={ts.id} className="flex items-center justify-between p-3 rounded-lg border border-app bg-app hover:bg-app-hover transition-colors">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-app truncate">{ts.user_name || 'Unknown'}</div>
            <div className="text-xs text-app-muted">
              Week of {ts.week_start_date ?? 'Unknown'} &middot; {(ts.total_hours ?? 0).toFixed(1)}h
            </div>
          </div>
          <div className="flex items-center gap-1.5 ml-3">
            <button
              onClick={() => handleApprove(ts.id)}
              disabled={acting === ts.id}
              className="p-1.5 rounded-md bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 transition-colors disabled:opacity-50"
              title="Approve"
            >
              {acting === ts.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            </button>
            <button
              onClick={() => handleReject(ts.id)}
              disabled={acting === ts.id}
              className="p-1.5 rounded-md bg-red-500/15 text-red-400 hover:bg-red-500/25 transition-colors disabled:opacity-50"
              title="Reject"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
