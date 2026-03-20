/**
 * Tool: get_approval_queue
 *
 * Cross-domain: pending approvals from reimbursements, knowledge docs, invoices.
 * Adapted for Messign: reimbursement_requests, approval_steps, knowledge_documents.
 */

import { query } from '../../../db/index.js';
import { registerTool } from '../toolRegistry.js';
import type { Tool, ToolContext, ToolResult } from '../types.js';
import { resolveOrgIdForTool } from './resolveOrgIdForTool.js';

const approvalQueueTool: Tool = {
  name: 'analytics:get_approval_queue',
  category: 'system',

  metadata: {
    namespace: 'analytics',
    name: 'get_approval_queue',
    summary: 'Pending approvals: reimbursements, documents, invoices needing user review.',
    tags: ['analytics', 'approvals', 'pending', 'review'],
    alwaysLoaded: false,
    parameterHints: 'domain?: all|reimbursements|documents|invoices',
  },

  description: `Get all pending items that need the user's approval — reimbursements, knowledge documents, and other approvable items across the system.

Use this tool when someone asks:
- "What needs my approval?"
- "Pending approvals" or "Approval queue"
- "Anything waiting for me?"
- "What's in my review queue?"
- "Do I have anything to approve?"`,

  parameters: {
    type: 'object',
    properties: {
      domain: {
        type: 'string',
        description: '"all" for everything, or filter by domain.',
        enum: ['all', 'reimbursements', 'documents', 'invoices'],
      },
    },
    required: [],
  },

  requiredRoles: ['admin', 'manager', 'cpo', 'finance', 'reviewer'],

  async execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    const domain = (args.domain as string) || 'all';
    const approvals: { type: string; id: string; title: string; detail: string; date: string }[] = [];

    const orgId = await resolveOrgIdForTool(context);
    if (!orgId) {
      return { success: false, data: null, summary: 'Organization not configured.' };
    }

    const userResult = await query<{ id: string }>(
      `SELECT id FROM reimbursement_users WHERE auth_user_id = $1 AND organization_id = $2 LIMIT 1`,
      [context.userId, orgId]
    );
    const userReimbursementId = userResult.rows[0]?.id;

    if (['all', 'reimbursements'].includes(domain)) {
      try {
        let reimbQuery: string;
        const reimbParams: unknown[] = [orgId];
        if (context.userRole === 'admin' || context.userRole === 'finance') {
          reimbQuery = `
            SELECT r.id, r.title, r.converted_amount, r.original_amount, r.original_currency, r.created_at, u.full_name as submitter
            FROM reimbursement_requests r
            JOIN reimbursement_users u ON u.id = r.submitted_by
            JOIN approval_steps a ON a.reimbursement_id = r.id
            WHERE r.organization_id = $1 AND r.status = 'submitted' AND a.status = 'pending'
            ORDER BY r.created_at ASC
            LIMIT 10
          `;
        } else if (userReimbursementId && (context.userRole === 'manager' || context.userRole === 'cpo')) {
          reimbQuery = `
            SELECT r.id, r.title, r.converted_amount, r.original_amount, r.original_currency, r.created_at, u.full_name as submitter
            FROM reimbursement_requests r
            JOIN reimbursement_users u ON u.id = r.submitted_by
            JOIN approval_steps a ON a.reimbursement_id = r.id
            WHERE r.organization_id = $1 AND r.status = 'submitted' AND a.status = 'pending'
              AND (a.assigned_to = $2 OR a.step_type = 'manager_approval')
            ORDER BY r.created_at ASC
            LIMIT 10
          `;
          reimbParams.push(userReimbursementId);
        } else {
          reimbQuery = `
            SELECT r.id, r.title, r.converted_amount, r.original_amount, r.original_currency, r.created_at, u.full_name as submitter
            FROM reimbursement_requests r
            JOIN reimbursement_users u ON u.id = r.submitted_by
            JOIN approval_steps a ON a.reimbursement_id = r.id
            WHERE r.organization_id = $1 AND r.status = 'submitted' AND a.status = 'pending' AND a.assigned_to = $2
            ORDER BY r.created_at ASC
            LIMIT 10
          `;
          reimbParams.push(userReimbursementId);
        }

        const reimbResult = await query(reimbQuery, reimbParams);
        for (const r of reimbResult.rows as Record<string, unknown>[]) {
          const amount = parseFloat(String(r.converted_amount ?? r.original_amount ?? 0));
          const currency = (r.original_currency as string) || 'USD';
          approvals.push({
            type: 'reimbursement',
            id: r.id as string,
            title: (r.title as string) || 'Reimbursement',
            detail: `${amount.toFixed(2)} ${currency} from ${r.submitter}`,
            date: r.created_at as string,
          });
        }
      } catch {
        /* table may not exist */
      }
    }

    if (['all', 'documents'].includes(domain)) {
      try {
        const docResult = await query(
          `SELECT kd.id, kd.title, kd.author_id, kd.created_at
           FROM knowledge_documents kd
           WHERE kd.status = 'in_review'
           ORDER BY kd.created_at ASC
           LIMIT 10`
        );
        for (const d of docResult.rows as Record<string, unknown>[]) {
          const authorId = d.author_id as string;
          const authorRes = authorId
            ? await query<{ full_name: string }>(
                `SELECT full_name FROM reimbursement_users WHERE auth_user_id = $1 LIMIT 1`,
                [authorId]
              ).catch(() => ({ rows: [] }))
            : { rows: [] };
          const author = authorRes.rows[0]?.full_name || 'Unknown';
          approvals.push({
            type: 'document',
            id: d.id as string,
            title: d.title as string,
            detail: `by ${author}`,
            date: d.created_at as string,
          });
        }
      } catch {
        /* skip */
      }
    }

    if (['all', 'invoices'].includes(domain)) {
      try {
        const invResult = await query(
          `SELECT i.id, i.invoice_number, i.grand_total, i.created_at
           FROM invoices i
           WHERE i.status IN ('draft', 'revision')
           ORDER BY i.created_at ASC
           LIMIT 10`
        );
        for (const inv of invResult.rows as Record<string, unknown>[]) {
          approvals.push({
            type: 'invoice',
            id: inv.id as string,
            title: `Invoice #${inv.invoice_number || inv.id}`,
            detail: `${parseFloat(String(inv.grand_total ?? 0)).toFixed(2)}`,
            date: inv.created_at as string,
          });
        }
      } catch {
        /* skip */
      }
    }

    approvals.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    if (approvals.length === 0) {
      return { success: true, data: [], summary: "No pending approvals! You're all caught up." };
    }

    const summary = `**Pending Approvals (${approvals.length} items):**\n${approvals
      .map((a, i) => `${i + 1}. [${a.type}] ${a.title} — ${a.detail} (${new Date(a.date).toLocaleDateString()})`)
      .join('\n')}`;

    return {
      success: true,
      data: approvals,
      summary,
      metadata: { source: 'reimbursement_requests, knowledge_documents, invoices', count: approvals.length },
    };
  },
};

registerTool(approvalQueueTool);
export default approvalQueueTool;
