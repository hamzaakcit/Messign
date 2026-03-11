import type { LLMToolDefinition } from '../types.js';
import type { DoraModule } from '../dora/types.js';

const CORE_TOOLS = new Set([
  'search_knowledge_base',
  'get_user_profile',
  'get_available_questions',
]);

const MODULE_TOOLS: Record<string, string[]> = {
  dashboard: [
    'get_financial_summary', 'get_team_overview', 'get_employee_performance',
    'get_system_stats', 'get_department_report', 'get_recent_activity',
  ],
  projects: [
    'get_project_status', 'get_tasks_by_user', 'get_sprint_status',
    'get_bounty_board',
  ],
  'knowledge-hub': [
    'get_knowledge_base_stats', 'get_meeting_decisions',
  ],
  achievements: [
    'get_achievements_leaderboard', 'get_showcase_items', 'get_bounty_board',
  ],
  'team-directory': [
    'get_team_overview', 'get_employee_performance', 'compare_employees',
  ],
  invoices: [
    'get_invoice_details', 'get_financial_summary',
  ],
  reimbursements: [
    'get_reimbursement_details',
  ],
  chat: [
    'search_chat_messages',
  ],
  crm: [
    'get_pipeline_status', 'get_deal_details', 'get_sales_forecast', 'get_activity_gaps',
  ],
  marketing: [
    'get_campaign_performance', 'get_marketing_roi', 'suggest_content_topics',
  ],
  recruitment: [
    'get_hiring_pipeline', 'score_candidate', 'get_recruitment_metrics', 'get_cross_module_report',
  ],
  assets: [
    'get_asset_summary', 'get_license_utilization',
  ],
  contracts: [
    'get_contract_renewals', 'extract_contract_terms',
  ],
  support: [
    'get_ticket_overview', 'get_customer_health', 'get_support_metrics',
  ],
  time: [
    'get_time_summary', 'get_utilization_report', 'suggest_time_allocation',
  ],
  admin: [
    'get_system_stats', 'get_approval_queue', 'get_department_report',
    'get_team_overview', 'get_financial_summary',
  ],
};

const KEYWORD_TOOLS: Array<{ keywords: string[]; tools: string[] }> = [
  { keywords: ['task', 'tasks', 'todo', 'to-do', 'assigned', 'open task', 'my task', 'extend', 'deadline', 'due date', 'push deadline'], tools: ['get_tasks_by_user'] },
  { keywords: ['project', 'projects', 'sprint', 'milestone'], tools: ['get_project_status', 'get_sprint_status'] },
  { keywords: ['performance', 'kpi', 'metrics', 'revenue', 'sales', 'numbers'], tools: ['get_employee_performance', 'get_financial_summary', 'get_team_overview'] },
  { keywords: ['team', 'department', 'member', 'employee', 'who', 'people', 'staff'], tools: ['get_team_overview', 'get_employee_performance'] },
  { keywords: ['invoice', 'billing', 'bill', 'payment'], tools: ['get_invoice_details', 'get_financial_summary'] },
  { keywords: ['reimbursement', 'expense', 'claim'], tools: ['get_reimbursement_details'] },
  { keywords: ['chat', 'message', 'channel', 'discussion'], tools: ['search_chat_messages'] },
  { keywords: ['leaderboard', 'badge', 'achievement', 'ranking', 'mp', 'xp', 'points', 'gamification'], tools: ['get_achievements_leaderboard'] },
  { keywords: ['bounty', 'bounties', 'reward'], tools: ['get_bounty_board'] },
  { keywords: ['showcase', 'portfolio'], tools: ['get_showcase_items'] },
  { keywords: ['approval', 'pending', 'approve', 'queue'], tools: ['get_approval_queue'] },
  { keywords: ['system', 'health', 'stats', 'overview', 'status', 'dashboard', 'dashboard metrics'], tools: ['get_system_stats', 'get_department_report', 'get_financial_summary', 'get_team_overview'] },
  { keywords: ['meeting', 'decision', 'minutes', 'notes'], tools: ['get_meeting_decisions'] },
  { keywords: ['compare', 'comparison', 'versus', 'vs'], tools: ['compare_employees'] },
  { keywords: ['document', 'knowledge', 'guide', 'policy', 'sop'], tools: ['search_knowledge_base', 'get_knowledge_base_stats'] },
  { keywords: ['activity', 'recent', 'latest', 'feed'], tools: ['get_recent_activity'] },
  { keywords: ["where's the fun stuff", 'fun stuff'], tools: ['play_dora_dash'] },
  { keywords: ['financial', 'finance', 'money', 'budget', 'cost'], tools: ['get_financial_summary', 'get_invoice_details'] },
  { keywords: ['deal', 'deals', 'pipeline', 'crm', 'prospect', 'lead', 'leads', 'close', 'won', 'lost', 'forecast', 'sales forecast'], tools: ['get_pipeline_status', 'get_deal_details', 'get_sales_forecast', 'get_activity_gaps'] },
  { keywords: ['marketing', 'campaign', 'campaigns', 'roi', 'cpl', 'cac', 'mql', 'content', 'email campaign', 'channel performance'], tools: ['get_campaign_performance', 'get_marketing_roi', 'suggest_content_topics'] },
  { keywords: ['recruitment', 'hiring', 'candidate', 'job', 'interview', 'applicant', 'resume', 'offer', 'ats'], tools: ['get_hiring_pipeline', 'score_candidate', 'get_recruitment_metrics', 'get_cross_module_report'] },
  { keywords: ['asset', 'assets', 'equipment', 'license', 'licenses', 'software', 'warranty', 'utilization'], tools: ['get_asset_summary', 'get_license_utilization'] },
  { keywords: ['contract', 'contracts', 'renewal', 'expiry', 'obligation', 'compliance', 'e-sign', 'esign', 'signature'], tools: ['get_contract_renewals', 'extract_contract_terms'] },
  { keywords: ['ticket', 'tickets', 'support', 'help desk', 'helpdesk', 'sla', 'customer health', 'csat', 'agent'], tools: ['get_ticket_overview', 'get_customer_health', 'get_support_metrics'] },
  { keywords: ['time', 'hours', 'timesheet', 'utilization', 'billable', 'timer'], tools: ['get_time_summary', 'get_utilization_report', 'suggest_time_allocation'] },
  { keywords: ['report', 'summary', 'analysis'], tools: ['get_department_report', 'get_financial_summary'] },
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
      'get_team_overview', 'get_financial_summary', 'get_tasks_by_user',
      'get_project_status', 'get_employee_performance', 'get_recent_activity',
    ]) {
      selectedNames.add(fallback);
      if (selectedNames.size >= 8) break;
    }
  }

  const toolMap = new Map(allTools.map((t) => [t.function.name, t]));
  const result: LLMToolDefinition[] = [];

  for (const name of selectedNames) {
    const tool = toolMap.get(name);
    if (tool && result.length < MAX_TOOLS) {
      result.push(tool);
    }
  }

  return result;
}
