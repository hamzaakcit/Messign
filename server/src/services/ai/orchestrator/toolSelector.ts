import type { LLMToolDefinition } from '../types.js';
import type { DoraModule } from '../dora/types.js';

/** Namespaced tool names (module:action_noun). Used for tool selection and lookup. */
const CORE_TOOLS = new Set([
  'knowledge:search_knowledge_base',
  'system:get_user_profile',
  'system:get_available_questions',
]);

const MODULE_TOOLS: Record<string, string[]> = {
  dashboard: [
    'dashboard:get_command_center',
    'finance:get_financial_summary', 'people:get_team_overview', 'people:get_employee_performance',
    'analytics:get_system_stats', 'analytics:get_department_report', 'analytics:get_recent_activity',
  ],
  projects: [
    'projects:get_project_status', 'projects:get_tasks_by_user', 'projects:get_sprint_status',
    'achievements:get_bounty_board',
  ],
  'knowledge-hub': [
    'knowledge:get_knowledge_base_stats',
    'knowledge:get_live_document_stats',
    'meeting:get_meeting_decisions',
  ],
  achievements: [
    'achievements:get_achievements_leaderboard', 'achievements:get_showcase_items', 'achievements:get_bounty_board',
  ],
  'team-directory': [
    'people:get_team_overview', 'people:get_employee_performance', 'people:compare_employees',
    'heart:get_team_sentiment', 'heart:get_burnout_risk', 'heart:get_culture_score',
  ],
  invoices: [
    'finance:get_invoice_details', 'finance:get_financial_summary',
  ],
  reimbursements: [
    'finance:get_reimbursement_details',
  ],
  chat: [
    'communication:search_chat_messages',
  ],
  crm: [
    'crm:get_pipeline_status', 'crm:get_deal_details', 'crm:get_sales_forecast', 'crm:get_activity_gaps',
  ],
  marketing: [
    'marketing:get_campaign_performance', 'marketing:get_marketing_roi', 'marketing:suggest_content_topics',
  ],
  recruitment: [
    'recruitment:get_hiring_pipeline', 'recruitment:score_candidate', 'recruitment:get_recruitment_metrics', 'recruitment:get_cross_module_report',
  ],
  assets: [
    'assets:get_asset_summary', 'assets:get_license_utilization',
  ],
  contracts: [
    'contracts:get_contract_renewals', 'contracts:extract_contract_terms',
  ],
  support: [
    'support:get_ticket_overview', 'support:get_customer_health', 'support:get_support_metrics',
  ],
  culture: [
    'heart:get_team_sentiment', 'heart:get_burnout_risk', 'heart:get_culture_score',
    'heart:get_my_wellness', 'heart:send_pulse_survey',
  ],
  admin: [
    'analytics:get_system_stats', 'analytics:get_approval_queue', 'analytics:get_department_report',
    'people:get_team_overview', 'finance:get_financial_summary',
  ],
};

