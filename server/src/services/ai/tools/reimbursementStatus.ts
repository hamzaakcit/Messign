/**
 * Tool: get_reimbursement_details
 *
 * Individual reimbursement claims — status, amount, category.
 * Adapted for Messign: reimbursement_requests (submitted_by UUID).
 */

import { query } from '../../../db/index.js';
import { registerTool } from '../toolRegistry.js';
import { limitRecords } from '../dataSanitizer.js';
import type { Tool, ToolContext, ToolResult } from '../types.js';
import { resolveOrgIdForTool } from './resolveOrgIdForTool.js';

const reimbursementDetailsTool: Tool = {
  name: 'finance:get_reimbursement_details',
  metadata: {
    namespace: 'finance',
    name: 'get_reimbursement_details',
    summary: 'Reimbursement/expense details: status, amount, category, receipts.',
    tags: ['finance', 'reimbursement', 'expense'],
    alwaysLoaded: false,
    parameterHints: 'user_identifier: string, status_filter?: all|pending|approved|rejected|paid|draft|submitted',
  },
  category: 'finance',

  description: `Get detailed reimbursement records for a user — individual claims with status, amount, category, and dates.

Use this tool when someone asks:
- "What's the status of my reimbursement?"
- "Show my pending reimbursements"
- "How much am I owed?"
- "Reimbursement history" or "My expense claims"
- "[Name]'s reimbursements" (managers/admins only)
- "Which reimbursements are pending approval?"`,

  parameters: {
    type: 'object',
    properties: {
      user_identifier: {
        type: 'string',
        description: 'Name/username or "me" for own reimbursements. "pending_approval" for items you need to approve.',
      },
      status_filter: {
        type: 'string',
        description: 'Filter by status.',
        enum: ['all', 'pending', 'approved', 'rejected', 'paid', 'draft', 'submitted'],
      },
    },
    required: ['user_identifier'],
  },

  async execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    const userIdentifier = (args.user_identifier as string) || '';
    const statusFilter = (args.status_filter as string) || 'all';
    const identifier = userIdentifier.toLowerCase().trim();

    const orgId = await resolveOrgIdForTool(context);
    if (!orgId) {
      return { success: false, data: null, summary: 'Organization not configured.' };
    }

    if (['pending_approval', 'needs_my_approval', 'approve'].includes(identifier)) {
      if (!['admin', 'manager', 'cpo', 'finance'].includes(context.userRole)) {
        return { success: false, data: null, summary: 'You do not have approval permissions.' };
      }

      const userResult = await query<{ id: string }>(
        `SELECT id FROM reimbursement_users WHERE auth_user_id = $1 AND organization_id = $2 LIMIT 1`,
        [context.userId, orgId]
      );
      const userReimbursementId = userResult.rows[0]?.id;

      let pendingQuery: string;
      const pendingParams: unknown[] = [orgId];
      if (context.userRole === 'admin' || context.userRole === 'finance') {
        pendingQuery = `
          SELECT r.id, r.title, r.converted_amount as amount, r.original_amount, r.original_currency, r.status, r.created_at, u.full_name as submitter_name
          FROM reimbursement_requests r
          JOIN reimbursement_users u ON u.id = r.submitted_by
          JOIN approval_steps a ON a.reimbursement_id = r.id
          WHERE r.organization_id = $1 AND r.status = 'submitted' AND a.status = 'pending'
          ORDER BY r.created_at ASC
          LIMIT 20
        `;
      } else if (userReimbursementId) {
        pendingQuery = `
          SELECT r.id, r.title, r.converted_amount as amount, r.original_amount, r.original_currency, r.status, r.created_at, u.full_name as submitter_name
          FROM reimbursement_requests r
          JOIN reimbursement_users u ON u.id = r.submitted_by
          JOIN approval_steps a ON a.reimbursement_id = r.id
          WHERE r.organization_id = $1 AND r.status = 'submitted' AND a.status = 'pending'
            AND (a.assigned_to = $2 OR a.step_type = 'manager_approval')
          ORDER BY r.created_at ASC
          LIMIT 20
        `;
        pendingParams.push(userReimbursementId);
      } else {
        return { success: true, data: [], summary: 'No pending reimbursements for approval.' };
      }

      const pendingResult = await query(pendingQuery, pendingParams);
      const records = pendingResult.rows as Record<string, unknown>[];
      const totalPending = records.reduce((sum: number, r) => sum + parseFloat(String(r.amount ?? r.original_amount ?? 0)), 0);

      return {
        success: true,
        data: records,
        summary: `**Pending Reimbursements for Approval (${records.length} claims, $${totalPending.toFixed(2)} total):**\n${records
          .map(
            (r, i) =>
              `${i + 1}. ${r.submitter_name}: $${parseFloat(String(r.amount ?? r.original_amount ?? 0)).toFixed(2)} — ${r.title || 'Untitled'} (submitted ${new Date(r.created_at as string).toLocaleDateString()})`
          )
          .join('\n')}`,
        metadata: { source: 'reimbursement_requests, approval_steps', count: records.length },
      };
    }

    let targetReimbursementId: string;
    if (['me', 'my', 'myself'].includes(identifier)) {
      const userRes = await query<{ id: string }>(
        `SELECT id FROM reimbursement_users WHERE auth_user_id = $1 AND organization_id = $2 LIMIT 1`,
        [context.userId, orgId]
      );
      if (userRes.rows.length === 0) {
        return { success: false, data: null, summary: 'User not found.' };
      }
      targetReimbursementId = userRes.rows[0].id;
    } else {
      if (!['admin', 'manager', 'cpo', 'finance'].includes(context.userRole)) {
        return { success: false, data: null, summary: 'You can only view your own reimbursements.' };
      }
      const userSearch = await query<{ id: string }>(
        `SELECT id FROM reimbursement_users
         WHERE organization_id = $1 AND (LOWER(full_name) LIKE LOWER($2) OR LOWER(email) LIKE LOWER($2))
         LIMIT 1`,
        [orgId, `%${identifier}%`]
      );
      if (userSearch.rows.length === 0) {
        return { success: false, data: null, summary: `No user found: "${userIdentifier}".` };
      }
      targetReimbursementId = userSearch.rows[0].id;
    }

    const statusCond = statusFilter !== 'all' ? `AND r.status = $2` : '';
    const params: unknown[] = [targetReimbursementId];
    if (statusFilter !== 'all') params.push(statusFilter);

    const result = await query(
      `SELECT r.id, r.title, r.converted_amount as amount, r.original_amount, r.original_currency, r.status, r.created_at, r.updated_at
       FROM reimbursement_requests r
       WHERE r.submitted_by = $1 ${statusCond}
       ORDER BY r.created_at DESC
       LIMIT 30`,
      params
    );

    const records = limitRecords(result.rows as Record<string, unknown>[], 30);
    const totalAmount = records.reduce((sum: number, r) => sum + parseFloat(String(r.amount ?? r.original_amount ?? 0)), 0);

    const summary = `**Reimbursements (${statusFilter}) — ${records.length} records, $${totalAmount.toFixed(2)} total:**\n${records
      .slice(0, 15)
      .map(
        (r, i) =>
          `${i + 1}. [${r.status}] ${r.title || 'Untitled'}: $${parseFloat(String(r.amount ?? r.original_amount ?? 0)).toFixed(2)} (${new Date(r.created_at as string).toLocaleDateString()})`
      )
      .join('\n')}${records.length > 15 ? `\n... and ${records.length - 15} more` : ''}`;

    return {
      success: true,
      data: records,
      summary,
      metadata: { source: 'reimbursement_requests', count: records.length },
    };
  },
};

registerTool(reimbursementDetailsTool);
export default reimbursementDetailsTool;
