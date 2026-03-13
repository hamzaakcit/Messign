/**
 * Action Governance — Risk classification for HITL
 *
 * Every write/delete/send action is risk-classified.
 * High-risk actions queue for human approval.
 */
export type RiskLevel = 'read' | 'write' | 'irreversible' | 'cross_module';

const TOOL_RISK_MAP: Record<string, RiskLevel> = {
  // Reads — auto-approve
  'crm:search_deals': 'read',
  'crm:get_pipeline_status': 'read',
  'crm:get_deal_details': 'read',
  'crm:get_sales_forecast': 'read',
  'crm:get_activity_gaps': 'read',
  'support:get_ticket_overview': 'read',
  'support:get_customer_health': 'read',
  'support:get_support_metrics': 'read',
  'finance:get_budget': 'read',
  'knowledge:search_knowledge_base': 'read',
  'hr:get_employee': 'read',

  // Writes — conditional approval
  'crm:update_deal': 'write',
  'crm:create_activity': 'write',
  'crm:create_deal': 'write',
  'crm:move_deal_to_stage': 'write',
  'support:assign_ticket': 'write',
  'support:update_ticket': 'write',
  'support:create_ticket': 'write',
  'time:log_entry': 'write',
  'okr:update_key_result': 'write',

  // Irreversible — always require approval
  'crm:delete_deal': 'irreversible',
  'crm:lose_deal': 'irreversible',
  'finance:create_expense': 'irreversible',
  'finance:approve_expense': 'irreversible',
  'support:close_ticket': 'irreversible',
  'hr:reject_application': 'irreversible',
  'marketing:launch_campaign': 'irreversible',
};

const CROSS_MODULE_TOOLS = new Set([
  'marketing:route_lead_to_crm',
  'finance:create_invoice_from_deal',
]);

const WRITE_AUTO_APPROVE_THRESHOLD = 1000; // USD

export function classifyActionRisk(
  toolName: string,
  args: Record<string, unknown>,
): RiskLevel {
  if (CROSS_MODULE_TOOLS.has(toolName)) {
    return 'cross_module';
  }

  const staticRisk = TOOL_RISK_MAP[toolName] ?? 'write';

  if (staticRisk === 'read') return 'read';
  if (staticRisk === 'irreversible') return 'irreversible';

  if (staticRisk === 'write') {
    const value = Number(args.value ?? args.amount ?? args.total ?? 0);
    if (value > WRITE_AUTO_APPROVE_THRESHOLD) {
      return 'irreversible';
    }
  }

  return staticRisk;
}
