import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';
import { useCommandCenterData } from '@/hooks/useCommandCenterData';
import { buildWorkspaceInsights } from '@/components/command-center/lib/commandCenterInsights';
import type { CommandCenterDeepDiveKind, WorkspaceModuleKey } from '@/types/command-center';
import { ROUTES } from '@/lib/routes';
import { formatDashboardDataAge } from '@/lib/dashboardFreshness';
import { CommandCenterDeepDive } from '@/components/command-center/CommandCenterDeepDive';
import { WorkspaceModuleSlideOver } from '@/components/command-center/WorkspaceModuleSlideOver';
import { CommandCenterChrome } from '@/components/command-center/CommandCenterChrome';
import { DoraCommandModule } from './bento/DoraCommandModule';
import { GrowthModule } from './bento/GrowthModule';
import { TasksModule } from './bento/TasksModule';
import { KnowledgeModule } from './bento/KnowledgeModule';
import { GlobalPulseModule } from './bento/GlobalPulseModule';
import { WorkspaceMicroStrip } from './bento/WorkspaceMicroStrip';
import { BentoGrid } from '@/components/layout/bento/BentoGrid';
import { ViewportContainer } from '@/components/layout/ViewportContainer';
import { DashboardAnalyticsRow } from './analytics/DashboardAnalyticsRow';
import { DashboardTodoPanel } from './analytics/DashboardTodoPanel';
import { useMissionControlFocusStore } from '@/stores/missionControlFocusStore';
import type { MissionControlBentoKey } from '@/stores/missionControlFocusStore';

/**
 * Primary home Dashboard surface: single-fold Company OS bento (12-column grid + workspace strip),
 * drill-downs via glass slide-overs. Uses the same `useCommandCenterData` payload as the legacy Command Center name.
 *
 * `CommandCenter` in `@/components/command-center` is a thin alias of this component for backward compatibility.
 */
export function MainDashboard(): JSX.Element {
  const user = useAuthStore((s) => s.user);
  const userId = user?.authUserId ?? user?.id ?? '';
  const navigate = useNavigate();
  const setView = useUIStore((s) => s.setView);

  const { data, loading, error, refreshing, refetch } = useCommandCenterData(userId || undefined);
  const [deepDive, setDeepDive] = useState<CommandCenterDeepDiveKind | null>(null);
  const [workspaceModuleDetail, setWorkspaceModuleDetail] = useState<WorkspaceModuleKey | null>(null);

  const workspaceInsight = useMemo(() => buildWorkspaceInsights(data), [data]);

  const setFocusedBentoKey = useMissionControlFocusStore((s) => s.setFocusedBentoKey);
  useEffect(() => () => setFocusedBentoKey(null), [setFocusedBentoKey]);

  const bentoHoverProps = useCallback(
    (key: MissionControlBentoKey) => ({
      onMouseEnter: () => setFocusedBentoKey(key),
      onFocusCapture: () => setFocusedBentoKey(key),
    }),
    [setFocusedBentoKey],
  );

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
    return <div className="p-6 text-app-muted text-sm">Sign in to view your dashboard.</div>;
  }

  return (
    <ViewportContainer
      density="compact"
      className="min-h-0 flex-1 bg-app transition-colors duration-200"
      aria-label="Dashboard"
    >
      <CommandCenterChrome
        title="Dashboard"
        subtitle="Company OS · single-fold"
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
        <div className="flex-1 flex items-center justify-center gap-2 text-app-muted text-sm min-h-0">
          <Loader2 className="w-5 h-5 animate-spin" />
          Loading dashboard…
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
        <div className="flex flex-col flex-1 min-h-0 gap-2 p-2 overflow-hidden">
          <BentoGrid className="shrink-0">
            <div
              className="col-span-12 sm:col-span-6 lg:col-span-3 min-h-0 flex flex-col overflow-hidden outline-none"
              {...bentoHoverProps('dora')}
            >
              <DoraCommandModule brain={data.brain} onOpenDora={goDora} onOpenDeepDive={onOpenDeepDive} />
            </div>
            <div
              className="col-span-12 sm:col-span-6 lg:col-span-3 min-h-0 flex flex-col overflow-hidden outline-none"
              {...bentoHoverProps('growth')}
            >
              <GrowthModule growth={data.growth} onOpenDeepDive={onOpenDeepDive} onOpenChat={goChat} />
            </div>
            <div
              className="col-span-12 sm:col-span-6 lg:col-span-2 min-h-0 flex flex-col overflow-hidden outline-none"
              {...bentoHoverProps('tasks')}
            >
              <TasksModule
                pulse={data.pulse}
                future={data.future}
                onOpenDeepDive={onOpenDeepDive}
                onQuickAddTask={goProjects}
              />
            </div>
            <div
              className="col-span-12 sm:col-span-6 lg:col-span-2 min-h-0 flex flex-col overflow-hidden outline-none"
              {...bentoHoverProps('knowledge')}
            >
              <KnowledgeModule brain={data.brain} onOpenDeepDive={onOpenDeepDive} />
            </div>
            <div
              className="col-span-12 sm:col-span-12 lg:col-span-2 min-h-0 flex flex-col overflow-hidden outline-none"
              {...bentoHoverProps('pulse')}
            >
              <GlobalPulseModule pulse={data.pulse} future={data.future} chat={data.workspace.chat} />
            </div>
          </BentoGrid>

          <div className="flex flex-1 min-h-0 flex-col lg:flex-row gap-2 overflow-hidden">
            <div className="flex-1 min-h-0 min-w-0 overflow-y-auto pr-0.5">
              <DashboardAnalyticsRow data={data} />
            </div>
            <div className="shrink-0 w-full lg:w-[min(100%,380px)] lg:max-w-[40vw] min-h-0 flex flex-col">
              <DashboardTodoPanel dto={data} />
            </div>
          </div>

          <WorkspaceMicroStrip
            workspace={data.workspace}
            onOpenDetail={(key) => setWorkspaceModuleDetail(key)}
            onRetryModule={() => void refetch()}
          />
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
    </ViewportContainer>
  );
}
