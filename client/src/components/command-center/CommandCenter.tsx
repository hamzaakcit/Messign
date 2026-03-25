import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, RefreshCw } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';
import { useCommandCenterData } from '@/hooks/useCommandCenterData';
import { buildColumnInsights } from './lib/commandCenterInsights';
import type { CommandCenterDeepDiveKind } from '@/types/command-center';
import { ROUTES } from '@/lib/routes';
import { PulseColumn } from './columns/PulseColumn';
import { BrainColumn } from './columns/BrainColumn';
import { GrowthColumn } from './columns/GrowthColumn';
import { FutureColumn } from './columns/FutureColumn';
import { CommandCenterDeepDive } from './CommandCenterDeepDive';

/**
 * Intelligence Kanban: four fixed data-stream columns with glass deep-dives.
 */
export function CommandCenter(): JSX.Element {
  const user = useAuthStore((s) => s.user);
  const userId = user?.authUserId ?? user?.id ?? '';
  const navigate = useNavigate();
  const setView = useUIStore((s) => s.setView);

  const { data, loading, error, refreshing, refetch } = useCommandCenterData(userId || undefined);
  const [deepDive, setDeepDive] = useState<CommandCenterDeepDiveKind | null>(null);

  const insights = useMemo(() => buildColumnInsights(data), [data]);

  const goProjects = useCallback(() => {
    setView('projects');
    navigate(ROUTES.PROJECTS);
  }, [navigate, setView]);

  const goDora = useCallback(() => {
    setView('dora');
    navigate(ROUTES.DORA_BRIEFING);
  }, [navigate, setView]);

  const goChat = useCallback(() => {
    setView('chat');
    navigate(ROUTES.CHAT);
  }, [navigate, setView]);

  const goOkr = useCallback(() => {
    setView('okr');
    navigate(ROUTES.OKR);
  }, [navigate, setView]);

  const onOpenDeepDive = useCallback((kind: CommandCenterDeepDiveKind) => {
    setDeepDive(kind);
  }, []);

  if (!user) {
    return <div className="p-6 text-app-muted text-sm">Sign in to view your command center.</div>;
  }

  return (
    <div
      className="h-[calc(100vh-48px)] flex flex-col w-full bg-app transition-colors duration-200 min-h-0"
      role="main"
      aria-label="Command Center"
    >
      <div className="shrink-0 flex items-center justify-between gap-2 px-4 py-2 border-b border-white/[0.06]">
        <div>
          <h1 className="text-sm font-semibold text-app-text">Mission Control</h1>
          <p className="text-[10px] text-app-muted">Intelligence Kanban · live</p>
        </div>
        <div className="flex items-center gap-2">
          {refreshing && <Loader2 className="w-3.5 h-3.5 animate-spin text-app-muted" aria-hidden />}
          <button
            type="button"
            onClick={() => void refetch()}
            className="inline-flex items-center gap-1 rounded-md border border-white/10 px-2 py-1 text-[11px] text-app-text hover:bg-white/5"
            title="Refresh"
          >
            <RefreshCw className="w-3 h-3" />
            Refresh
          </button>
        </div>
      </div>

      {loading && !data && (
        <div className="flex-1 flex items-center justify-center gap-2 text-app-muted text-sm">
          <Loader2 className="w-5 h-5 animate-spin" />
          Loading command center…
        </div>
      )}

      {error && (
        <div className="px-4 py-3 text-sm text-rose-400" role="alert">
          {error}
        </div>
      )}

      {data && (
        <div className="flex-1 min-h-0 overflow-x-auto overflow-y-hidden">
          <div className="flex gap-3 p-3 h-full min-w-min">
            <PulseColumn
              pulse={data.pulse}
              insight={insights.pulse}
              onOpenDeepDive={onOpenDeepDive}
              onQuickAddTask={goProjects}
            />
            <BrainColumn
              brain={data.brain}
              insight={insights.brain}
              onOpenDeepDive={onOpenDeepDive}
              onOpenDora={goDora}
            />
            <GrowthColumn
              growth={data.growth}
              insight={insights.growth}
              onOpenDeepDive={onOpenDeepDive}
              onOpenChat={goChat}
            />
            <FutureColumn
              future={data.future}
              insight={insights.future}
              onOpenDeepDive={onOpenDeepDive}
              onOpenOkr={goOkr}
            />
          </div>
        </div>
      )}

      <CommandCenterDeepDive data={data} active={deepDive} onClose={() => setDeepDive(null)} />
    </div>
  );
}