const KEYWORD_TOOLS: Array<{ keywords: string[]; tools: string[] }> = [
  { keywords: ['task', 'tasks', 'todo', 'to-do', 'assigned', 'open task', 'my task', 'extend', 'deadline', 'due date', 'push deadline'], tools: ['projects:get_tasks_by_user'] },
  { keywords: ['project', 'projects', 'sprint', 'milestone'], tools: ['projects:get_project_status', 'projects:get_sprint_status'] },
  { keywords: ['performance', 'kpi', 'metrics', 'revenue', 'sales', 'numbers'], tools: ['people:get_employee_performance', 'finance:get_financial_summary', 'people:get_team_overview'] },
  { keywords: ['team', 'department', 'member', 'employee', 'who', 'people', 'staff'], tools: ['people:get_team_overview', 'people:get_employee_performance'] },
  { keywords: ['invoice', 'billing', 'bill', 'payment'], tools: ['finance:get_invoice_details', 'finance:get_financial_summary'] },
  { keywords: ['reimbursement', 'expense', 'claim'], tools: ['finance:get_reimbursement_details'] },
  { keywords: ['chat', 'message', 'channel', 'discussion'], tools: ['communication:search_chat_messages'] },
  { keywords: ['leaderboard', 'badge', 'achievement', 'ranking', 'mp', 'xp', 'points', 'gamification'], tools: ['achievements:get_achievements_leaderboard'] },
  { keywords: ['bounty', 'bounties', 'reward'], tools: ['achievements:get_bounty_board'] },
  { keywords: ['showcase', 'portfolio'], tools: ['achievements:get_showcase_items'] },
  { keywords: ['approval', 'pending', 'approve', 'queue'], tools: ['analytics:get_approval_queue'] },
  { keywords: ['command center', 'main dashboard', 'home dashboard'], tools: ['dashboard:get_command_center'] },
  { keywords: ['system', 'health', 'stats', 'overview', 'status', 'dashboard', 'dashboard metrics'], tools: ['dashboard:get_command_center', 'analytics:get_system_stats', 'analytics:get_department_report', 'finance:get_financial_summary', 'people:get_team_overview'] },
  { keywords: ['meeting', 'decision', 'minutes', 'notes'], tools: ['meeting:get_meeting_decisions'] },
  { keywords: ['compare', 'comparison', 'versus', 'vs'], tools: ['people:compare_employees'] },
  {
    keywords: ['document', 'knowledge', 'guide', 'policy', 'sop', 'stale', 'staleness'],
    tools: ['knowledge:search_knowledge_base', 'knowledge:get_knowledge_base_stats', 'knowledge:get_live_document_stats'],
  },
  { keywords: ['activity', 'recent', 'latest', 'feed'], tools: ['analytics:get_recent_activity'] },
  { keywords: ["where's the fun stuff", 'fun stuff'], tools: ['fun:play_dora_dash'] },
  { keywords: ['financial', 'finance', 'money', 'budget', 'cost'], tools: ['finance:get_financial_summary', 'finance:get_invoice_details'] },
  { keywords: ['deal', 'deals', 'pipeline', 'crm', 'prospect', 'lead', 'leads', 'close', 'won', 'lost', 'forecast', 'sales forecast'], tools: ['crm:get_pipeline_status', 'crm:get_deal_details', 'crm:get_sales_forecast', 'crm:get_activity_gaps'] },
  { keywords: ['marketing', 'campaign', 'campaigns', 'roi', 'cpl', 'cac', 'mql', 'content', 'email campaign', 'channel performance'], tools: ['marketing:get_campaign_performance', 'marketing:get_marketing_roi', 'marketing:suggest_content_topics'] },
  { keywords: ['recruitment', 'hiring', 'candidate', 'job', 'interview', 'applicant', 'resume', 'offer', 'ats'], tools: ['recruitment:get_hiring_pipeline', 'recruitment:score_candidate', 'recruitment:get_recruitment_metrics', 'recruitment:get_cross_module_report'] },
  { keywords: ['asset', 'assets', 'equipment', 'license', 'licenses', 'software', 'warranty', 'utilization'], tools: ['assets:get_asset_summary', 'assets:get_license_utilization'] },
  { keywords: ['contract', 'contracts', 'renewal', 'expiry', 'obligation', 'compliance', 'e-sign', 'esign', 'signature'], tools: ['contracts:get_contract_renewals', 'contracts:extract_contract_terms'] },
  { keywords: ['ticket', 'tickets', 'support', 'help desk', 'helpdesk', 'sla', 'customer health', 'csat', 'agent'], tools: ['support:get_ticket_overview', 'support:get_customer_health', 'support:get_support_metrics'] },
  { keywords: ['time', 'hours', 'timesheet', 'utilization', 'billable', 'timer'], tools: ['projects:get_tasks_by_user', 'people:get_team_overview', 'people:get_employee_performance'] },
  { keywords: ['report', 'summary', 'analysis'], tools: ['analytics:get_department_report', 'finance:get_financial_summary'] },
  { keywords: ['sentiment', 'burnout', 'wellness', 'culture', 'team health', 'engagement', 'pulse', 'morale', 'stress', 'work-life'], tools: ['heart:get_team_sentiment', 'heart:get_burnout_risk', 'heart:get_culture_score', 'heart:get_my_wellness', 'heart:send_pulse_survey'] },
];

const MAX_TOOLS = 12;

/**
 * Selects the most relevant tools for a query + page context.
 * Groq struggles with 27+ tool definitions; sending only the relevant
 * subset (max ~12) dramatically improves tool-call reliability.
 */
export function selectToolsForQuery(
  query: string,
  currentModule: DoraModule,
  allTools: LLMToolDefinition[],
): LLMToolDefinition[] {
  const selectedNames = new Set<string>(CORE_TOOLS);

  const moduleTools = MODULE_TOOLS[currentModule];
  if (moduleTools) {
    for (const t of moduleTools) selectedNames.add(t);
  }

  const lowerQuery = query.toLowerCase();
  for (const { keywords, tools } of KEYWORD_TOOLS) {
    for (const kw of keywords) {
      if (lowerQuery.includes(kw)) {
        for (const t of tools) selectedNames.add(t);
        break;
      }
    }
  }

  if (selectedNames.size < 6) {
    for (const fallback of [
      'people:get_team_overview', 'finance:get_financial_summary', 'projects:get_tasks_by_user',
      'projects:get_project_status', 'people:get_employee_performance', 'analytics:get_recent_activity',
    ]) {
      selectedNames.add(fallback);
      if (selectedNames.size >= 8) break;
    }
  }

  const toolMap = new Map(allTools.map((t) => [t.function.name, t]));
  const result: LLMToolDefinition[] = [];

  for (const name of selectedNames) {
    let tool = toolMap.get(name);
    if (!tool && name.includes(':')) {
      const shortName = name.split(':')[1];
      tool = toolMap.get(shortName);
    }
    if (tool && result.length < MAX_TOOLS) {
      result.push(tool);
    }
  }

  return result;
}
