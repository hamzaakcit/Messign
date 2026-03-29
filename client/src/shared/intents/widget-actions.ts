import type { AIWidgetType } from '@/types/knowledge-hub/ai';

export interface WidgetActionDef {
  label: string;
  message?: string;
  intentId?: string;
  /** When true, triggers export instead of sendMessage */
  exportPdf?: boolean;
}

export const WIDGET_ACTIONS: Partial<Record<AIWidgetType, WidgetActionDef[]>> = {
  /** Toolbar from server (see widgetResolve finance:get_financial_summary). */
  financial_summary: [],
  revenue_chart: [
    { label: 'Compare to last quarter', message: 'Compare this revenue view to last quarter' },
    { label: 'Export PDF', exportPdf: true },
  ],
  /** Toolbar from server (see widgetResolve analytics:get_system_stats). */
  system_overview: [],
  /** Toolbar from server (see widgetResolve analytics:get_department_report). */
  executive_report: [],
  command_center: [
    { label: 'Open tasks', message: 'What are my open tasks?', intentId: 'quick.open_tasks' },
    { label: 'Finance KPIs', message: 'Show finance dashboard KPIs', intentId: 'finance.company_summary' },
  ],
  /** Toolbar actions come from server widget payload + default "Open projects" nav (see widgetResolve). */
  task_table: [],
  /** Server-driven actions for bounties (see widgetResolve achievements:get_bounty_board). */
  bounty_board: [],
  badges_earned: [],
  reimbursement_claims: [],
  /** Server-driven actions (see widgetResolve knowledge:search_knowledge_base). */
  knowledge_doc_list: [],
  /** Toolbar: server widget payload + people nav (see widgetResolve people:get_employee_performance). */
  performance_overview: [],
  /** Server-driven actions (see widgetResolve people:get_team_overview). */
  team_overview: [],
  /** Server-driven actions (see widgetResolve projects:get_project_status). */
  project_status: [],
  /** Server-driven actions (see widgetResolve projects:get_sprint_status). */
  sprint_status: [],
  /** Server-driven actions (see widgetResolve analytics:get_approval_queue). */
  approval_queue: [],
  data_table: [{ label: 'Export PDF', exportPdf: true }],
  dora_dash: [{ label: 'Refresh overview', message: 'Refresh the company overview dashboard' }],
  invoice_preview: [
    { label: 'Open invoices', message: 'Show outstanding invoices', intentId: 'finance.pending_invoices' },
  ],
  /** Toolbar from server widget payload (see widgetResolve achievements:get_achievements_leaderboard). */
  leaderboard_list: [],
};

export function exportWidget(widgetType: AIWidgetType, format: 'pdf'): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent('dora:widget-export', { detail: { widgetType, format } }),
  );
}
