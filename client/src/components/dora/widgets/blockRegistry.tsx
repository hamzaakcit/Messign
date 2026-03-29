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
import {
  Activity,
  BookOpen,
  ClipboardCheck,
  ClipboardList,
  DollarSign,
  FileText,
  FolderKanban,
  Receipt,
  Target,
  Timer,
  Users,
  Zap,
} from 'lucide-react';
import ProjectStatusWidget, { type ProjectData } from './ProjectStatusWidget';
import { blockIdForWidget } from './blockIdForWidget';

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
const CommandCenterDoraWidget = lazy(() =>
  import('./CommandCenterDoraWidget').then((m) => ({ default: m.CommandCenterDoraWidget })),
);
const KnowledgeDocListWidget = lazy(() => import('./KnowledgeDocListWidget'));
const BountyBoardWidget = lazy(() => import('./BountyBoardWidget'));
const BadgesEarnedWidget = lazy(() => import('./BadgesEarnedWidget'));
const ReimbursementClaimsWidget = lazy(() => import('./ReimbursementClaimsWidget'));

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

function registerBlockType(type: AIWidgetType, def: BlockDef) {
  blockRegistry.set(type, def);
}

function BlockSkeleton() {
  return (
    <div
      className="dora-glass mt-3 h-28 animate-pulse rounded-2xl border border-app-border"
      style={{ borderRadius: 'var(--dora-r-widget, 16px)' }}
      aria-hidden
    />
  );
}

function SuspenseWrap({ children }: { children: ReactNode }) {
  return <Suspense fallback={<BlockSkeleton />}>{children}</Suspense>;
}

registerBlockType('command_center', {
  render: ({ widget }) => (
    <SuspenseWrap>
      <CommandCenterDoraWidget data={widget.data} />
    </SuspenseWrap>
  ),
});

registerBlockType('knowledge_doc_list', {
  render: ({ widget, staggerDelay }) => (
    <SuspenseWrap>
      <KnowledgeDocListWidget data={widget.data} title={widget.title} delay={staggerDelay} />
    </SuspenseWrap>
  ),
});

registerBlockType('system_overview', {
  render: ({ widget }) => (
    <SuspenseWrap>
      <SystemOverviewWidget data={widget.data as SystemOverviewData} />
    </SuspenseWrap>
  ),
});

