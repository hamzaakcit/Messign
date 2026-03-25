import type { AIWidgetType } from '@/types/knowledge-hub/ai';

export interface WidgetActionDef {
  label: string;
  message?: string;
  intentId?: string;
  /** When true, triggers export instead of sendMessage */
  exportPdf?: boolean;
}

export const WIDGET_ACTIONS: Partial<Record<AIWidgetType, WidgetActionDef[]>> = {
  financial_summary: [
    { label: 'Drill into Unpaid', message: 'Break down unpaid invoices' },
    { label: 'Compare Quarters', message: 'Compare financial performance to last quarter' },
    { label: 'Export PDF', exportPdf: true },
  ],
  revenue_chart: [
    { label: 'Compare to last quarter', message: 'Compare this revenue view to last quarter' },
    { label: 'Export PDF', exportPdf: true },
  ],
  system_overview: [
    { label: 'Open task list', message: 'Show my open tasks', intentId: 'quick.open_tasks' },
    { label: 'Company finances', message: 'Summarize outstanding invoices and cash position' },
  ],
  command_center: [
    { label: 'Open tasks', message: 'What are my open tasks?', intentId: 'quick.open_tasks' },
    { label: 'Finance KPIs', message: 'Show finance dashboard KPIs', intentId: 'finance.company_summary' },
  ],
  task_table: [
    { label: 'What is overdue?', message: 'Which of my tasks are overdue?' },
    { label: 'Export PDF', exportPdf: true },
  ],
  performance_overview: [
    { label: 'Team breakdown', message: 'Break down team performance by member' },
    { label: 'Export PDF', exportPdf: true },
  ],
  project_status: [
    { label: 'Sprint status', message: 'What is the current sprint status across projects?' },
    { label: 'Export PDF', exportPdf: true },
  ],
  data_table: [{ label: 'Export PDF', exportPdf: true }],
  dora_dash: [{ label: 'Refresh overview', message: 'Refresh the company overview dashboard' }],
  invoice_preview: [
    { label: 'Open invoices', message: 'Show outstanding invoices', intentId: 'finance.pending_invoices' },
  ],
  leaderboard_list: [
    { label: 'Top performers', message: 'Who are the top performers this month?', intentId: 'dashboard.top_performers' },
  ],
  knowledge_doc_list: [
    { label: 'Search docs', message: 'Find onboarding guides in the knowledge base' },
    { label: 'Document stats', message: 'How many documents are in the knowledge base?', intentId: 'knowledge.stats' },
  ],
};

export function exportWidget(widgetType: AIWidgetType, format: 'pdf'): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent('dora:widget-export', { detail: { widgetType, format } }),
  );
}
