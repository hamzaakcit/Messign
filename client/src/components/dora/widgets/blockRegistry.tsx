import { lazy, Suspense, type ReactNode } from 'react';
import type {
  AIWidgetPayload,
  AIWidgetType,
  SystemOverviewData,
  TaskRow,
} from '@/types/knowledge-hub/ai';
import type { DoraBlockHost } from '@/types/dora/dynamic-blocks';
import { UnknownWidgetFallback } from './WidgetUnknownFallback';
import { coerceInvoicePreviewData, coerceLeaderboardData } from './widgetCoercers';
import { DoraDashWidget } from './DoraDashWidget';
import { InvoicePreviewCard } from './InvoicePreviewCard';
import { LeaderboardList } from './LeaderboardList';
import ProjectStatusWidget, { type ProjectData } from './ProjectStatusWidget';

const SystemOverviewWidget = lazy(() =>
  import('./SystemOverviewWidget').then((m) => ({ default: m.SystemOverviewWidget })),
);
const TaskTableWidget = lazy(() =>
  import('./TaskTableWidget').then((m) => ({ default: m.TaskTableWidget })),
);
const RevenueChartWidget = lazy(() => import('./RevenueChartWidget'));
const FinancialSummaryWidget = lazy(() =>
  import('./FinancialSummaryWidget').then((m) => ({ default: m.FinancialSummaryWidget })),
);
const PerformanceOverviewWidget = lazy(() => import('./PerformanceOverviewWidget'));
const TeamComparisonWidget = lazy(() => import('./TeamComparisonWidget'));
const DataTableWidget = lazy(() => import('./DataTableWidget'));

export interface WidgetRenderContext {
  widget: AIWidgetPayload;
  staggerDelay: number;
  host: DoraBlockHost;
  onSendMessage?: (msg: string, intentId?: string) => void;
}

type BlockDef = {
  render: (ctx: WidgetRenderContext) => ReactNode;
};

const blockRegistry = new Map<AIWidgetType, BlockDef>();

export function registerBlockType(type: AIWidgetType, def: BlockDef) {
  blockRegistry.set(type, def);
}

function BlockSkeleton() {
  return (
    <div
      className="dora-glass mt-3 h-28 animate-pulse rounded-2xl border border-white/5"
      style={{ borderRadius: 'var(--dora-r-widget, 16px)' }}
      aria-hidden
    />
  );
}

function SuspenseWrap({ children }: { children: ReactNode }) {
  return <Suspense fallback={<BlockSkeleton />}>{children}</Suspense>;
}

export function blockIdForWidget(widget: AIWidgetPayload): string {
  if (widget.id) return widget.id;
  const slug = `${widget.widgetType}-${widget.title}`.replace(/\s+/g, '-').slice(0, 80);
  return slug || widget.widgetType;
}

registerBlockType('system_overview', {
  render: ({ widget }) => (
    <SuspenseWrap>
      <SystemOverviewWidget data={widget.data as SystemOverviewData} />
    </SuspenseWrap>
  ),
});

registerBlockType('task_table', {
  render: ({ widget, onSendMessage }) => (
    <SuspenseWrap>
      <TaskTableWidget data={widget.data as TaskRow[] | Record<string, unknown>} onSendMessage={onSendMessage} />
    </SuspenseWrap>
  ),
});

registerBlockType('performance_overview', {
  render: ({ widget }) => (
    <SuspenseWrap>
      <PerformanceOverviewWidget data={widget.data as Record<string, unknown>} />
    </SuspenseWrap>
  ),
});

registerBlockType('financial_summary', {
  render: ({ widget, staggerDelay }) => (
    <SuspenseWrap>
      <FinancialSummaryWidget data={widget.data as Record<string, unknown>} title={widget.title} delay={staggerDelay} />
    </SuspenseWrap>
  ),
});

registerBlockType('team_overview', {
  render: ({ widget, staggerDelay }) => {
    const teamTitle = widget.title && widget.title.length < 100 ? widget.title : 'Team comparison';
    return (
      <SuspenseWrap>
        <TeamComparisonWidget data={widget.data} title={teamTitle} delay={staggerDelay} />
      </SuspenseWrap>
    );
  },
});