registerBlockType('executive_report', {
  render: ({ widget }) => {
    const d = widget.data as Record<string, unknown>;
    const agg = d.aggregates as {
      activeEmployees: number;
      activeProjects: number;
      reimbursementTotal: number;
      pendingReimbursementCount: number;
      knowledgeDocs: number;
      periodActions: number;
    } | null;
    const period = String(d.timePeriod ?? '').replace(/_/g, ' ');
    return (
      <>
        {agg ? (
          <div className="dora-glass mt-3 mb-2 rounded-2xl border border-app-border/70 px-3 py-2 grid grid-cols-2 sm:grid-cols-3 gap-2">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-app-muted">Active people</div>
              <div className="text-sm font-bold text-app-text tabular-nums flex items-center gap-1">
                <Users className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                {agg.activeEmployees}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-app-muted">Active projects</div>
              <div className="text-sm font-bold text-app-text tabular-nums flex items-center gap-1">
                <FolderKanban className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                {agg.activeProjects}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-app-muted">Reimbursements</div>
              <div className="text-sm font-bold text-app-text tabular-nums flex items-center gap-1">
                <DollarSign className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                {agg.reimbursementTotal.toLocaleString('en-US', {
                  style: 'currency',
                  currency: 'USD',
                  maximumFractionDigits: 0,
                })}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-app-muted">Knowledge docs</div>
              <div className="text-sm font-bold text-app-text tabular-nums flex items-center gap-1">
                <BookOpen className="w-3.5 h-3.5 text-violet-400 shrink-0" />
                {agg.knowledgeDocs}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-app-muted">Activities</div>
              <div className="text-sm font-bold text-app-text tabular-nums flex items-center gap-1">
                <Activity className="w-3.5 h-3.5 text-pink-400 shrink-0" />
                {agg.periodActions}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-app-muted">Pending reimb.</div>
              <div className="text-sm font-bold text-app-text tabular-nums">{agg.pendingReimbursementCount}</div>
            </div>
          </div>
        ) : null}
        {period ? (
          <p className="text-[10px] text-app-muted/85 mb-2 px-0.5">Period: {period}</p>
        ) : null}
      </>
    );
  },
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

registerBlockType('bounty_board', {
  render: ({ widget }) => (
    <SuspenseWrap>
      <BountyBoardWidget data={widget.data} />
    </SuspenseWrap>
  ),
});

registerBlockType('badges_earned', {
  render: ({ widget }) => (
    <SuspenseWrap>
      <BadgesEarnedWidget data={widget.data} />
    </SuspenseWrap>
  ),
});

registerBlockType('reimbursement_claims', {
  render: ({ widget }) => (
    <SuspenseWrap>
      <ReimbursementClaimsWidget data={widget.data} />
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
    const projectsRaw = Array.isArray(rawData)
      ? rawData
      : Array.isArray((rawData as Record<string, unknown>).projects)
        ? ((rawData as Record<string, unknown>).projects as Record<string, unknown>[])
        : [];
    const aggregates = !Array.isArray(rawData) && rawData && typeof rawData === 'object'
      ? (rawData as { aggregates?: { projectCount: number; avgCompletion: number; totalTasks: number; completedTasks: number } })
          .aggregates
      : null;
    const projects = projectsRaw;
    return (
      <>
        {aggregates ? (
          <div className="dora-glass mt-3 mb-2 rounded-2xl border border-app-border/70 px-3 py-2 grid grid-cols-2 gap-2">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-app-muted">Projects</div>
              <div className="text-base font-bold text-app-text tabular-nums flex items-center gap-1">
                <FolderKanban className="w-4 h-4 text-sky-400" />
                {aggregates.projectCount}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-app-muted">Avg completion</div>
              <div className="text-base font-bold text-app-text tabular-nums flex items-center gap-1">
                <Target className="w-4 h-4 text-violet-400" />
                {aggregates.avgCompletion}%
              </div>
            </div>
          </div>
        ) : null}
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

registerBlockType('approval_queue', {
  render: ({ widget, staggerDelay }) => {
    const rawData = widget.data as Record<string, unknown> | Record<string, unknown>[];
    const itemsRaw = Array.isArray(rawData)
      ? rawData
      : Array.isArray((rawData as Record<string, unknown>).items)
        ? ((rawData as Record<string, unknown>).items as Record<string, unknown>[])
        : [];
    const aggregates =
      !Array.isArray(rawData) && rawData && typeof rawData === 'object'
        ? (
            rawData as {
              aggregates?: {
                total: number;
                byType: { reimbursement: number; document: number; invoice: number };
              };
            }
          ).aggregates
        : null;
    const typeIcon = (t: string) => {
      const lower = t.toLowerCase();
      if (lower === 'reimbursement') return <Receipt className="w-3.5 h-3.5 text-emerald-400 shrink-0" />;
      if (lower === 'document') return <FileText className="w-3.5 h-3.5 text-sky-400 shrink-0" />;
      if (lower === 'invoice') return <ClipboardList className="w-3.5 h-3.5 text-amber-400 shrink-0" />;
      return <ClipboardCheck className="w-3.5 h-3.5 text-app-muted shrink-0" />;
    };
    return (
      <>
        {aggregates ? (
          <div className="dora-glass mt-3 mb-2 rounded-2xl border border-app-border/70 px-3 py-2 grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-app-muted">Total</div>
              <div className="text-base font-bold text-app-text tabular-nums flex items-center gap-1">
                <ClipboardCheck className="w-4 h-4 text-violet-400" />
                {aggregates.total}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-app-muted">Reimb.</div>
              <div className="text-sm font-semibold text-app-text tabular-nums">{aggregates.byType.reimbursement}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-app-muted">Docs</div>
              <div className="text-sm font-semibold text-app-text tabular-nums">{aggregates.byType.document}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-app-muted">Invoices</div>
              <div className="text-sm font-semibold text-app-text tabular-nums">{aggregates.byType.invoice}</div>
            </div>
          </div>
        ) : null}
        <div className="space-y-2">
          {itemsRaw.length === 0 ? (
            <p className="text-sm text-app-text/55 px-1">No pending items in this queue.</p>
          ) : null}
          {itemsRaw.slice(0, 8).map((item, i) => {
            const type = String(item.type ?? 'item');
            const title = String(item.title ?? '');
            const detail = String(item.detail ?? '');
            const dateIso = String(item.date ?? '');
            const dateLabel = dateIso.length >= 10 ? dateIso.slice(0, 10) : dateIso;
            return (
              <div
                key={`${String(item.id ?? '')}-${i}`}
                className="rounded-xl border border-app-border/60 bg-app-surface-secondary/40 px-3 py-2 text-sm"
                style={{ animationDelay: `${(staggerDelay + i * 0.05) * 1000}ms` }}
              >
                <div className="flex items-start gap-2">
                  {typeIcon(type)}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[10px] uppercase tracking-wide text-app-muted">{type}</span>
                      {dateLabel ? <span className="text-[10px] text-app-muted">{dateLabel}</span> : null}
                    </div>
                    <div className="font-medium text-app-text truncate">{title}</div>
                    {detail ? <div className="text-xs text-app-muted line-clamp-2">{detail}</div> : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </>
    );
  },
});

registerBlockType('sprint_status', {
  render: ({ widget, staggerDelay }) => {
    const rawData = widget.data as Record<string, unknown> | Record<string, unknown>[];
    const sprintsRaw = Array.isArray(rawData)
      ? rawData
      : Array.isArray((rawData as Record<string, unknown>).sprints)
        ? ((rawData as Record<string, unknown>).sprints as Record<string, unknown>[])
        : [];
    const aggregates =
      !Array.isArray(rawData) && rawData && typeof rawData === 'object'
        ? (
            rawData as {
              aggregates?: {
                sprintCount: number;
                avgProgress: number;
                activeCount: number;
                minDaysLeft: number | null;
              };
            }
          ).aggregates
        : null;
    return (
      <>
        {aggregates ? (
          <div className="dora-glass mt-3 mb-2 rounded-2xl border border-app-border/70 px-3 py-2 grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-app-muted">Sprints</div>
              <div className="text-base font-bold text-app-text tabular-nums flex items-center gap-1">
                <Zap className="w-4 h-4 text-amber-400" />
                {aggregates.sprintCount}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-app-muted">Avg staffed</div>
              <div className="text-sm font-semibold text-app-text tabular-nums">{aggregates.avgProgress}%</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-app-muted">Active</div>
              <div className="text-sm font-semibold text-app-text tabular-nums">{aggregates.activeCount}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-app-muted">Soonest end</div>
              <div className="text-sm font-semibold text-app-text tabular-nums flex items-center gap-1">
                <Timer className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                {aggregates.minDaysLeft == null ? '—' : `${aggregates.minDaysLeft}d`}
              </div>
            </div>
          </div>
        ) : null}
        {sprintsRaw.length > 0 ? (
          <p className="text-[10px] text-app-muted/85 mb-2 px-0.5">
            Sprints are help-request windows tied to projects (not Scrum story points).
          </p>
        ) : null}
        <div className="space-y-2">
          {sprintsRaw.length === 0 ? (
            <p className="text-sm text-app-text/55 px-1">No sprint rows for this query.</p>
          ) : null}
          {sprintsRaw.slice(0, 6).map((s, i) => {
            const project = String(s.project_name ?? '');
            const title = String(s.title ?? 'Sprint');
            const status = String(s.status ?? '');
            const progress = Number(s.progress ?? 0);
            const hc = Number(s.helperCount ?? 0);
            const maxH = Number(s.max_helpers ?? 0);
            const daysLeft = s.daysLeft;
            const dlLabel =
              typeof daysLeft === 'number' ? `${daysLeft}d left` : 'No end date';
            return (
              <div
                key={`${String(s.id ?? '')}-${i}`}
                className="rounded-xl border border-app-border/60 bg-app-surface-secondary/40 px-3 py-2 text-sm"
                style={{ animationDelay: `${(staggerDelay + i * 0.05) * 1000}ms` }}
              >
                <div className="flex items-start gap-2">
                  <Zap className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[10px] uppercase tracking-wide text-app-muted truncate">{project}</div>
                    <div className="font-medium text-app-text truncate">{title}</div>
                    <div className="text-xs text-app-muted">
                      {status} · {progress}% ({hc}/{maxH || 3} helpers) · {dlLabel}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
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
