import { useEffect, useState, useCallback } from 'react';
import { Loader2, ArrowRight, X } from 'lucide-react';
import { toast } from 'sonner';
import { recruitmentAPI } from '@/lib/api';

interface Application {
  id: string;
  candidate_name?: string;
  candidate?: { first_name?: string; last_name?: string };
  job_title?: string;
  job?: { title?: string };
  stage: string;
  applied_at?: string;
}

interface HRActionsProps {
  userId: string;
  onSuccess: () => void;
}

export function HRActions({ userId, onSuccess }: HRActionsProps): JSX.Element {
  const [apps, setApps] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);

  const loadApps = useCallback(async () => {
    try {
      setLoading(true);
      const result = await recruitmentAPI.listApplications(userId);
      const items = (result as { data?: Application[] })?.data ?? [];
      setApps(Array.isArray(items) ? items.filter((a) => !['rejected', 'hired', 'withdrawn'].includes(a.stage)).slice(0, 10) : []);
    } catch {
      setApps([]);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { loadApps(); }, [loadApps]);

  const getName = (app: Application): string => {
    if (app.candidate_name) return app.candidate_name;
    if (app.candidate) return [app.candidate.first_name, app.candidate.last_name].filter(Boolean).join(' ') || 'Unknown';
    return 'Unknown';
  };

  const getJob = (app: Application): string => app.job_title ?? app.job?.title ?? 'Unknown Position';

  const handleAdvance = async (id: string): Promise<void> => {
    setActing(id);
    try {
      const STAGES = ['applied', 'screening', 'interview', 'offer', 'hired'];
      const app = apps.find((a) => a.id === id);
      if (!app) return;
      const idx = STAGES.indexOf(app.stage);
      const nextStage = idx >= 0 && idx < STAGES.length - 1 ? STAGES[idx + 1] : null;
      if (nextStage) {
        await recruitmentAPI.moveApplicationStage(userId, id, nextStage);
        toast.success(`Moved to ${nextStage}`);
        loadApps();
        onSuccess();
      } else {
        toast.info('Already at final stage');
      }
    } catch {
      toast.error('Failed to advance application');
    } finally {
      setActing(null);
    }
  };

  const handleReject = async (id: string): Promise<void> => {
    setActing(id);
    try {
      await recruitmentAPI.rejectApplication(userId, id, 'Rejected from command center');
      toast.success('Application rejected');
      setApps((prev) => prev.filter((a) => a.id !== id));
      onSuccess();
    } catch {
      toast.error('Failed to reject application');
    } finally {
      setActing(null);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-app-muted" /></div>;
  }

  if (apps.length === 0) {
    return <div className="text-center py-8 text-app-muted text-sm">No pending applications</div>;
  }

  return (
    <div className="space-y-2" data-testid="hr-actions">
      {apps.map((app) => (
        <div key={app.id} className="flex items-center justify-between p-3 rounded-lg border border-app bg-app hover:bg-app-hover transition-colors">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-app truncate">{getName(app)}</div>
            <div className="text-xs text-app-muted">{getJob(app)} &middot; {app.stage}</div>
          </div>
          <div className="flex items-center gap-1.5 ml-3">
            <button
              onClick={() => handleAdvance(app.id)}
              disabled={acting === app.id}
              className="flex items-center gap-1 px-2 py-1.5 rounded-md text-xs bg-blue-500/15 text-blue-400 hover:bg-blue-500/25 transition-colors disabled:opacity-50"
            >
              {acting === app.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowRight className="w-3.5 h-3.5" />}
              Advance
            </button>
            <button
              onClick={() => handleReject(app.id)}
              disabled={acting === app.id}
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
