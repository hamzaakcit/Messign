import { describe, expect, it } from 'vitest';
import '../../../services/ai/tools/index.js';
import { resolveWidgetPayloadsForTool } from '../../../services/ai/widgetResolve.js';

describe('resolveWidgetPayloadsForTool', () => {
  it('returns command_center for dashboard tool', () => {
    const payloads = resolveWidgetPayloadsForTool(
      'dashboard:get_command_center',
      { success: true, data: { generatedAt: '2020-01-01', pulse: {}, brain: {}, growth: {}, future: {}, workspace: {} }, summary: '' },
      'employee',
    );
    expect(payloads).toHaveLength(1);
    expect(payloads[0]?.widgetType).toBe('command_center');
    expect(payloads[0]?.actions?.some((a) => a.kind === 'navigate')).toBe(true);
  });

  it('returns knowledge_doc_list for KB search doc array', () => {
    const payloads = resolveWidgetPayloadsForTool(
      'knowledge:search_knowledge_base',
      {
        success: true,
        data: [{ id: '1', title: 'Guide', slug: 'guide', document_type: 'document' }],
        summary: 'x',
      },
      'employee',
    );
    expect(payloads[0]?.widgetType).toBe('knowledge_doc_list');
    expect(payloads[0]?.actions?.some((a) => a.kind === 'send_message' && a.intentId === 'quick.open_tasks')).toBe(true);
    expect(payloads[0]?.actions?.some((a) => a.kind === 'navigate')).toBe(true);
  });

  it('returns knowledge_doc_list for structured KB payload', () => {
    const payloads = resolveWidgetPayloadsForTool(
      'knowledge:search_knowledge_base',
      {
        success: true,
        data: {
          documents: [{ id: '1', title: 'Guide', slug: 'guide', document_type: 'document' }],
          aggregates: { count: 1, byType: { document: 1 } },
          query: 'policies',
          confidence: 0.85,
        },
        summary: '**1 document(s)** for "policies"',
      },
      'employee',
    );
    expect(payloads[0]?.widgetType).toBe('knowledge_doc_list');
    expect(payloads[0]?.actions?.some((a) => a.kind === 'send_message' && a.intentId === 'dashboard.metrics')).toBe(true);
  });

  it('maps approval queue to approval_queue widget with actions and nav', () => {
    const payloads = resolveWidgetPayloadsForTool(
      'analytics:get_approval_queue',
      {
        success: true,
        data: {
          items: [{ id: 'a', type: 'reimbursement', title: 'Trip', detail: '10 USD', date: '2025-06-01' }],
          aggregates: { total: 1, byType: { reimbursement: 1, document: 0, invoice: 0 } },
        },
        summary: '1 pending item (1 reimbursement).',
      },
      'manager',
    );
    expect(payloads[0]?.widgetType).toBe('approval_queue');
    expect(payloads[0]?.actions?.some((a) => a.kind === 'send_message' && a.intentId === 'quick.open_tasks')).toBe(
      true,
    );
    expect(
      payloads[0]?.actions?.some((a) => a.kind === 'send_message' && a.intentId === 'quick.approval_reimbursements'),
    ).toBe(true);
    expect(payloads[0]?.actions?.some((a) => a.kind === 'navigate' && a.to === '/reimbursements')).toBe(true);
  });

  it('returns task_table with actions for get_tasks_by_user', () => {
    const payloads = resolveWidgetPayloadsForTool(
      'projects:get_tasks_by_user',
      {
        success: true,
        data: {
          tasks: [{ id: 't1', title: 'Do thing', status: 'todo', due_date: null }],
          stats: { total: 1, overdue: 0, highPriority: 0 },
          aggregates: { byStatus: { Open: 1 }, byPriority: { high: 0, medium: 0, low: 0, none: 1 }, dueBuckets: { overdue: 0, due_this_week: 0, later: 0, no_due: 1 } },
        },
        summary: "**You's tasks** — 1 shown.",
      },
      'employee',
    );
    expect(payloads).toHaveLength(1);
    expect(payloads[0]?.widgetType).toBe('task_table');
    expect(payloads[0]?.actions?.some((a) => a.kind === 'send_message' && a.intentId === 'projects.overdue')).toBe(true);
    expect(payloads[0]?.actions?.some((a) => a.kind === 'navigate')).toBe(true);
  });

  it('returns performance_overview with actions for get_employee_performance', () => {
    const payloads = resolveWidgetPayloadsForTool(
      'people:get_employee_performance',
      {
        success: true,
        data: {
          employees: [{ full_name: 'You', tasks_completed: 3, xp: 100 }],
          teamAverage: { avg_tasks_completed: 2, avg_xp: 90, avg_activity_count: 5 },
          period: 'this_month',
          comparisonSeries: { employeeName: 'You', period: 'this_month', rows: [] },
        },
        summary: '**You** — this month: 3/0 tasks',
      },
      'employee',
    );
    expect(payloads).toHaveLength(1);
    expect(payloads[0]?.widgetType).toBe('performance_overview');
    expect(
      payloads[0]?.actions?.some((a) => a.kind === 'send_message' && a.intentId === 'performance.this_quarter'),
    ).toBe(true);
  });

  it('returns bounty_board with actions for get_bounty_board', () => {
    const payloads = resolveWidgetPayloadsForTool(
      'achievements:get_bounty_board',
      {
        success: true,
        data: {
          bounties: [{ id: 'b1', title: 'Test', xp_reward: 10, status: 'OPEN', urgency: 'NORMAL' }],
          filter: 'open',
          stats: { count: 1, totalXp: 10, avgXp: 10 },
          aggregates: { byStatus: { OPEN: 1 }, byUrgency: { NORMAL: 1 }, totalXp: 10, avgXp: 10, count: 1 },
        },
        summary: '**Bounty board (open)** — 1 bounties',
      },
      'employee',
    );
    expect(payloads).toHaveLength(1);
    expect(payloads[0]?.widgetType).toBe('bounty_board');
    expect(payloads[0]?.actions?.some((a) => a.kind === 'send_message' && a.intentId === 'quick.bounties')).toBe(true);
  });

  it('returns badges_earned with actions for user_badges leaderboard payload', () => {
    const payloads = resolveWidgetPayloadsForTool(
      'achievements:get_achievements_leaderboard',
      {
        success: true,
        data: {
          badges: [
            { name: 'Starter', description: 'First badge', icon: '🏅', earned_at: '2024-03-01T00:00:00.000Z' },
          ],
          points: 42,
          aggregates: { count: 1, byMonth: { '2024-03': 1 } },
        },
        summary: '**Your badges** — 1 earned.',
      },
      'employee',
    );
    expect(payloads).toHaveLength(1);
    expect(payloads[0]?.widgetType).toBe('badges_earned');
    expect(payloads[0]?.actions?.some((a) => a.kind === 'send_message' && a.intentId === 'achievements.leaderboard')).toBe(
      true,
    );
    expect(payloads[0]?.actions?.some((a) => a.kind === 'send_message' && a.intentId === 'quick.bounties')).toBe(true);
  });

  it('returns leaderboard_list with aggregates and actions for structured XP leaderboard', () => {
    const payloads = resolveWidgetPayloadsForTool(
      'achievements:get_achievements_leaderboard',
      {
        success: true,
        data: {
          leaderboard: [
            {
              user_id: '3a733025-e96b-4ee4-9b8a-4fb6423ad4b7',
              rank: 1,
              points: 120,
              full_name: 'Lead User',
              email: 'lead@example.com',
            },
          ],
          aggregates: { count: 1, topPoints: 120, avgPoints: 120 },
        },
        summary: 'Top 1 by XP (all-time). Lead User leads with 120 XP.',
      },
      'manager',
    );
    expect(payloads).toHaveLength(1);
    expect(payloads[0]?.widgetType).toBe('leaderboard_list');
    const d = payloads[0]?.data as Record<string, unknown>;
    expect(d?.aggregates).toBeDefined();
    expect(payloads[0]?.actions?.some((a) => a.kind === 'send_message' && a.intentId === 'quick.open_tasks')).toBe(true);
    expect(payloads[0]?.actions?.some((a) => a.kind === 'send_message' && a.intentId === 'performance.team_compare')).toBe(
      true,
    );
    expect(payloads[0]?.actions?.some((a) => a.kind === 'navigate' && a.to === '/achievements')).toBe(true);
  });

  it('returns reimbursement_claims with actions for structured reimbursement payload', () => {
    const payloads = resolveWidgetPayloadsForTool(
      'finance:get_reimbursement_details',
      {
        success: true,
        data: {
          claims: [
            {
              id: 'r1',
              title: 'Travel',
              amount: 120,
              status: 'submitted',
              created_at: '2024-03-01T00:00:00.000Z',
            },
          ],
          aggregates: {
            count: 1,
            totalAmount: 120,
            byStatus: { submitted: 1 },
            byMonth: { '2024-03': 1 },
          },
          filter: 'pending',
        },
        summary: '**1 claim(s)** · $120.00 total',
      },
      'employee',
    );
    expect(payloads).toHaveLength(1);
    expect(payloads[0]?.widgetType).toBe('reimbursement_claims');
    expect(payloads[0]?.actions?.some((a) => a.kind === 'send_message' && a.intentId === 'finance.company_summary')).toBe(
      true,
    );
    expect(payloads[0]?.actions?.some((a) => a.kind === 'navigate')).toBe(true);
  });

  it('returns team_overview with actions for get_team_overview payload', () => {
    const payloads = resolveWidgetPayloadsForTool(
      'people:get_team_overview',
      {
        success: true,
        data: {
          teams: [
            {
              id: 't1',
              name: 'Alpha',
              memberCount: 3,
              completionRate: 75,
              activityCount: 10,
              taskStats: { total: 8, completed: 6, in_progress: 1, todo: 1, blocked: 0, overdue: 0 },
            },
          ],
          period: 'this_month',
          aggregates: { teamCount: 1, totalMembers: 3, avgCompletion: 75, totalTasks: 8, completedTasks: 6 },
        },
        summary: '**Alpha** — 3 members',
      },
      'manager',
    );
    expect(payloads).toHaveLength(1);
    expect(payloads[0]?.widgetType).toBe('team_overview');
    expect(payloads[0]?.actions?.some((a) => a.kind === 'send_message' && a.intentId === 'quick.open_tasks')).toBe(true);
    expect(payloads[0]?.actions?.some((a) => a.kind === 'send_message' && a.intentId === 'dashboard.top_performers')).toBe(
      true,
    );
  });

  it('returns project_status with actions for get_project_status payload', () => {
    const payloads = resolveWidgetPayloadsForTool(
      'projects:get_project_status',
      {
        success: true,
        data: {
          projects: [
            {
              id: 'p1',
              name: 'Alpha',
              status: 'active',
              completionPercentage: 50,
              taskStats: { total: 4, completed: 2, in_progress: 1, todo: 1, blocked: 0, overdue: 0 },
            },
          ],
          aggregates: { projectCount: 1, avgCompletion: 50, totalTasks: 4, completedTasks: 2 },
        },
        summary: '**1 project(s)**',
      },
      'employee',
    );
    expect(payloads).toHaveLength(1);
    expect(payloads[0]?.widgetType).toBe('project_status');
    expect(payloads[0]?.actions?.some((a) => a.kind === 'send_message' && a.intentId === 'quick.open_tasks')).toBe(true);
    expect(payloads[0]?.actions?.some((a) => a.kind === 'send_message' && a.intentId === 'projects.sprint')).toBe(true);
    expect(payloads[0]?.actions?.some((a) => a.kind === 'navigate')).toBe(true);
  });

  it('returns system_overview with actions and dashboard nav for get_system_stats', () => {
    const payloads = resolveWidgetPayloadsForTool(
      'analytics:get_system_stats',
      {
        success: true,
        data: {
          users: { total: 10, active: 8 },
          tasks: {
            total: 20,
            completed: 10,
            in_progress: 5,
            open: 3,
            blocked: 1,
            overdue: 1,
          },
          projects: { total: 5, active: 4 },
          documents: { total: 30, published: 25, drafts: 3, in_review: 2 },
          activities: { total: 500, this_week: 40, today: 5 },
        },
        summary: 'Platform overview: 8 active users (10 total), 4 active projects (5 total), 20 tasks (50% completed), 30 knowledge docs, 40 activities this week.',
      },
      'admin',
    );
    expect(payloads).toHaveLength(1);
    expect(payloads[0]?.widgetType).toBe('system_overview');
    expect(payloads[0]?.actions?.some((a) => a.kind === 'send_message' && a.intentId === 'dashboard.metrics')).toBe(true);
    expect(payloads[0]?.actions?.some((a) => a.kind === 'navigate' && a.to === '/dashboard')).toBe(true);
  });

  it('returns executive_report with actions and reports nav for get_department_report', () => {
    const payloads = resolveWidgetPayloadsForTool(
      'analytics:get_department_report',
      {
        success: true,
        data: {
          people: { active: 5, total_employees: 6, new_hires: 0 },
          projects: { active: 2, total: 3, completed_period: 1, overdue: 0 },
          finance: { total_claims: 2, total_amount: 400, pending_count: 1, pending_amount: 200 },
          knowledge: { total_docs: 10, published: 8, new_docs: 1, pending_review: 0 },
          activity: { total: 20 },
          aggregates: {
            activeEmployees: 5,
            activeProjects: 2,
            reimbursementTotal: 400,
            pendingReimbursementCount: 1,
            knowledgeDocs: 10,
            periodActions: 20,
          },
          timePeriod: 'this_quarter',
        },
        summary:
          'Executive report (this quarter): 5 active employees, 2 active projects, $400 reimbursements (1 pending), 10 knowledge docs, 20 activities.',
      },
      'admin',
    );
    expect(payloads).toHaveLength(1);
    expect(payloads[0]?.widgetType).toBe('executive_report');
    expect(payloads[0]?.actions?.some((a) => a.kind === 'send_message' && a.intentId === 'admin.system_overview')).toBe(true);
    expect(payloads[0]?.actions?.some((a) => a.kind === 'navigate' && a.to === '/reports')).toBe(true);
  });

  it('returns financial_summary with actions and finance nav for get_financial_summary', () => {
    const payloads = resolveWidgetPayloadsForTool(
      'finance:get_financial_summary',
      {
        success: true,
        data: {
          reimbursements: { total_count: 2, total_amount: '500' },
          invoices: { total: 1, total_amount: '100', paid: 0, unpaid: 1 },
          topCategories: [],
          meta: { timePeriod: 'this_month', scope: 'company', scopeDowngraded: false },
        },
        summary:
          'Company financial summary (this month): 2 reimbursement claims ($500); 1 invoices ($100).',
      },
      'admin',
    );
    expect(payloads).toHaveLength(1);
    expect(payloads[0]?.widgetType).toBe('financial_summary');
    expect(payloads[0]?.actions?.some((a) => a.kind === 'send_message' && a.intentId === 'finance.pending_invoices')).toBe(
      true,
    );
    expect(payloads[0]?.actions?.some((a) => a.kind === 'navigate' && a.to === '/finance/invoices')).toBe(true);
    expect(payloads[0]?.actions?.some((a) => a.kind === 'navigate' && a.to === '/reimbursements')).toBe(true);
  });

  it('returns invoice_preview with navigate to /finance/invoices for get_invoice_details single row', () => {
    const payloads = resolveWidgetPayloadsForTool(
      'finance:get_invoice_details',
      {
        success: true,
        data: [
          {
            id: '3a733025-e96b-4ee4-9b8a-4fb6423ad4b7',
            invoice_number: 'INV-001',
            grand_total: 100,
            status: 'draft',
            created_at: '2025-01-01',
          },
        ],
        summary: 'Invoice found.',
      },
      'manager',
    );
    expect(payloads).toHaveLength(1);
    expect(payloads[0]?.widgetType).toBe('invoice_preview');
    expect(payloads[0]?.actions?.some((a) => a.kind === 'navigate' && a.to === '/finance/invoices')).toBe(true);
  });

  it('returns data_table with navigate to /finance/invoices for get_invoice_details multiple rows', () => {
    const payloads = resolveWidgetPayloadsForTool(
      'finance:get_invoice_details',
      {
        success: true,
        data: [
          {
            id: 'a',
            invoice_number: 'INV-001',
            grand_total: 50,
            status: 'draft',
            created_at: '2025-01-01',
          },
          {
            id: 'b',
            invoice_number: 'INV-002',
            grand_total: 60,
            status: 'draft',
            created_at: '2025-01-02',
          },
        ],
        summary: '2 invoices.',
      },
      'manager',
    );
    expect(payloads).toHaveLength(1);
    expect(payloads[0]?.widgetType).toBe('data_table');
    expect(payloads[0]?.actions?.some((a) => a.kind === 'navigate' && a.to === '/finance/invoices')).toBe(true);
  });

  it('returns sprint_status with actions for get_sprint_status payload', () => {
    const payloads = resolveWidgetPayloadsForTool(
      'projects:get_sprint_status',
      {
        success: true,
        data: {
          sprints: [
            {
              id: '3a733025-e96b-4ee4-9b8a-4fb6423ad4b7',
              project_name: 'Northstar',
              title: 'Help sprint',
              status: 'ACTIVE',
              progress: 66,
              helperCount: 2,
              max_helpers: 3,
              daysLeft: 5,
            },
          ],
          aggregates: { sprintCount: 1, avgProgress: 66, activeCount: 1, minDaysLeft: 5 },
        },
        summary: '1 sprint/help request (avg 66% staffed, 1 active). Closest deadline in 5 days.',
      },
      'manager',
    );
    expect(payloads).toHaveLength(1);
    expect(payloads[0]?.widgetType).toBe('sprint_status');
    expect(payloads[0]?.actions?.some((a) => a.kind === 'send_message' && a.intentId === 'quick.active_projects')).toBe(
      true,
    );
    expect(payloads[0]?.actions?.some((a) => a.kind === 'send_message' && a.intentId === 'performance.team_compare')).toBe(
      true,
    );
    expect(payloads[0]?.actions?.some((a) => a.kind === 'navigate' && a.to === '/projects')).toBe(true);
  });
});
