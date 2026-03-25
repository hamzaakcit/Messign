import { useEffect, useState, useCallback } from 'react';
import { Check, X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { financeAPI } from '@/lib/api';

interface PendingExpense {
  id: string;
  title: string;
  original_amount?: number;
  amount?: number;
  original_currency?: string;
  currency?: string;
  submitted_by_name?: string;
  status: string;
  created_at?: string;
}

interface FinanceActionsProps {
  userId: string;
  onSuccess: () => void;
}

export function FinanceActions({ userId, onSuccess }: FinanceActionsProps): JSX.Element {
  const [expenses, setExpenses] = useState<PendingExpense[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);

  const loadExpenses = useCallback(async () => {
    try {
      setLoading(true);
      const result = await financeAPI.listExpenses(userId, { status: 'submitted' });
      const items = (result as { data?: PendingExpense[] })?.data ?? [];
      setExpenses(Array.isArray(items) ? items : []);
    } catch {
      setExpenses([]);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { loadExpenses(); }, [loadExpenses]);

  const handleApprove = async (id: string): Promise<void> => {
    setActing(id);
    try {
      await financeAPI.approveExpense(userId, id);
      toast.success('Expense approved');
      setExpenses((prev) => prev.filter((e) => e.id !== id));
      onSuccess();
    } catch {
      toast.error('Failed to approve expense');
    } finally {
      setActing(null);
    }
  };

  const handleReject = async (id: string): Promise<void> => {
    setActing(id);
    try {
      await financeAPI.rejectExpense(userId, id, 'Rejected from command center');
      toast.success('Expense rejected');
      setExpenses((prev) => prev.filter((e) => e.id !== id));
      onSuccess();
    } catch {
      toast.error('Failed to reject expense');
    } finally {
      setActing(null);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-app-muted" /></div>;
  }

  if (expenses.length === 0) {
    return <div className="text-center py-8 text-app-muted text-sm">No pending expenses</div>;
  }

  return (
    <div className="space-y-2" data-testid="finance-actions">
      {expenses.map((exp) => (
        <div key={exp.id} className="flex items-center justify-between p-3 rounded-lg border border-app bg-app hover:bg-app-hover transition-colors">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-app truncate">{exp.title || 'Untitled'}</div>
            <div className="text-xs text-app-muted">
              {exp.submitted_by_name ?? 'Unknown'} &middot;{' '}
              €{((exp.original_amount ?? exp.amount ?? 0)).toFixed(2)}
            </div>
          </div>
          <div className="flex items-center gap-1.5 ml-3">
            <button
              onClick={() => handleApprove(exp.id)}
              disabled={acting === exp.id}
              className="p-1.5 rounded-md bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 transition-colors disabled:opacity-50"
              title="Approve"
            >
              {acting === exp.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            </button>
            <button
              onClick={() => handleReject(exp.id)}
              disabled={acting === exp.id}
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
