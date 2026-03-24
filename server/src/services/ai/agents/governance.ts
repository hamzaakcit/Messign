/**
 * Action Risk Classification — Governance for specialist agents
 *
 * Classifies tools as read, write, or irreversible.
 * Irreversible actions route to HITL (actionInterceptor).
 */

export type ActionRiskLevel = 'read' | 'write' | 'irreversible';

const READ_PATTERNS = [
  /search$/i,
  /get_/i,
  /list/i,
  /find/i,
  /fetch/i,
  /read/i,
  /:search_/i,
  /:get_/i,
];

/** Write patterns: create, update, assign — auto-execute per spec */
const WRITE_PATTERNS = [
  /create/i,
  /update/i,
  /assign/i,
  /draft/i,
  /modify/i,
];

/** Irreversible: route to HITL (actionInterceptor) */
const IRREVERSIBLE_PATTERNS = [
  /delete/i,
  /approve/i,
  /reject/i,
  /send/i,
  /launch/i,
  /flag/i,
  /generate/i,
  /post/i,
];

/**
 * Names containing "generate" are normally HITL (see IRREVERSIBLE_PATTERNS), but these only
 * produce structured text/briefs in-process — safe to auto-run in marketing loops (e.g. Instagram).
 */
const GENERATE_NAME_BUT_AUTO_EXECUTE = new Set(['creative:generate_image_brief']);

/** Tools that must always go to HITL (matches actionInterceptor). Exported for planner/discovery policy. */
export const HITL_MANAGED_TOOL_NAMES = new Set([
  'projects:create_task', 'projects:update_task_status', 'projects:update_task',
  'finance:draft_invoice', 'finance:approve_expense', 'finance:flag_expense',
  'finance:create_budget_alert', 'finance:create_budget', 'finance:update_budget',
  'finance:auto_approve_expense', 'finance:flag_expense_for_review', 'finance:generate_invoice',
  'finance:send_payment_reminder', 'finance:suggest_budget_reallocation',
  'communication:send_chat_message', 'core:send_reminder',
  'crm:create_deal', 'support:create_ticket', 'assets:assign_asset',
  'contracts:send_renewal_reminder', 'marketing:create_campaign', 'recruitment:post_job',
]);

/** @deprecated Use HITL_MANAGED_TOOL_NAMES */
const ALWAYS_HITL_NAMES = HITL_MANAGED_TOOL_NAMES;

/** Default threshold for value/amount escalation to irreversible (e.g. 1000 EUR) */
const VALUE_THRESHOLD = 1000;

/**
 * Classify the risk level of a tool invocation.
 * - read: auto-execute
 * - write: auto-execute (or could require confirmation in future)
 * - irreversible: route to HITL (actionInterceptor)
 */
export function classifyActionRisk(
  toolName: string,
  args: Record<string, unknown>,
  valueThreshold: number = VALUE_THRESHOLD,
): ActionRiskLevel {
  if (ALWAYS_HITL_NAMES.has(toolName)) return 'irreversible';
  if (GENERATE_NAME_BUT_AUTO_EXECUTE.has(toolName)) return 'read';

  const name = toolName.toLowerCase();

  for (const p of IRREVERSIBLE_PATTERNS) {
    if (p.test(name)) {
      // Check for high-value escalation
      const value = typeof args.value === 'number' ? args.value : typeof args.amount === 'number' ? args.amount : undefined;
      const allocatedAmount = typeof args.allocated_amount === 'number' ? args.allocated_amount : undefined;
      const budget = typeof args.budget === 'number' ? args.budget : undefined;
      const num = value ?? allocatedAmount ?? budget;
      if (num !== undefined && num >= valueThreshold) {
        return 'irreversible';
      }
      return 'irreversible';
    }
  }

  for (const p of READ_PATTERNS) {
    if (p.test(name)) return 'read';
  }

  for (const p of WRITE_PATTERNS) {
    if (p.test(name)) {
      const value = typeof args.value === 'number' ? args.value : typeof args.amount === 'number' ? args.amount : undefined;
      const allocatedAmount = typeof args.allocated_amount === 'number' ? args.allocated_amount : undefined;
      const budget = typeof args.budget === 'number' ? args.budget : undefined;
      const num = value ?? allocatedAmount ?? budget;
      if (num !== undefined && num >= valueThreshold) {
        return 'irreversible';
      }
      return 'write';
    }
  }

  // Default: treat unknown tools as read (safer)
  return 'read';
}
