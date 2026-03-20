import type OpenAI from 'openai';
import { getAllTools, getFullToolDefinition } from '../../toolRegistry.js';
import type { ToolParameterSchema } from '../../types.js';
import type { Domain, ToolDefinitionV2 } from '../types.js';

/** Cross-cutting tools always considered for the agent */
export const BASE_TOOLS = [
  'core:search_tools',
  'core:activate_tool',
  'knowledge:search_knowledge_base',
  'analytics:get_recent_activity',
] as const;

/**
 * Curated domain → tool ids (registered namespaced names). `unknown` relies on planning + BASE_TOOLS.
 */
export const DOMAIN_TOOL_MAP: Record<Domain, string[]> = {
  finance: [
    'finance:get_financial_summary',
    'finance:get_budget_status',
    'finance:get_reimbursement_details',
    'finance:get_invoice_details',
    'finance:get_finance_dashboard',
    'finance:invoice_status',
  ],
  hr: [
    'hr:get_hiring_pipeline',
    'hr:score_candidate',
    'hr:get_recruitment_metrics',
    'people:get_employee_performance',
    'people:get_team_overview',
  ],
  crm: [
    'crm:get_pipeline_status',
    'crm:get_deal_details',
    'crm:get_sales_forecast',
    'crm:search_deals',
  ],
  support: [
    'support:get_ticket_overview',
    'support:get_customer_health',
    'support:get_support_metrics',
  ],
  marketing: [
    'marketing:get_campaign_performance',
    'marketing:get_marketing_roi',
    'marketing:suggest_content_topics',
  ],
  time: ['time:get_time_summary', 'time:get_utilization_report', 'time:suggest_time_allocation'],
  okr: ['okr:get_okr_metrics', 'okr:list_goals', 'okr:get_goal_tree'],
  assets: ['assets:get_asset_summary', 'assets:get_license_utilization'],
  contracts: ['contracts:get_contract_renewals', 'contracts:extract_contract_terms'],
  culture: [
    'achievements:get_achievements_leaderboard',
    'achievements:get_bounty_board',
    'achievements:get_showcase_items',
    'fun:play_dora_dash',
  ],
  knowledge: [
    'knowledge:get_knowledge_base_stats',
    'knowledge:get_live_document_stats',
  ],
  analytics: [
    'analytics:get_system_stats',
    'analytics:get_approval_queue',
    'analytics:get_department_report',
  ],
  settings: ['system:get_user_profile', 'system:get_available_questions'],
  executive: ['executive:get_executive_dashboard', 'executive:generate_daily_briefing'],
  conversation: [],
  unknown: [],
};

export function selectTools(domain: Domain, overrideTools?: string[]): ToolDefinitionV2[] {
  const extra = DOMAIN_TOOL_MAP[domain] ?? [];
  const toolNames = overrideTools?.length
    ? [...new Set([...BASE_TOOLS, ...overrideTools])]
    : [...new Set([...BASE_TOOLS, ...extra])];

  const out: ToolDefinitionV2[] = [];
  for (const name of toolNames) {
    const full = getFullToolDefinition(name);
    if (!full) continue;
    const fn = full.llmSchema.function;
    const desc = fn.description ?? name;
    out.push({
      name: fn.name,
      domain,
      descriptionShort: desc.slice(0, 100),
      description: desc,
      parameters: fn.parameters as ToolParameterSchema,
      llmTool: full.llmSchema as unknown as OpenAI.ChatCompletionTool,
    });
  }
  return out;
}

export interface ToolIndexEntry {
  name: string;
  descriptionShort: string;
}

/** Compact index for planning prompt (~ name + one line). */
export function getToolIndex(): ToolIndexEntry[] {
  return getAllTools().map((t) => ({
    name: t.name,
    descriptionShort: (t.description ?? t.name).split('\n')[0]!.slice(0, 120),
  }));
}
