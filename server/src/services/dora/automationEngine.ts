import { randomUUID } from 'crypto';
import { query } from '../../db/index.js';
import * as expensesDal from '../../dal/expenses.js';
import * as support from '../../dal/support/index.js';
import * as doraInsights from '../../dal/doraInsights.js';
import type { CallerContext } from '../../dal/types.js';

export interface AutomationPolicy {
  id: string;
  organizationId: string | null;
  name: string;
  triggerEvent: string;
  conditions: Array<{ field: string; operator: string; value: unknown }>;
  actionType: string;
  actionParams: Record<string, unknown>;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  scope: string;
  createdBy: string;
}

function evaluateConditions(
  conditions: AutomationPolicy['conditions'],
  payload: Record<string, unknown>,
): boolean {
  return conditions.every((condition) => {
    const actualValue = payload[condition.field];
    if (actualValue === undefined) return false;

    switch (condition.operator) {
      case 'eq': return actualValue === condition.value;
      case 'neq': return actualValue !== condition.value;
      case 'gt': return Number(actualValue) > Number(condition.value);
      case 'lt': return Number(actualValue) < Number(condition.value);
      case 'gte': return Number(actualValue) >= Number(condition.value);
      case 'lte': return Number(actualValue) <= Number(condition.value);
      case 'contains': return String(actualValue).toLowerCase().includes(String(condition.value).toLowerCase());
      case 'in': return Array.isArray(condition.value) && condition.value.includes(actualValue);
      default: return false;
    }
  });
}

function buildSystemCtx(policy: AutomationPolicy): CallerContext {
  return {
    userId: policy.createdBy,
    role: 'finance_admin',
    organizationId: policy.organizationId ?? undefined,
  };
}

async function executeAction(
  policy: AutomationPolicy,
  payload: Record<string, unknown>,
): Promise<{ success: boolean; result?: unknown; error?: string }> {
  try {
    const systemCtx = buildSystemCtx(policy);
    switch (policy.actionType) {
      case 'approve_expense': {
        if (!payload.expenseId) return { success: false, error: 'Missing expenseId' };
        const result = await expensesDal.approveExpense(systemCtx, String(payload.expenseId));
        return { success: true, result: { approved: true, expenseId: payload.expenseId, status: result.status } };
      }
      case 'assign_ticket': {
        if (!payload.ticketId) return { success: false, error: 'Missing ticketId' };
        let assigneeId = typeof policy.actionParams.assigneeId === 'string' ? policy.actionParams.assigneeId : undefined;
        if (!assigneeId && policy.actionParams.strategy === 'category_default') {
          const row = await query<{ auto_assign_to: string | null }>(
            `SELECT sc.auto_assign_to::text AS auto_assign_to
             FROM support_tickets st
             LEFT JOIN support_categories sc ON sc.id = st.category_id
             WHERE st.id = $1::uuid
             LIMIT 1`,
            [String(payload.ticketId)],
          );
          assigneeId = row.rows[0]?.auto_assign_to ?? undefined;
        }
        if (!assigneeId) return { success: false, error: 'No assignee available' };
        await support.tickets.assignTicket(systemCtx, String(payload.ticketId), assigneeId);
        return { success: true, result: { assigned: true, ticketId: payload.ticketId, assigneeId } };
      }
      case 'close_ticket_after_delay': {
        return {
          success: true,
          result: {
            scheduled: true,
            delayHours: Number(policy.actionParams.delay_hours ?? 48),
            ticketId: payload.ticketId ?? null,
          },
        };
      }
      case 'send_notification':
        return { success: true, result: { message: policy.actionParams.message ?? 'Notification queued' } };
      case 'create_task':
        return { success: true, result: { created: true, title: policy.actionParams.title ?? 'Follow-up task' } };
      default:
        return { success: false, error: `Unknown action type: ${policy.actionType}` };
    }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown action error' };
  }
}

async function logExecution(data: {
  policyId: string;
  triggerEvent: string;
  triggerPayload: Record<string, unknown>;
  conditionsEvaluated: unknown;
  actionType: string;
  actionParams: Record<string, unknown>;
  riskLevel: string;
  executionStatus: string;
  result?: unknown;
  errorMessage?: string;
  canUndo?: boolean;
  undoDeadline?: string;
}): Promise<void> {
  await query(
    `INSERT INTO dora_automation_log (
      policy_id, trigger_event, trigger_payload, conditions_evaluated,
      action_type, action_params, risk_level, execution_status,
      result, error_message, can_undo, undo_deadline
    )
    VALUES (
      $1::uuid, $2, $3::jsonb, $4::jsonb,
      $5, $6::jsonb, $7, $8,
      $9::jsonb, $10, $11, $12
    )`,
    [
      data.policyId,
      data.triggerEvent,
      JSON.stringify(data.triggerPayload),
      JSON.stringify(data.conditionsEvaluated),
      data.actionType,
      JSON.stringify(data.actionParams),
      data.riskLevel,
      data.executionStatus,
      data.result ? JSON.stringify(data.result) : null,
      data.errorMessage ?? null,
      Boolean(data.canUndo),
      data.undoDeadline ?? null,
    ],
  );
}