registerBlockType('project_status', {
  render: ({ widget, staggerDelay }) => {
    const rawData = widget.data as Record<string, unknown> | Record<string, unknown>[];
    const projects = Array.isArray(rawData) ? rawData : [rawData];
    return (
      <>
        {projects.slice(0, 3).map((projectData, pi) => {
          const taskStats = (projectData.taskStats as Record<string, number>) || {};
          const members = projectData.members as Array<{ full_name?: string }> | null;
          const shaped: ProjectData = {
            name: (projectData.name as string) || 'Unknown Project',
            lead: (projectData.lead as string) || (projectData.projectManager as string) || 'Unassigned',
            dueDate: (projectData.dueDate as string) || (projectData.deadline as string) || 'TBD',
            status: (projectData.status as ProjectData['status']) || 'active',
            completion:
              (projectData.completionPercentage as number) ||
              (projectData.completion as number) ||
              (projectData.progress as number) ||
              0,
            tasks: {
              total: taskStats.total || (projectData.totalTasks as number) || 0,
              done: taskStats.completed || (projectData.completedTasks as number) || 0,
              inProgress: taskStats.in_progress || (projectData.inProgressTasks as number) || 0,
              blocked: taskStats.blocked || (projectData.blockedTasks as number) || 0,
            },
            team:
              (members?.map((m) => m.full_name || 'Unknown').filter(Boolean) as string[]) ||
              (projectData.team as string[]) ||
              [],
          };
          return <ProjectStatusWidget key={pi} project={shaped} delay={staggerDelay + pi * 0.1} />;
        })}
      </>
    );
  },
});

registerBlockType('revenue_chart', {
  render: ({ widget, staggerDelay }) => {
    const chartData = widget.data as Record<string, unknown>;
    const timeSeriesData = chartData.data as Array<{ month: string; revenue: number }> | undefined;
    if (Array.isArray(timeSeriesData) && timeSeriesData.length > 0) {
      return (
        <SuspenseWrap>
          <RevenueChartWidget
            data={timeSeriesData}
            title={(chartData.title as string) || widget.title}
            subtitle={(chartData.subtitle as string) || undefined}
            accent={(chartData.accent as string) || 'green-cyan'}
            delay={staggerDelay}
          />
        </SuspenseWrap>
      );
    }
    return (
      <SuspenseWrap>
        <FinancialSummaryWidget data={chartData} title={widget.title} delay={staggerDelay} />
      </SuspenseWrap>
    );
  },
});

registerBlockType('data_table', {
  render: ({ widget, staggerDelay }) => {
    const tableTitle = widget.title && widget.title.length < 80 ? widget.title : 'Results';
    return (
      <SuspenseWrap>
        <DataTableWidget data={widget.data} title={tableTitle} delay={staggerDelay} />
      </SuspenseWrap>
    );
  },
});

registerBlockType('dora_dash', {
  render: () => <DoraDashWidget />,
});

registerBlockType('invoice_preview', {
  render: (ctx) => {
    const { widget, staggerDelay, host } = ctx;
    const inv = coerceInvoicePreviewData(widget.data);
    if (!inv) {
      return <UnknownWidgetFallback title={widget.title} widgetType={widget.widgetType} raw={widget.data} />;
    }
    return (
      <InvoicePreviewCard
        block={{
          blockId: blockIdForWidget(widget),
          title: widget.title,
          data: inv,
          host,
        }}
        delay={staggerDelay}
      />
    );
  },
});

registerBlockType('leaderboard_list', {
  render: (ctx) => {
    const { widget, staggerDelay, host } = ctx;
    const lb = coerceLeaderboardData(widget.data, widget.title || 'Leaderboard');
    if (!lb) {
      return <UnknownWidgetFallback title={widget.title} widgetType={widget.widgetType} raw={widget.data} />;
    }
    return (
      <LeaderboardList
        block={{
          blockId: blockIdForWidget(widget),
          title: widget.title,
          data: lb,
          host,
        }}
        delay={staggerDelay}
      />
    );
  },
});

export function renderRegisteredBlock(ctx: WidgetRenderContext): ReactNode {
  const { widget } = ctx;
  const def = blockRegistry.get(widget.widgetType);
  if (!def) {
    return <UnknownWidgetFallback title={widget.title} widgetType={String(widget.widgetType)} raw={widget.data} />;
  }
  return def.render(ctx);
}
