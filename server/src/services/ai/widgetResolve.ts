/**
 * Maps tool observations to one or more generative UI widget payloads.
 * Handles dynamic types (e.g. single invoice → card, many → table).
 */

import { randomUUID } from 'node:crypto';
import { getDefaultNavigateActionsForTool } from './widgetContracts.js';
import { sanitizeData } from './dataSanitizer.js';
import { AI_WIDGET_TOOL_MAP } from './widgetToolMap.js';
import { computeTeamOverviewAggregates } from './tools/teamOverviewAggregates.js';
import { computeProjectStatusAggregates } from './tools/projectStatusAggregates.js';
import { itemsFromApprovalQueueData } from './tools/approvalQueueAggregates.js';
import {
  leaderboardAggregatesFromToolData,
  leaderboardRowsFromToolData,
} from './tools/leaderboardAggregates.js';
import { sprintsFromSprintStatusData } from './tools/sprintStatusAggregates.js';

export type WidgetBlockAction =
  | { id: string; label: string; kind: 'navigate'; to: string; state?: unknown }
  | { id: string; label: string; kind: 'send_message'; text: string; intentId?: string };

export type WidgetPayload = {
  schemaVersion: number;
  id: string;
  widgetType: string;
  data: unknown;
  title: string;
  actions?: WidgetBlockAction[];
};

function widgetPayload(
  widgetType: string,
  data: unknown,
  title: string,
  actions?: WidgetBlockAction[],
): WidgetPayload {
  const p: WidgetPayload = {
    schemaVersion: 1,
    id: randomUUID(),
    widgetType,
    data,
    title,
  };
  if (actions?.length) p.actions = actions;
  return p;
}

function extractShortTitle(fallback: string, summary?: string): string {
  if (!summary) return fallback;
  const line = summary.split('\n')[0]?.replace(/\*\*/g, '').trim() || '';
  if (!line) return fallback;
  return line.length > 120 ? `${line.slice(0, 117)}…` : line;
}

function isoDatePart(value: unknown): string {
  if (value == null) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const s = String(value);
  return s.length >= 10 ? s.slice(0, 10) : s;
}

function normalizeInvoiceRow(row: Record<string, unknown>): Record<string, unknown> {
  const amount = parseFloat(String(row.grand_total ?? row.total_expenses ?? row.amount ?? 0));
  const issueRaw = row.created_at ?? row.issue_date ?? row.issueDate;
  const dueRaw = row.due_date ?? row.dueDate;
  return {
    invoiceId: String(row.id ?? row.invoice_number ?? ''),
    invoiceNumber: String(row.invoice_number ?? row.id ?? ''),
    clientName: String(row.employee_name ?? row.to_name ?? row.client_name ?? 'Unknown'),
    status: String(row.status ?? 'draft'),
    currency: String(row.currency ?? 'USD'),
    amount: Number.isFinite(amount) ? amount : 0,
    issueDate: isoDatePart(issueRaw),
    dueDate: dueRaw == null || dueRaw === '' ? null : isoDatePart(dueRaw),
    lineItems: Array.isArray(row.line_items)
      ? row.line_items
      : Array.isArray(row.lineItems)
        ? row.lineItems
        : undefined,
  };
}

function looksLikeKnowledgeDocRow(row: unknown): boolean {
  if (!row || typeof row !== 'object') return false;
  const r = row as Record<string, unknown>;
  return typeof r.title === 'string' && (r.id != null || r.slug != null);
}

/** Merge default namespace navigation without duplicating the same `to` path. */
function mergeNavIntoPayloads(toolName: string, payloads: WidgetPayload[]): WidgetPayload[] {
  const extra = getDefaultNavigateActionsForTool(toolName) as WidgetBlockAction[];
  if (extra.length === 0 || payloads.length === 0) return payloads;
  return payloads.map((p) => {
    const existing = p.actions ?? [];
    const seen = new Set(
      existing.filter((a): a is Extract<WidgetBlockAction, { kind: 'navigate' }> => a.kind === 'navigate').map((a) => a.to),
    );
    const merged: WidgetBlockAction[] = [...existing];
    for (const e of extra) {
      if (e.kind === 'navigate' && seen.has(e.to)) continue;
      merged.push(e);
      if (e.kind === 'navigate') seen.add(e.to);
    }
    return { ...p, actions: merged };
  });
}

