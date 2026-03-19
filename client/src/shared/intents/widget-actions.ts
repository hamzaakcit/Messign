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
};

export function exportWidget(widgetType: AIWidgetType, format: 'pdf'): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent('dora:widget-export', { detail: { widgetType, format } }),
  );
}
