/**
 * HITL Approval Flow — Risk-Based Human-in-the-Loop
 *
 * High-risk actions queue for human approval via BullMQ.
 * Socket.io notifies the user; approve/reject via API.
 */
import { Queue } from 'bullmq';
import type { ConnectionOptions } from 'bullmq';
import { redisConnection } from '../../../queue/connection.js';
import { emitToUser } from '../../../sockets/index.js';
import { executeTool } from '../toolRegistry.js';
import { logAuditEvent } from '../../../platform/audit.js';
import type { ActionApproval, AgentContext } from './types.js';

const connection = redisConnection as unknown as ConnectionOptions;

export const approvalQueue = new Queue('dora-approvals', {
  connection,
  defaultJobOptions: {
    attempts: 1,
    removeOnComplete: { count: 500 },
    removeOnFail: { count: 200 },
  },
});

/** In production, use Redis or DB for persistence across restarts */
const pendingApprovals = new Map<
  string,
  { approval: ActionApproval; context: AgentContext }
>();

function buildToolContext(context: AgentContext) {
  return {
    userId: context.userId,
    userRole: context.userRoles[0] ?? 'employee',
    organizationId: context.tenantId,
  };
}

/**
 * Request human approval for a high-risk action.
 * Notifies user via Socket.io, enqueues for persistence, stores pending.
 */
export async function requestApproval(
  approval: ActionApproval,
  context: AgentContext,
): Promise<string> {
  const approvalId = crypto.randomUUID();

  pendingApprovals.set(approvalId, { approval, context });

  emitToUser(context.userId, 'dora:approval_required', {
    approvalId,
    actionType: approval.actionType,
    riskLevel: approval.riskLevel,
    description: approval.description,
    payload: approval.payload,
    expiresAt: approval.expiresAt instanceof Date ? approval.expiresAt.toISOString() : String(approval.expiresAt),
  });

  await approvalQueue.add(
    'pending_approval',
    {
      approvalId,
      approval,
      context: {
        tenantId: context.tenantId,
        userId: context.userId,
        userRoles: context.userRoles,
      },
    },
    {
      delay: 30 * 60 * 1000, // auto-expire after 30 minutes
      removeOnComplete: true,
    },
  );

  return `I need your approval to proceed. I want to execute **${approval.actionType}** with these parameters:\n\n\`\`\`json\n${JSON.stringify(approval.payload, null, 2)}\n\`\`\`\n\nPlease approve or reject this action in the notification panel.`;
}

/**
 * Handle approve/reject decision from the API.
 * Called by POST /api/dora/approvals/:approvalId/decide
 */
export async function handleApprovalDecision(
  approvalId: string,
  approved: boolean,
  userId: string,
): Promise<{ success: boolean; result?: unknown }> {
  const pending = pendingApprovals.get(approvalId);
  if (!pending) {
    return { success: false };
  }

  if (approved) {
    const toolCtx = buildToolContext(pending.context);
    const result = await executeTool(
      pending.approval.actionType,
      pending.approval.payload,
      toolCtx,
    );

    logAuditEvent({
      tenantId: pending.context.tenantId,
      userId,
      action: 'ai.approval.approved',
      resourceType: pending.approval.actionType,
      resourceId: approvalId,
      details: {
        approvalId,
        actionType: pending.approval.actionType,
        success: result.success,
      },
    });

    emitToUser(userId, 'dora:action_completed', {
      approvalId,
      actionType: pending.approval.actionType,
      result,
    });

    pendingApprovals.delete(approvalId);
    return { success: true, result };
  }

  logAuditEvent({
    tenantId: pending.context.tenantId,
    userId,
    action: 'ai.approval.rejected',
    resourceType: pending.approval.actionType,
    resourceId: approvalId,
    details: { approvalId, actionType: pending.approval.actionType },
  });

  emitToUser(userId, 'dora:action_rejected', { approvalId });
  pendingApprovals.delete(approvalId);
  return { success: true };
}
