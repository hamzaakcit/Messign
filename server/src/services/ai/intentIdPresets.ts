/**
 * Deterministic tool calls for chip intent IDs from the client registry.
 * Skips LLM routing when POST /ai/answer includes a matching `intent` field.
 */
import type { ParsedToolCall } from './types.js';

const calls = (
  name: string,
  args: Record<string, unknown> = {},
): ParsedToolCall[] => [{ name, args, callId: `preset_${name.replace(/:/g, '_')}` }];

/** Intent id (client registry) → tool calls */
export const INTENT_ID_PRESETS: Record<string, ParsedToolCall[]> = {
  'quick.available_questions': calls('system:get_available_questions'),
  'quick.open_tasks': calls('projects:get_tasks_by_user', { user_identifier: 'me', status_filter: 'active' }),
  'dashboard.company_overview': calls('analytics:get_system_stats', { detail_level: 'summary' }),
  /** Pulse / Brain / Growth / Future — same aggregate as the home Command Center UI */
  'dashboard.metrics': calls('dashboard:get_command_center', {}),
  'dashboard.revenue_trend': calls('finance:get_financial_summary', { time_period: 'this_month', scope: 'company' }),
  'performance.my_month': calls('people:get_employee_performance', { employee_identifier: 'me', time_period: 'this_month' }),
  'performance.widget_my': calls('people:get_employee_performance', { employee_identifier: 'me', time_period: 'this_month' }),
  'performance.team': calls('people:get_team_overview', { team_identifier: 'my' }),
  'performance.widget_team': calls('people:get_team_overview', { team_identifier: 'my' }),
  'performance.top_performer': calls('achievements:get_achievements_leaderboard', { query_type: 'leaderboard' }),
  'dashboard.top_performers': calls('achievements:get_achievements_leaderboard', { query_type: 'leaderboard' }),
  'performance.team_compare': calls('people:get_team_overview', { team_identifier: 'all' }),
  'admin.all_teams': calls('people:get_team_overview', { team_identifier: 'all' }),
  'projects.statuses': calls('projects:get_project_status', { project_name: 'all' }),
  'projects.sprint': calls('projects:get_sprint_status', { project_name: 'all' }),
  'projects.active_overview': calls('projects:get_project_status', { project_name: 'all' }),
  'projects.widget_active': calls('projects:get_project_status', { project_name: 'all' }),
  'projects.widget_overdue': calls('projects:get_tasks_by_user', { user_identifier: 'me', status_filter: 'active' }),
  'projects.overdue': calls('projects:get_tasks_by_user', { user_identifier: 'me', status_filter: 'active' }),
  'quick.pending_approvals': calls('analytics:get_approval_queue', { domain: 'all' }),
  'admin.pending_approvals_all': calls('analytics:get_approval_queue', { domain: 'all' }),
  'finance.revenue_quarter': calls('finance:get_financial_summary', { time_period: 'this_quarter', scope: 'company' }),
  'finance.my_reimbursements': calls('finance:get_reimbursement_details', { user_identifier: 'me' }),
  'finance.company_summary': calls('finance:get_financial_summary', { time_period: 'this_month', scope: 'company' }),
  'finance.widget_summary': calls('finance:get_financial_summary', { time_period: 'this_month', scope: 'company' }),
  'finance.pending_invoices': calls('finance:get_invoice_details', { search_term: 'all', status_filter: 'pending' }),
  'knowledge.find_guide': calls('knowledge:search_knowledge_base', { query: 'onboarding guide' }),
  'knowledge.widget_find': calls('knowledge:search_knowledge_base', { query: 'getting started guide' }),
  'knowledge.brand': calls('knowledge:search_knowledge_base', { query: 'brand guidelines' }),
  'knowledge.health': calls('knowledge:get_live_document_stats'),
  'knowledge.stats': calls('knowledge:get_live_document_stats'),
  'achievements.badges': calls('achievements:get_achievements_leaderboard', { query_type: 'user_badges', user_identifier: 'me' }),
  'achievements.leaderboard': calls('achievements:get_achievements_leaderboard', { query_type: 'leaderboard' }),
  'admin.system_overview': calls('analytics:get_system_stats', { detail_level: 'detailed' }),
  'executive.report': calls('analytics:get_system_stats', { detail_level: 'detailed' }),
  'admin.widget_health': calls('analytics:get_system_stats', { detail_level: 'summary' }),
  'crm.pipeline': calls('crm:get_pipeline_status'),
  'crm.widget_pipeline': calls('crm:get_pipeline_status'),
  'crm.widget_stale': calls('crm:get_activity_gaps'),
  'crm.deals.active': calls('crm:search_deals', { status: 'open', limit: 20 }),
  'crm.contacts.recent': calls('crm:get_activity_gaps'),
  'marketing.campaigns': calls('marketing:get_campaign_performance'),
  'marketing.widget_roi': calls('marketing:get_marketing_roi'),
  'marketing.performance': calls('marketing:get_campaign_performance'),
  'recruitment.open': calls('hr:get_hiring_pipeline'),
  'recruitment.pipeline': calls('hr:get_hiring_pipeline'),
  'recruitment.widget_pipeline': calls('hr:get_hiring_pipeline'),
  'support.tickets.open': calls('support:get_ticket_overview'),
  'support.widget_overview': calls('support:get_ticket_overview'),
  'support.widget_at_risk': calls('support:get_customer_health'),
  'support.sla': calls('support:get_support_metrics'),
  'okr.progress': calls('okr:get_okr_metrics'),
  'okr.team': calls('okr:get_okr_metrics'),
  'okr.list_goals': calls('okr:list_goals', { level: 'individual' }),
  'assets.inventory': calls('assets:get_asset_summary'),
  'assets.widget_summary': calls('assets:get_asset_summary'),
  'assets.licenses': calls('assets:get_license_utilization'),
  'contracts.expiring': calls('contracts:get_contract_renewals', { withinDays: 90 }),
  'contracts.widget_renewals': calls('contracts:get_contract_renewals', { withinDays: 90 }),
  'contracts.active': calls('contracts:get_contract_renewals', { withinDays: 365 }),
  'culture.score': calls('heart:get_culture_score'),
  'reports.available': calls('executive:get_executive_dashboard'),
};

export function getPresetCallsForIntentId(intentId: string): ParsedToolCall[] | null {
  const trimmed = intentId.trim();
  if (!trimmed) return null;
  return INTENT_ID_PRESETS[trimmed] ?? null;
}
