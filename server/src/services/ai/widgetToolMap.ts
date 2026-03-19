/**
 * Maps tool names to generative UI widget types (shared by SSE route and direct intent path).
 */
export const AI_WIDGET_TOOL_MAP: Record<string, string> = {
  'analytics:get_system_stats': 'system_overview',
  'projects:get_tasks_by_user': 'task_table',
  'projects:get_project_status': 'project_status',
  'finance:get_financial_summary': 'financial_summary',
  'finance:get_invoice_details': 'data_table',
  'analytics:get_approval_queue': 'data_table',
  'finance:get_reimbursement_details': 'data_table',
  'people:get_employee_performance': 'performance_overview',
  'people:get_team_overview': 'team_overview',
  'hr:compare_employees': 'data_table',
  'hr:get_hiring_pipeline': 'data_table',
  'hr:get_recruitment_metrics': 'data_table',
  'support:get_ticket_overview': 'data_table',
  'support:get_support_metrics': 'data_table',
  'support:get_customer_health': 'data_table',
  'time:get_time_summary': 'data_table',
  'time:get_utilization_report': 'data_table',
  'okr:get_okr_metrics': 'data_table',
  'okr:list_goals': 'data_table',
  'fun:play_dora_dash': 'dora_dash',
};

export type ToolObservationForWidget = {
  toolName: string;
  success: boolean;
  data: unknown;
  summary?: string;
};
