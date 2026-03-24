import { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { financeAPI, type PeriodClose } from '@/lib/financeApi';
import { cn } from '@/lib/utils';
import {
  CheckCircle, Circle, Lock, Unlock, CalendarCheck, AlertTriangle,
} from 'lucide-react';

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  open: { label: 'Open', color: 'text-blue-400', bg: 'bg-blue-500/20' },
  in_progress: { label: 'In Progress', color: 'text-yellow-400', bg: 'bg-yellow-500/20' },
  closed: { label: 'Closed', color: 'text-green-400', bg: 'bg-green-500/20' },
  locked: { label: 'Locked', color: 'text-red-400', bg: 'bg-red-500/20' },
};

export function PeriodClosePage() {
  const { user } = useAuthStore();
  const [periodClose, setPeriodClose] = useState<PeriodClose | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  const fetchPeriodClose = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const pc = await financeAPI.getPeriodClose(user.id, selectedPeriod);
      setPeriodClose(pc);
    } catch (err) {
      console.error('Failed to load period close:', err);
    } finally {
      setLoading(false);
    }
  }, [user?.id, selectedPeriod]);

  useEffect(() => { fetchPeriodClose(); }, [fetchPeriodClose]);

  const toggleTask = async (taskKey: string, currentlyCompleted: boolean) => {
    if (!user?.id || !periodClose) return;
    try {
      await financeAPI.updatePeriodCloseTask(user.id, periodClose.id, taskKey, !currentlyCompleted);
      fetchPeriodClose();
    } catch (err) {
      console.error('Failed to update task:', err);
    }
  };

  const handleAction = async (action: 'close' | 'lock' | 'reopen') => {
    if (!user?.id || !periodClose) return;
    setActionLoading(true);
    try {
      if (action === 'close') await financeAPI.closePeriod(user.id, periodClose.id);
      else if (action === 'lock') await financeAPI.lockPeriod(user.id, periodClose.id);
      else await financeAPI.reopenPeriod(user.id, periodClose.id);
      fetchPeriodClose();
    } catch (err: any) {
      alert(err.message || 'Action failed');
    } finally {
      setActionLoading(false);
    }
  };

  const periodOptions = (() => {
    const now = new Date();
    const options: string[] = [];
    for (let i = 0; i < 24; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      options.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    return options;
  })();

  const tasks = periodClose?.tasks || [];
  const completedCount = tasks.filter(t => t.is_completed).length;
  const totalCount = tasks.length;
  const progressPct = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;
  const statusCfg = STATUS_CONFIG[periodClose?.status || 'open'];
  const isEditable = periodClose?.status !== 'closed' && periodClose?.status !== 'locked';

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-20 rounded-xl bg-white/5 animate-pulse" />
        <div className="h-64 rounded-xl bg-white/5 animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <select
          value={selectedPeriod}
          onChange={e => setSelectedPeriod(e.target.value)}
          className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-app-text focus:border-primary-500 focus:outline-none"
        >
          {periodOptions.map(p => <option key={p} value={p}>{p}</option>)}
        </select>

        {periodClose && (
          <span className={cn('px-3 py-1 rounded-full text-xs font-medium', statusCfg?.color, statusCfg?.bg)}>
            {statusCfg?.label}
          </span>
        )}
      </div>

      {periodClose && (
        <>
          <div className="rounded-xl border border-white/10 bg-white/5 p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-app-text">Period Close Progress</h3>
              <span className="text-sm text-app-muted">{completedCount}/{totalCount} tasks</span>
            </div>
            <div className="w-full h-3 rounded-full bg-white/10 overflow-hidden">
              <div
                className={cn('h-full rounded-full transition-all duration-500',
                  progressPct === 100 ? 'bg-green-500' : progressPct > 50 ? 'bg-yellow-500' : 'bg-blue-500')}
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/5 divide-y divide-white/5">
            {tasks.map(task => (
              <div
                key={task.task_key}
                className={cn('flex items-center gap-4 px-5 py-4 transition-colors',
                  isEditable ? 'cursor-pointer hover:bg-white/5' : '',
                  (task.is_completed ?? false) && 'opacity-70')}
                onClick={() => isEditable && toggleTask(task.task_key, task.is_completed ?? false)}
              >
                {task.is_completed ? (
                  <CheckCircle className="h-5 w-5 text-green-400 shrink-0" />
                ) : (
                  <Circle className="h-5 w-5 text-app-muted shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className={cn('text-sm', task.is_completed ? 'text-app-muted line-through' : 'text-app-text')}>
                    {task.label}
                  </p>
                  {task.completed_at && (
                    <p className="text-xs text-app-muted mt-0.5">
                      Completed {new Date(task.completed_at).toLocaleDateString()} {new Date(task.completed_at).toLocaleTimeString()}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>

          {periodClose.status === 'closed' && periodClose.revenue_total != null && (
            <div className="rounded-xl border border-green-500/30 bg-green-500/10 p-5">
              <h3 className="text-sm font-semibold text-app-text mb-3">Period Summary</h3>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-xs text-app-muted">Revenue</p>
                  <p className="text-lg font-bold text-green-400">${periodClose.revenue_total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                </div>
                <div>
                  <p className="text-xs text-app-muted">Expenses</p>
                  <p className="text-lg font-bold text-red-400">${(periodClose.expense_total || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                </div>
                <div>
                  <p className="text-xs text-app-muted">Net Income</p>
                  <p className={cn('text-lg font-bold', (periodClose.net_income || 0) >= 0 ? 'text-green-400' : 'text-red-400')}>
                    ${Math.abs(periodClose.net_income || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    {(periodClose.net_income || 0) < 0 ? ' (Loss)' : ''}
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center gap-3">
            {periodClose.status === 'in_progress' && completedCount === totalCount && (
              <button
                onClick={() => handleAction('close')}
                disabled={actionLoading}
                className="flex items-center gap-2 px-5 py-2.5 bg-green-600 text-app-text rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50"
              >
                <CalendarCheck className="h-4 w-4" /> Close Period
              </button>
            )}
            {periodClose.status === 'in_progress' && completedCount < totalCount && (
              <div className="flex items-center gap-2 text-sm text-yellow-400">
                <AlertTriangle className="h-4 w-4" />
                Complete all tasks before closing the period
              </div>
            )}
            {periodClose.status === 'closed' && (
              <>
                <button
                  onClick={() => handleAction('lock')}
                  disabled={actionLoading}
                  className="flex items-center gap-2 px-5 py-2.5 bg-red-600 text-app-text rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50"
                >
                  <Lock className="h-4 w-4" /> Lock Period
                </button>
                <button
                  onClick={() => handleAction('reopen')}
                  disabled={actionLoading}
                  className="flex items-center gap-2 px-5 py-2.5 text-app-muted border border-white/10 rounded-lg text-sm font-medium hover:bg-white/5 disabled:opacity-50"
                >
                  <Unlock className="h-4 w-4" /> Reopen
                </button>
              </>
            )}
            {periodClose.status === 'locked' && (
              <div className="flex items-center gap-2 text-sm text-red-400">
                <Lock className="h-4 w-4" />
                This period is locked and cannot be modified
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
