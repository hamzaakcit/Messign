import { query, getClient } from '../../db/index.js';
import { auditService } from './auditService.js';
import { notificationService } from './notificationService.js';

export interface ApprovalChainConfig {
  steps: Array<{
    step_name: string;
    approver_role?: string;
    approver_id?: string;
    ai_recommendation?: string;
    ai_confidence?: number;
  }>;
}

export const approvalService = {
  async createChain(
    entityType: string,
    entityId: string,
    amount: number,
    orgId: string,
    submitterId: string,
  ): Promise<void> {
    const client = await getClient();
    try {
      await client.query('BEGIN');

      const policies = await client.query(
        `SELECT * FROM finance_approval_policies
         WHERE organization_id = $1 AND applies_to = $2 AND is_active = TRUE
         ORDER BY priority DESC`,
        [orgId, entityType],
      );

      const steps: Array<{ name: string; role: string; assignee?: string }> = [];

      if (policies.rows.length > 0) {
        const policy = policies.rows[0];
        const rules = typeof policy.rules === 'string' ? JSON.parse(policy.rules) : policy.rules;

        if (Array.isArray(rules)) {
          for (const rule of rules) {
            const condMatch = rule.condition?.match(/amount\s*([<>=!]+)\s*(\d+)/);
            if (condMatch) {
              const op = condMatch[1];
              const val = parseFloat(condMatch[2]);
              let matched = false;
              if (op === '<' && amount < val) matched = true;
              else if (op === '<=' && amount <= val) matched = true;
              else if (op === '>=' && amount >= val) matched = true;
              else if (op === '>' && amount > val) matched = true;

              if (matched) {
                if (rule.action === 'auto_approve') {
                  return;
                }
                if (rule.action === 'manager_approval') {
                  steps.push({ name: 'Manager Approval', role: 'manager' });
                } else if (rule.action === 'manager_then_finance') {
                  steps.push({ name: 'Manager Approval', role: 'manager' });
                  steps.push({ name: 'Finance Approval', role: 'finance' });
                } else if (rule.action === 'manager_finance_cfo') {
                  steps.push({ name: 'Manager Approval', role: 'manager' });
                  steps.push({ name: 'Finance Approval', role: 'finance' });
                  steps.push({ name: 'CFO Approval', role: 'cfo' });
                }
                break;
              }
            }
          }
        }
      }

      if (steps.length === 0) {
        steps.push({ name: 'Manager Approval', role: 'manager' });
      }

      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];

        let assigneeId: string | null = null;
        if (step.assignee) {
          assigneeId = step.assignee;
        } else if (step.role === 'manager') {
          const mgr = await client.query(
            'SELECT manager_id FROM reimbursement_users WHERE id = $1',
            [submitterId],
          );
          assigneeId = mgr.rows[0]?.manager_id ?? null;
        }

        if (!assigneeId) {
          const roleUser = await client.query(
            `SELECT id FROM reimbursement_users WHERE organization_id = $1 AND role = $2 AND id != $3 LIMIT 1`,
            [orgId, step.role === 'cfo' ? 'admin' : step.role, submitterId],
          );
          assigneeId = roleUser.rows[0]?.id ?? null;
        }

        if (assigneeId) {
          await client.query(
            `INSERT INTO approval_steps
             (reimbursement_id, step_order, step_type, assigned_to, status,
              entity_type, entity_id, step_name, approver_role)
             VALUES ($1, $2, $3, $4, 'pending', $5, $6, $7, $8)`,
            [
              entityId, i + 1, `${step.role}_approval`,
              assigneeId, entityType, entityId,
              step.name, step.role,
            ],
          );
        }
      }

      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  },

  async advanceStep(entityType: string, entityId: string, approverId: string, orgId: string, action: 'approve' | 'reject', notes?: string) {
    const client = await getClient();
    try {
      await client.query('BEGIN');

      const step = await client.query(
        `SELECT * FROM approval_steps
         WHERE entity_type = $1 AND entity_id = $2 AND assigned_to = $3 AND status = 'pending'
         ORDER BY step_order LIMIT 1`,
        [entityType, entityId, approverId],
      );

      if (!step.rows[0]) throw new Error('No pending approval step found');

      await client.query(
        `UPDATE approval_steps SET status = $1, decision_at = NOW(), decision_notes = $2
         WHERE id = $3`,
        [action === 'approve' ? 'approved' : 'rejected', notes ?? null, step.rows[0].id],
      );

      if (action === 'reject') {
        await client.query('COMMIT');
        return { action: 'rejected', final: true };
      }

      const nextStep = await client.query(
        `SELECT * FROM approval_steps
         WHERE entity_type = $1 AND entity_id = $2 AND status = 'pending' AND step_order > $3
         ORDER BY step_order LIMIT 1`,
        [entityType, entityId, step.rows[0].step_order],
      );

      const isFinal = !nextStep.rows[0];
      await client.query('COMMIT');

      if (!isFinal && nextStep.rows[0]?.assigned_to) {
        await notificationService.create({
          organization_id: orgId,
          recipient_id: nextStep.rows[0].assigned_to,
          type: `${entityType}.approval_needed`,
          title: 'Approval Required',
          message: `A ${entityType} requires your approval (step: ${nextStep.rows[0].step_name}).`,
          entity_type: entityType,
          entity_id: entityId,
          priority: 'high',
        });
      }

      return { action: 'approved', final: isFinal, nextStep: nextStep.rows[0] ?? null };
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  },

  async delegate(stepId: string, delegateToId: string, orgId: string, delegatorId: string) {
    const result = await query(
      `UPDATE approval_steps SET delegated_to_id = $1, assigned_to = $1
       WHERE id = $2 AND status = 'pending' RETURNING *`,
      [delegateToId, stepId],
    );

    if (!result.rows[0]) throw new Error('Step not found or already processed');

    await auditService.log({
      organization_id: orgId,
      event_type: 'approval.delegated',
      event_category: 'approval',
      actor_type: 'user',
      actor_id: delegatorId,
      entity_type: 'approval_step',
      entity_id: stepId,
      changes: { delegated_to: delegateToId },
    });

    return result.rows[0];
  },

  async escalate(stepId: string, orgId: string) {
    const step = await query('SELECT * FROM approval_steps WHERE id = $1 AND status = $2', [stepId, 'pending']);
    if (!step.rows[0]) throw new Error('Step not found');

    const admin = await query(
      `SELECT id FROM reimbursement_users WHERE organization_id = $1 AND role = 'admin' LIMIT 1`,
      [orgId],
    );
    if (!admin.rows[0]) throw new Error('No admin found for escalation');

    await query(
      `UPDATE approval_steps SET assigned_to = $1, escalated_at = NOW() WHERE id = $2`,
      [admin.rows[0].id, stepId],
    );

    await notificationService.create({
      organization_id: orgId,
      recipient_id: admin.rows[0].id,
      type: 'approval.escalated',
      title: 'Escalated Approval',
      message: `An approval has been escalated to you and requires immediate attention.`,
      entity_type: step.rows[0].entity_type,
      entity_id: step.rows[0].entity_id,
      priority: 'urgent',
    });

    return { escalated_to: admin.rows[0].id };
  },

  checkSoD(submitterId: string, approverId: string): boolean {
    return submitterId !== approverId;
  },

  async getChain(entityType: string, entityId: string) {
    const result = await query(
      `SELECT a.*, u.full_name as approver_name, d.full_name as delegated_to_name
       FROM approval_steps a
       LEFT JOIN reimbursement_users u ON u.id = a.assigned_to
       LEFT JOIN reimbursement_users d ON d.id = a.delegated_to_id
       WHERE a.entity_type = $1 AND a.entity_id = $2
       ORDER BY a.step_order`,
      [entityType, entityId],
    );
    return result.rows;
  },
};
