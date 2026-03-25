import { useEffect, useState, useCallback } from 'react';
import { Loader2, Check } from 'lucide-react';
import { toast } from 'sonner';
import { listGoals, checkIn, type Goal } from '@/lib/okrApi';

interface OKRActionsProps {
  userId: string;
  onSuccess: () => void;
}

export function OKRActions({ userId, onSuccess }: OKRActionsProps): JSX.Element {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [checkInValues, setCheckInValues] = useState<Record<string, string>>({});

  const loadGoals = useCallback(async () => {
    try {
      setLoading(true);
      const result = await listGoals(userId);
      setGoals(Array.isArray(result) ? result.filter((g) => g.status !== 'completed').slice(0, 10) : []);
    } catch {
      setGoals([]);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { loadGoals(); }, [loadGoals]);

  const handleCheckIn = async (goal: Goal): Promise<void> => {
    const kr = goal.key_results?.[0];
    if (!kr) { toast.info('No key results to check in'); return; }

    const valueStr = checkInValues[kr.id];
    const value = parseFloat(valueStr);
    if (isNaN(value)) { toast.error('Enter a valid number'); return; }

    setActing(kr.id);
    try {
      await checkIn(kr.id, value, 'Check-in from Command Center', undefined, userId);
      toast.success('Check-in recorded');
      setCheckInValues((prev) => {
        const next = { ...prev };
        delete next[kr.id];
        return next;
      });
      loadGoals();
      onSuccess();
    } catch {
      toast.error('Failed to check in');
    } finally {
      setActing(null);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-app-muted" /></div>;
  }

  if (goals.length === 0) {
    return <div className="text-center py-8 text-app-muted text-sm">No active goals</div>;
  }

  const STATUS_DOT: Record<string, string> = {
    on_track: 'bg-emerald-400',
    at_risk: 'bg-amber-400',
    behind: 'bg-red-400',
    off_track: 'bg-red-400',
  };

  return (
    <div className="space-y-2" data-testid="okr-actions">
      {goals.map((goal) => {
        const kr = goal.key_results?.[0];
        return (
          <div key={goal.id} className="p-3 rounded-lg border border-app bg-app hover:bg-app-hover transition-colors">
            <div className="flex items-center gap-2 mb-1.5">
              <span className={`w-2 h-2 rounded-full ${STATUS_DOT[goal.status] ?? 'bg-slate-400'}`} />
              <span className="text-sm font-medium text-app truncate">{goal.title}</span>
              <span className="text-xs text-app-muted ml-auto">{goal.progress?.toFixed(0) ?? 0}%</span>
            </div>
            {kr && (
              <div className="flex items-center gap-2 mt-2">
                <span className="text-xs text-app-muted truncate flex-1">{kr.title}</span>
                <input
                  type="number"
                  placeholder={String(kr.current_value ?? 0)}
                  value={checkInValues[kr.id] ?? ''}
                  onChange={(e) => setCheckInValues((prev) => ({ ...prev, [kr.id]: e.target.value }))}
                  className="w-16 px-2 py-1 text-xs rounded border border-app bg-app text-app focus:border-primary-500 outline-none"
                />
                <button
                  onClick={() => handleCheckIn(goal)}
                  disabled={acting === kr.id}
                  className="p-1.5 rounded-md bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 transition-colors disabled:opacity-50"
                >
                  {acting === kr.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
