import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';
import { useCommandCenterData } from '@/hooks/useCommandCenterData';
import { buildColumnInsights, buildWorkspaceInsights } from './lib/commandCenterInsights';
import type { CommandCenterDeepDiveKind, WorkspaceModuleKey } from '@/types/command-center';
import { ROUTES } from '@/lib/routes';
import { formatDashboardDataAge } from '@/lib/dashboardFreshness';
import { PulseColumn } from './columns/PulseColumn';
import { BrainColumn } from './columns/BrainColumn';
import { GrowthColumn } from './columns/GrowthColumn';
import { FutureColumn } from './columns/FutureColumn';
import { CommandCenterDeepDive } from './CommandCenterDeepDive';
import { WorkspaceOverviewGrid } from './WorkspaceOverviewGrid';
import { WorkspaceModuleSlideOver } from './WorkspaceModuleSlideOver';
import { CommandCenterChrome } from './CommandCenterChrome';

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
  const [workspaceModuleDetail, setWorkspaceModuleDetail] = useState<WorkspaceModuleKey | null>(null);

  const insights = useMemo(() => buildColumnInsights(data), [data]);
  const workspaceInsight = useMemo(() => buildWorkspaceInsights(data), [data]);

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

  const onWorkspaceNavigate = useCallback(
    (path: string) => {
      navigate(path);
      setWorkspaceModuleDetail(null);
    },
    [navigate],
  );

  if (!user) {
    return <div className="p-6 text-app-muted text-sm">Sign in to view your command center.</div>;
  }

  return (
    <div
      className="h-[calc(100vh-48px)] flex flex-col w-full bg-app transition-colors duration-200 min-h-0 overflow-hidden"
      role="main"
      aria-label="Command Center"
    >
      <CommandCenterChrome
        title="Mission Control"
        subtitle="Intelligence Kanban · live"
        meta={data ? workspaceInsight : undefined}
        trailing={
          data ? (
            <span className="text-[10px] text-app-muted tabular-nums" title={data.generatedAt}>
              Snapshot · {formatDashboardDataAge(data.generatedAt)}
            </span>
          ) : null
        }
        onRefresh={() => void refetch()}
        refreshing={refreshing}
      />

      {loading && !data && (
        <div className="flex-1 flex items-center justify-center gap-2 text-app-muted text-sm">
          <Loader2 className="w-5 h-5 animate-spin" />
          Loading command center…
        </div>
      )}

      {error && (
        <div
          className="shrink-0 mx-4 my-2 rounded-lg border border-rose-500/35 bg-rose-950/40 px-3 py-2 text-sm text-rose-100/95 flex flex-wrap items-center justify-between gap-2"
          role="alert"
          aria-live="polite"
        >
          <span className="min-w-0">{error}</span>
          <button
            type="button"
            className="shrink-0 text-xs font-medium underline underline-offset-2 text-rose-200 hover:text-white"
            onClick={() => void refetch()}
          >
            Retry
          </button>
        </div>
      )}

      {data && (
        <div className="flex-1 min-h-0 flex flex-col">
          <div className="shrink-0 max-h-[min(42vh,340px)] min-h-[220px] overflow-x-auto overflow-y-hidden border-b border-white/[0.06]">
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
          <div className="flex-1 min-h-0 overflow-y-auto p-3 pb-4">
            <WorkspaceOverviewGrid
              workspace={data.workspace}
              onRetryModule={() => void refetch()}
              onOpenDetail={(key) => setWorkspaceModuleDetail(key)}
            />
          </div>
        </div>
      )}

      <CommandCenterDeepDive data={data} active={deepDive} onClose={() => setDeepDive(null)} />
      {data ? (
        <WorkspaceModuleSlideOver
          workspace={data.workspace}
          active={workspaceModuleDetail}
          onClose={() => setWorkspaceModuleDetail(null)}
          onNavigate={onWorkspaceNavigate}
          onRetry={() => void refetch()}
        />
      ) : null}
    </div>
  );
}