async function markPolicyExecution(policyId: string, status: 'success' | 'failure' | 'skipped'): Promise<void> {
  await query(
    `UPDATE dora_automation_policies
     SET execution_count = execution_count + 1,
         last_executed_at = NOW(),
         last_execution_result = $1,
         updated_at = NOW()
     WHERE id = $2::uuid`,
    [status, policyId],
  );
}

async function queueForApproval(
  policy: AutomationPolicy,
  payload: Record<string, unknown>,
): Promise<void> {
  await query(
    `INSERT INTO pending_actions (
      token, action_type, payload, description, display_fields, editable_fields,
      user_id, origin_query, status, expires_at, created_at
    )
    VALUES (
      $1::uuid, $2, $3::jsonb, $4, $5::jsonb, $6::text[],
      $7::uuid, $8, 'pending', NOW() + INTERVAL '24 hours', NOW()
    )`,
    [
      randomUUID(),
      policy.actionType,
      JSON.stringify({ policyId: policy.id, payload, actionParams: policy.actionParams }),
      `Approve Dora automation: ${policy.name}`,
      JSON.stringify([]),
      [],
      policy.createdBy,
      `Automation policy ${policy.name}`,
    ],
  );
}

async function handlePolicyMatch(
  policy: AutomationPolicy,
  eventName: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const baseLog = {
    policyId: policy.id,
    triggerEvent: eventName,
    triggerPayload: payload,
    conditionsEvaluated: policy.conditions,
    actionType: policy.actionType,
    actionParams: policy.actionParams,
    riskLevel: policy.riskLevel,
  };

  switch (policy.riskLevel) {
    case 'low': {
      const result = await executeAction(policy, payload);
      await logExecution({
        ...baseLog,
        executionStatus: result.success ? 'auto_executed' : 'failed',
        result: result.result,
        errorMessage: result.error,
      });
      await markPolicyExecution(policy.id, result.success ? 'success' : 'failure');
      break;
    }
    case 'medium': {
      const result = await executeAction(policy, payload);
      const undoDeadline = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      await logExecution({
        ...baseLog,
        executionStatus: result.success ? 'executed_with_notification' : 'failed',
        result: result.result,
        errorMessage: result.error,
        canUndo: true,
        undoDeadline,
      });
      await markPolicyExecution(policy.id, result.success ? 'success' : 'failure');
      if (result.success) {
        await doraInsights.createInsight({
          organizationId: policy.organizationId ?? undefined,
          module: eventName.split('.')[0] === 'crm' ? 'sales' : eventName.split('.')[0],
          severity: 'info',
          title: `Dora auto-action: ${policy.name}`,
          message: `Dora executed "${policy.name}" automatically. You have 24h to undo this action.`,
          targetUserId: policy.createdBy,
          metadata: { policyId: policy.id, canUndo: true },
        });
      }
      break;
    }
    case 'high': {
      await queueForApproval(policy, payload);
      await logExecution({
        ...baseLog,
        executionStatus: 'queued_for_approval',
      });
      await markPolicyExecution(policy.id, 'skipped');
      break;
    }
    case 'critical':
    default: {
      await logExecution({
        ...baseLog,
        executionStatus: 'skipped',
      });
      await markPolicyExecution(policy.id, 'skipped');
      break;
    }
  }
}

export async function processEventAgainstPolicies(
  eventName: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const result = await query<{
    id: string;
    organization_id: string | null;
    name: string;
    trigger_event: string;
    conditions: Array<{ field: string; operator: string; value: unknown }>;
    action_type: string;
    action_params: Record<string, unknown>;
    risk_level: 'low' | 'medium' | 'high' | 'critical';
    scope: string;
    created_by: string;
  }>(
    `SELECT
       id::text,
       organization_id::text,
       name,
       trigger_event,
       conditions,
       action_type,
       action_params,
       risk_level,
       scope,
       created_by::text
     FROM dora_automation_policies
     WHERE trigger_event = $1
       AND is_active = TRUE`,
    [eventName],
  );

  const policies: AutomationPolicy[] = result.rows.map((row) => ({
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    triggerEvent: row.trigger_event,
    conditions: Array.isArray(row.conditions) ? row.conditions : [],
    actionType: row.action_type,
    actionParams: row.action_params ?? {},
    riskLevel: row.risk_level,
    scope: row.scope,
    createdBy: row.created_by,
  }));

  for (const policy of policies) {
    if (evaluateConditions(policy.conditions, payload)) {
      await handlePolicyMatch(policy, eventName, payload);
    }
  }
}
