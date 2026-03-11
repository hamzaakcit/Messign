import { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, Clock, Users, Zap, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStore } from '@/stores/authStore';
import { sprintsAPI } from '@/lib/api';
import { Button } from '@/components/ui';

interface SprintHelper {
  user: { id: string; name: string; avatar?: string };
}

interface Sprint {
  id: string;
  title: string;
  description: string;
  skills_needed: string[];
  xp_reward: number;
  max_helpers: number;
  ends_at: string;
  project: { id: string; name: string };
  requester: { id: string; name: string; avatar?: string };
  helpers: SprintHelper[];
}

interface SprintSupportBannerProps {
  compact?: boolean;
}

export function SprintSupportBanner({ compact }: SprintSupportBannerProps = {}) {
  const { user } = useAuthStore();
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [joiningId, setJoiningId] = useState<string | null>(null);

  const fetchSprints = useCallback(async () => {
    if (!user?.id) return;
    try {
      const data = await sprintsAPI.list();
      setSprints(Array.isArray((data as { sprints?: Sprint[] }).sprints) ? (data as { sprints: Sprint[] }).sprints : []);
    } catch {
      setSprints([]);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchSprints();
    const t = setInterval(fetchSprints, 30000);
    return () => clearInterval(t);
  }, [fetchSprints]);

  const handleJoin = async (id: string) => {
    setJoiningId(id);
    try {
      await sprintsAPI.join(id);
      toast.success('Joined sprint!');
      fetchSprints();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to join');
    } finally {
      setJoiningId(null);
    }
  };

  const getTimeRemaining = (endsAt: string) => {
    const diff = new Date(endsAt).getTime() - Date.now();
    if (diff <= 0) return 'Ended';
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${minutes}m`;
  };

  if (!user?.id || sprints.length === 0) return null;

  if (compact) {
    return (
      <div className="h-full min-h-0 flex flex-col gap-2 overflow-y-auto">
        {sprints.map((sprint) => (
          <div
            key={sprint.id}
            className="rounded-xl border border-orange-500/30 bg-gray-900/40 backdrop-blur-md p-3 flex items-center justify-between gap-3 shrink-0"
          >
            <div className="flex-1 min-w-0 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-orange-400 shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-app truncate">
                  {sprint.project?.name ?? 'Project'} · {sprint.title}
                </p>
                <p className="text-xs text-app-muted flex items-center gap-2 mt-0.5">
                  <span className="flex items-center gap-0.5"><Clock className="w-3 h-3" />{getTimeRemaining(sprint.ends_at)}</span>
                  <span className="flex items-center gap-0.5"><Users className="w-3 h-3" />{(sprint.helpers ?? []).length}/{sprint.max_helpers ?? 3}</span>
                  <span className="flex items-center gap-0.5 text-yellow-400"><Zap className="w-3 h-3" />{sprint.xp_reward ?? 100} MP</span>
                </p>
              </div>
            </div>
            <Button
              type="button"
              variant="primary"
              size="sm"
              disabled={joiningId === sprint.id || (sprint.helpers ?? []).length >= (sprint.max_helpers ?? 3)}
              onClick={() => handleJoin(sprint.id)}
              className="gap-1.5 shrink-0"
            >
              <Zap className="w-3 h-3" />
              {joiningId === sprint.id ? '…' : 'Join'}
            </Button>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="mb-6 space-y-3">
      <h2 className="text-lg font-semibold text-app flex items-center gap-2">
        <AlertTriangle className="w-5 h-5 text-orange-400" />
        Sprint Support Needed
        <span className="text-sm font-normal text-app-muted">Teams need your help!</span>
      </h2>
      {sprints.map((sprint) => (
        <div
          key={sprint.id}
          className="bg-app-card border border-orange-500/30 rounded-xl p-4 flex flex-col sm:flex-row sm:items-start justify-between gap-4"
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="text-orange-400 font-medium">{sprint.project?.name ?? 'Project'}</span>
              <ChevronRight className="w-4 h-4 text-app-muted" />
              <span className="text-app font-medium">{sprint.title}</span>
            </div>
            <p className="text-app-muted text-sm mb-3 line-clamp-2">{sprint.description}</p>
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <span className="text-app-muted text-xs">Need:</span>
              {(sprint.skills_needed ?? []).map((skill) => (
                <span key={skill} className="text-xs bg-app-surface-tertiary text-app-muted px-2 py-0.5 rounded">
                  {skill}
                </span>
              ))}
            </div>
            <div className="flex items-center gap-4 text-sm">
              <span className="flex items-center gap-1 text-orange-400">
                <Clock className="w-4 h-4" />
                {getTimeRemaining(sprint.ends_at)} left
              </span>
              <span className="flex items-center gap-1 text-app-muted">
                <Users className="w-4 h-4" />
                {(sprint.helpers ?? []).length}/{sprint.max_helpers ?? 3} helpers
              </span>
              <span className="flex items-center gap-1 text-yellow-400">
                <Zap className="w-4 h-4" />
                {sprint.xp_reward ?? 100} MP
              </span>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2 flex-shrink-0">
            {(sprint.helpers ?? []).length > 0 && (
              <div className="flex -space-x-2">
                {sprint.helpers.slice(0, 3).map((h) => (
                  <div
                    key={h.user.id}
                    className="w-8 h-8 rounded-full bg-app-surface-tertiary border-2 border-app-card flex items-center justify-center overflow-hidden"
                    title={h.user.name}
                  >
                    {h.user.avatar ? (
                      <img src={h.user.avatar} alt={h.user.name} className="w-full h-full object-cover" loading="lazy" width={32} height={32} />
                    ) : (
                      <span className="text-xs text-app-muted">{h.user.name?.[0] ?? '?'}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
            <Button
              type="button"
              variant="primary"
              size="sm"
              disabled={joiningId === sprint.id || (sprint.helpers ?? []).length >= (sprint.max_helpers ?? 3)}
              onClick={() => handleJoin(sprint.id)}
              className="gap-2"
            >
              <Zap className="w-4 h-4" />
              {joiningId === sprint.id ? 'Joining…' : 'Join Sprint'}
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