/**
 * Build widget payload(s) for a single tool result. Returns empty array when no widget should render.
 */
export function resolveWidgetPayloadsForTool(
  toolName: string,
  obs: { success: boolean; data: unknown; summary?: string },
  userRole: string,
): WidgetPayload[] {
  if (!obs.success || obs.data == null) return [];

  const isAdmin = userRole === 'admin';
  const sanitized = sanitizeData(obs.data, isAdmin);

  if (toolName === 'knowledge:search_knowledge_base') {
    let payload: Record<string, unknown> | null = null;
    if (
      sanitized &&
      typeof sanitized === 'object' &&
      !Array.isArray(sanitized) &&
      Array.isArray((sanitized as Record<string, unknown>).documents)
    ) {
      payload = sanitized as Record<string, unknown>;
    } else if (Array.isArray(sanitized) && sanitized.length > 0 && looksLikeKnowledgeDocRow(sanitized[0])) {
      payload = { documents: sanitized, aggregates: null, query: '', confidence: null };
    }
    if (payload && Array.isArray(payload.documents)) {
      const title = extractShortTitle('Knowledge search', obs.summary);
      const kbActions: WidgetBlockAction[] = [
        {
          id: 'kb-open-tasks',
          label: 'My tasks',
          kind: 'send_message',
          text: 'What are my open tasks?',
          intentId: 'quick.open_tasks',
        },
        {
          id: 'kb-dashboard',
          label: 'Dashboard metrics',
          kind: 'send_message',
          text: 'Show me dashboard metrics',
          intentId: 'dashboard.metrics',
        },
      ];
      return mergeNavIntoPayloads(toolName, [
        widgetPayload('knowledge_doc_list', payload, title, kbActions),
      ]);
    }
    return mergeNavIntoPayloads(toolName, [
      widgetPayload('data_table', sanitized, extractShortTitle('Search results', obs.summary)),
    ]);
  }

  if (toolName === 'dashboard:get_command_center') {
    return mergeNavIntoPayloads(toolName, [
      widgetPayload(
        'command_center',
        sanitized,
        'Command Center',
        [
          {
            id: 'open-dashboard',
            label: 'Open full dashboard',
            kind: 'navigate',
            to: '/dashboard',
          },
        ],
      ),
    ]);
  }

  if (toolName === 'finance:get_invoice_details') {
    if (!Array.isArray(sanitized)) return [];
    if (sanitized.length === 0) return [];
    if (sanitized.length === 1) {
      const row = sanitized[0] as Record<string, unknown>;
      return mergeNavIntoPayloads(toolName, [
        widgetPayload('invoice_preview', normalizeInvoiceRow(row), extractShortTitle('Invoice', obs.summary)),
      ]);
    }
    return mergeNavIntoPayloads(toolName, [
      widgetPayload('data_table', sanitized, extractShortTitle('Invoices', obs.summary)),
    ]);
  }

  if (toolName === 'achievements:get_achievements_leaderboard') {
    if (
      sanitized &&
      typeof sanitized === 'object' &&
      Array.isArray((sanitized as Record<string, unknown>).badges)
    ) {
      const payload = sanitized as Record<string, unknown>;
      const title = extractShortTitle('Your badges', obs.summary);
      const badgeActions: WidgetBlockAction[] = [
        {
          id: 'bdg-leader',
          label: 'Leaderboard',
          kind: 'send_message',
          text: 'What are the top leaderboard rankings?',
          intentId: 'achievements.leaderboard',
        },
        {
          id: 'bdg-bounties',
          label: 'Bounties',
          kind: 'send_message',
          text: 'What bounties are available?',
          intentId: 'quick.bounties',
        },
        {
          id: 'bdg-tasks',
          label: 'My tasks',
          kind: 'send_message',
          text: 'What are my open tasks?',
          intentId: 'quick.open_tasks',
        },
      ];
      return mergeNavIntoPayloads(toolName, [
        widgetPayload('badges_earned', payload, title, badgeActions),
      ]);
    }

    const lbRows = leaderboardRowsFromToolData(sanitized);
    if (lbRows !== null) {
      const rows = lbRows as Record<string, unknown>[];
      const entries = rows.map((r, i) => ({
        rank: typeof r.rank === 'number' ? r.rank : Number(r.rank ?? i + 1),
        userId:
          r.user_id != null
            ? String(r.user_id)
            : r.userId != null
              ? String(r.userId)
              : undefined,
        name: String(r.full_name ?? r.name ?? 'Unknown'),
        subtitle: r.email != null ? String(r.email) : undefined,
        value: Number(r.points ?? r.xp ?? 0),
      }));
      const agg = leaderboardAggregatesFromToolData(sanitized);
      const lbActions: WidgetBlockAction[] = [
        {
          id: 'lb-open-tasks',
          label: 'My tasks',
          kind: 'send_message',
          text: 'What are my open tasks?',
          intentId: 'quick.open_tasks',
        },
        {
          id: 'lb-team-compare',
          label: 'Compare teams',
          kind: 'send_message',
          text: 'How do all teams compare this month?',
          intentId: 'performance.team_compare',
        },
        {
          id: 'lb-my-badges',
          label: 'My badges',
          kind: 'send_message',
          text: 'What badges have I earned?',
          intentId: 'quick.badges',
        },
      ];
      return mergeNavIntoPayloads(toolName, [
        widgetPayload(
          'leaderboard_list',
          {
            title: 'Leaderboard',
            metricLabel: 'XP',
            entries,
            maxRows: 25,
            ...(agg ? { aggregates: agg } : {}),
          },
          extractShortTitle('Leaderboard', obs.summary),
          lbActions,
        ),
      ]);
    }
    const fallback = AI_WIDGET_TOOL_MAP[toolName];
    if (!fallback) return [];
    return mergeNavIntoPayloads(toolName, [widgetPayload(fallback, sanitized, obs.summary ?? '')]);
  }

  if (toolName === 'people:get_employee_performance') {
    const payload =
      sanitized && typeof sanitized === 'object'
        ? (sanitized as Record<string, unknown>)
        : { employees: [], teamAverage: null, period: 'this_month', comparisonSeries: null };
    const title = extractShortTitle('Your performance', obs.summary);
    const perfActions: WidgetBlockAction[] = [
      {
        id: 'perf-open-tasks',
        label: 'My open tasks',
        kind: 'send_message',
        text: 'What are my open tasks?',
        intentId: 'quick.open_tasks',
      },
      {
        id: 'perf-team',
        label: 'Team overview',
        kind: 'send_message',
        text: "Show me my team's performance this month",
        intentId: 'performance.team',
      },
      {
        id: 'perf-quarter',
        label: 'This quarter',
        kind: 'send_message',
        text: 'Show me my performance this quarter',
        intentId: 'performance.this_quarter',
      },
    ];
    return mergeNavIntoPayloads(toolName, [
      widgetPayload('performance_overview', payload, title, perfActions),
    ]);
  }

  if (toolName === 'achievements:get_bounty_board') {
    let payload: Record<string, unknown>;
    if (Array.isArray(sanitized)) {
      payload = { bounties: sanitized, filter: 'open', stats: {}, aggregates: null };
    } else if (sanitized && typeof sanitized === 'object' && 'bounties' in (sanitized as object)) {
      payload = sanitized as Record<string, unknown>;
    } else {
      payload = { bounties: [], filter: 'open', stats: {}, aggregates: null };
    }
    const title = extractShortTitle('Bounty board', obs.summary);
    const bountyActions: WidgetBlockAction[] = [
      {
        id: 'bounty-my',
        label: 'My bounties',
        kind: 'send_message',
        text: 'Show bounties I claimed or created',
        intentId: 'achievements.my_bounties',
      },
      {
        id: 'bounty-leaderboard',
        label: 'Leaderboard',
        kind: 'send_message',
        text: 'Who are the top performers this month?',
        intentId: 'dashboard.top_performers',
      },
      {
        id: 'bounty-open',
        label: 'Open bounties',
        kind: 'send_message',
        text: 'What bounties are available?',
        intentId: 'quick.bounties',
      },
    ];
    return mergeNavIntoPayloads(toolName, [
      widgetPayload('bounty_board', payload, title, bountyActions),
    ]);
  }

  if (toolName === 'projects:get_tasks_by_user') {
    let payload: Record<string, unknown>;
    if (Array.isArray(sanitized)) {
      payload = { tasks: sanitized, stats: {}, aggregates: undefined };
    } else if (sanitized && typeof sanitized === 'object' && 'tasks' in (sanitized as object)) {
      payload = sanitized as Record<string, unknown>;
    } else {
      payload = { tasks: [], stats: {}, aggregates: undefined };
    }
    const title = extractShortTitle('Your tasks', obs.summary);
    const taskActions: WidgetBlockAction[] = [
      {
        id: 'tasks-overdue',
        label: 'Overdue only',
        kind: 'send_message',
        text: 'Which of my tasks are overdue?',
        intentId: 'projects.overdue',
      },
      {
        id: 'tasks-due-week',
        label: 'Due this week',
        kind: 'send_message',
        text: 'What tasks do I have due this week?',
        intentId: 'projects.due_this_week',
      },
      {
        id: 'tasks-all-active',
        label: 'All active',
        kind: 'send_message',
        text: 'What are my open tasks?',
        intentId: 'quick.open_tasks',
      },
    ];
    return mergeNavIntoPayloads(toolName, [
      widgetPayload('task_table', payload, title, taskActions),
    ]);
  }

  if (toolName === 'finance:get_reimbursement_details') {
    if (
      sanitized &&
      typeof sanitized === 'object' &&
      Array.isArray((sanitized as Record<string, unknown>).claims)
    ) {
      const payload = sanitized as Record<string, unknown>;
      const title = extractShortTitle('Your reimbursements', obs.summary);
      const reimbActions: WidgetBlockAction[] = [
        {
          id: 'reimb-finance-summary',
          label: 'Company finances',
          kind: 'send_message',
          text: 'What is the company-wide financial summary this month?',
          intentId: 'finance.company_summary',
        },
        {
          id: 'reimb-open-tasks',
          label: 'My tasks',
          kind: 'send_message',
          text: 'What are my open tasks?',
          intentId: 'quick.open_tasks',
        },
      ];
      return mergeNavIntoPayloads(toolName, [
        widgetPayload('reimbursement_claims', payload, title, reimbActions),
      ]);
    }
    const fb = AI_WIDGET_TOOL_MAP[toolName];
    if (!fb) return [];
    return mergeNavIntoPayloads(toolName, [widgetPayload(fb, sanitized, obs.summary ?? '')]);
  }

  if (toolName === 'projects:get_project_status') {
    let payload: Record<string, unknown>;
    if (
      sanitized &&
      typeof sanitized === 'object' &&
      !Array.isArray(sanitized) &&
      Array.isArray((sanitized as Record<string, unknown>).projects)
    ) {
      payload = sanitized as Record<string, unknown>;
    } else if (Array.isArray(sanitized)) {
      const projects = sanitized as Record<string, unknown>[];
      payload = {
        projects,
        aggregates: computeProjectStatusAggregates(projects),
      };
    } else {
      payload = { projects: [], aggregates: computeProjectStatusAggregates([]) };
    }
    const title = extractShortTitle('Project status', obs.summary);
    const projectActions: WidgetBlockAction[] = [
      {
        id: 'proj-open-tasks',
        label: 'My tasks',
        kind: 'send_message',
        text: 'What are my open tasks?',
        intentId: 'quick.open_tasks',
      },
      {
        id: 'proj-due-week',
        label: 'Due this week',
        kind: 'send_message',
        text: 'What tasks do I have due this week?',
        intentId: 'projects.due_this_week',
      },
      {
        id: 'proj-sprint',
        label: 'Sprint status',
        kind: 'send_message',
        text: 'What is the current sprint status across projects?',
        intentId: 'projects.sprint',
      },
    ];
    return mergeNavIntoPayloads(toolName, [widgetPayload('project_status', payload, title, projectActions)]);
  }

  if (toolName === 'projects:get_sprint_status') {
    const { sprints, aggregates } = sprintsFromSprintStatusData(sanitized);
    const payload = { sprints, aggregates };
    const title = extractShortTitle('Sprint status', obs.summary);
    const sprintActions: WidgetBlockAction[] = [
      {
        id: 'spr-open-tasks',
        label: 'My tasks',
        kind: 'send_message',
        text: 'What are my open tasks?',
        intentId: 'quick.open_tasks',
      },
      {
        id: 'spr-active-projects',
        label: 'Active projects',
        kind: 'send_message',
        text: 'What is the status of all active projects?',
        intentId: 'quick.active_projects',
      },
      {
        id: 'spr-team-compare',
        label: 'Compare teams',
        kind: 'send_message',
        text: 'How do all teams compare this month?',
        intentId: 'performance.team_compare',
      },
    ];
    return mergeNavIntoPayloads(toolName, [widgetPayload('sprint_status', payload, title, sprintActions)]);
  }

  if (toolName === 'analytics:get_approval_queue') {
    const { items, aggregates } = itemsFromApprovalQueueData(sanitized);
    const payload = { items, aggregates };
    const title = extractShortTitle('Pending approvals', obs.summary);
    const approvalActions: WidgetBlockAction[] = [
      {
        id: 'appr-open-tasks',
        label: 'My tasks',
        kind: 'send_message',
        text: 'What are my open tasks?',
        intentId: 'quick.open_tasks',
      },
      {
        id: 'appr-reimb-only',
        label: 'Reimbursements',
        kind: 'send_message',
        text: 'What reimbursements need my approval?',
        intentId: 'quick.approval_reimbursements',
      },
      {
        id: 'appr-projects',
        label: 'Active projects',
        kind: 'send_message',
        text: 'What is the status of all active projects?',
        intentId: 'quick.active_projects',
      },
    ];
    return mergeNavIntoPayloads(toolName, [
      widgetPayload('approval_queue', payload, title, approvalActions),
    ]);
  }

  if (toolName === 'people:get_team_overview') {
    let payload: Record<string, unknown>;
    if (
      sanitized &&
      typeof sanitized === 'object' &&
      !Array.isArray(sanitized) &&
      Array.isArray((sanitized as Record<string, unknown>).teams)
    ) {
      payload = sanitized as Record<string, unknown>;
    } else if (Array.isArray(sanitized)) {
      const teams = sanitized as Record<string, unknown>[];
      payload = {
        teams,
        period: 'this_month',
        aggregates: computeTeamOverviewAggregates(teams),
      };
    } else {
      payload = { teams: [], period: 'this_month', aggregates: computeTeamOverviewAggregates([]) };
    }
    const title = extractShortTitle('Team overview', obs.summary);
    const teamActions: WidgetBlockAction[] = [
      {
        id: 'team-open-tasks',
        label: 'Open tasks',
        kind: 'send_message',
        text: 'What are my open tasks?',
        intentId: 'quick.open_tasks',
      },
      {
        id: 'team-my-perf',
        label: 'My performance',
        kind: 'send_message',
        text: 'Show me my performance this month',
        intentId: 'performance.my_month',
      },
      {
        id: 'team-top-performers',
        label: 'Top performers',
        kind: 'send_message',
        text: 'Who are the top performers this quarter?',
        intentId: 'dashboard.top_performers',
      },
    ];
    return mergeNavIntoPayloads(toolName, [widgetPayload('team_overview', payload, title, teamActions)]);
  }

  if (toolName === 'analytics:get_system_stats') {
    const payload =
      sanitized && typeof sanitized === 'object' && !Array.isArray(sanitized)
        ? (sanitized as Record<string, unknown>)
        : {};
    const title = extractShortTitle('System overview', obs.summary);
    const systemActions: WidgetBlockAction[] = [
      {
        id: 'sys-open-tasks',
        label: 'Open tasks',
        kind: 'send_message',
        text: 'What are my open tasks?',
        intentId: 'quick.open_tasks',
      },
      {
        id: 'sys-company-finance',
        label: 'Company finances',
        kind: 'send_message',
        text: 'What is the company-wide financial summary this month?',
        intentId: 'finance.company_summary',
      },
      {
        id: 'sys-command-center',
        label: 'Command Center',
        kind: 'send_message',
        text: 'Show me dashboard metrics',
        intentId: 'dashboard.metrics',
      },
    ];
    return mergeNavIntoPayloads(toolName, [
      widgetPayload('system_overview', payload, title, systemActions),
    ]);
  }

  if (toolName === 'analytics:get_department_report') {
    const payload =
      sanitized && typeof sanitized === 'object' && !Array.isArray(sanitized)
        ? (sanitized as Record<string, unknown>)
        : {};
    const title = extractShortTitle('Executive report', obs.summary);
    const execActions: WidgetBlockAction[] = [
      {
        id: 'exec-system',
        label: 'System overview',
        kind: 'send_message',
        text: 'Give me a system-wide overview',
        intentId: 'admin.system_overview',
      },
      {
        id: 'exec-finance',
        label: 'Company finances',
        kind: 'send_message',
        text: 'What is the company-wide financial summary this month?',
        intentId: 'finance.company_summary',
      },
      {
        id: 'exec-teams',
        label: 'Compare teams',
        kind: 'send_message',
        text: 'How do all teams compare this month?',
        intentId: 'performance.team_compare',
      },
    ];
    return mergeNavIntoPayloads(toolName, [
      widgetPayload('executive_report', payload, title, execActions),
    ]);
  }

  if (toolName === 'finance:get_financial_summary') {
    const payload =
      sanitized && typeof sanitized === 'object' && !Array.isArray(sanitized)
        ? (sanitized as Record<string, unknown>)
        : {};
    const title = extractShortTitle('Financial summary', obs.summary);
    const finActions: WidgetBlockAction[] = [
      {
        id: 'fin-pending-invoices',
        label: 'Pending invoices',
        kind: 'send_message',
        text: 'Show me pending invoices',
        intentId: 'finance.pending_invoices',
      },
      {
        id: 'fin-system-overview',
        label: 'System overview',
        kind: 'send_message',
        text: 'Give me a system-wide overview',
        intentId: 'admin.system_overview',
      },
      {
        id: 'fin-compare-teams',
        label: 'Compare teams',
        kind: 'send_message',
        text: 'How do all teams compare this month?',
        intentId: 'performance.team_compare',
      },
    ];
    return mergeNavIntoPayloads(toolName, [
      widgetPayload('financial_summary', payload, title, finActions),
    ]);
  }

  const widgetType = AI_WIDGET_TOOL_MAP[toolName];
  if (!widgetType) return [];
  return mergeNavIntoPayloads(toolName, [widgetPayload(widgetType, sanitized, obs.summary ?? '')]);
}
