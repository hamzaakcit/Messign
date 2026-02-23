/**
 * Tool: get_invoice_details
 *
 * Look up invoices — status, amounts, due dates.
 * Adapted for Messign: invoices (employee_id UUID), parameterized queries only.
 */

import { query } from '../../../db/index.js';
import { registerTool } from '../toolRegistry.js';
import { limitRecords } from '../dataSanitizer.js';
import type { Tool, ToolContext, ToolResult } from '../types.js';

const invoiceDetailsTool: Tool = {
  name: 'get_invoice_details',
  category: 'finance',

  description: `Look up specific invoices — status, amounts, client/vendor info, due dates.

Use this tool when someone asks:
- "Show me invoice #123" or "Invoice details"
- "Outstanding invoices" or "Unpaid invoices"
- "Invoices from [client/vendor]"
- "Invoice due dates" or "Overdue invoices"`,

  parameters: {
    type: 'object',
    properties: {
      search_term: {
        type: 'string',
        description: 'Invoice number, client name, or "all" for recent invoices. "overdue" for past-due.',
      },
      status_filter: {
        type: 'string',
        description: 'Filter by status.',
        enum: ['all', 'paid', 'pending', 'overdue', 'cancelled', 'draft', 'signed', 'finalized', 'revision'],
      },
    },
    required: ['search_term'],
  },

  requiredRoles: ['admin', 'manager', 'cpo', 'finance'],

  async execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    const searchTerm = (args.search_term as string) || '';
    const statusFilter = (args.status_filter as string) || 'all';
    const term = searchTerm.toLowerCase().trim();

    try {
      let baseQuery: string;
      const params: unknown[] = [];
      let paramIdx = 1;

      if (term === 'overdue') {
        baseQuery = `SELECT i.*, ru.full_name as employee_name
          FROM invoices i
          JOIN reimbursement_users ru ON ru.id = i.employee_id
          WHERE i.due_date < NOW() AND i.status NOT IN ('finalized', 'signed', 'cancelled')`;
      } else if (term === 'all' || term === 'recent') {
        baseQuery = `SELECT i.*, ru.full_name as employee_name
          FROM invoices i
          JOIN reimbursement_users ru ON ru.id = i.employee_id`;
      } else {
        baseQuery = `SELECT i.*, ru.full_name as employee_name
          FROM invoices i
          JOIN reimbursement_users ru ON ru.id = i.employee_id
          WHERE LOWER(i.invoice_number::text) LIKE LOWER($1)
             OR LOWER(ru.full_name) LIKE LOWER($1)`;
        params.push(`%${term}%`);
        paramIdx = 2;
      }

      if (statusFilter !== 'all') {
        const statusCond = baseQuery.includes('WHERE') ? ` AND i.status = $${paramIdx}` : ` WHERE i.status = $${paramIdx}`;
        baseQuery += statusCond;
        params.push(statusFilter);
        paramIdx++;
      }

      const orderBy = term === 'overdue' ? 'ORDER BY i.due_date ASC' : 'ORDER BY i.created_at DESC';
      const limit = term === 'overdue' || term === 'all' || term === 'recent' ? 20 : 10;
      const invoiceQuery = `${baseQuery} ${orderBy} LIMIT ${limit}`;

      const result = await query(invoiceQuery, params.length > 0 ? params : undefined);
      const invoices = limitRecords(result.rows as Record<string, unknown>[], 20);

      if (invoices.length === 0) {
        return { success: true, data: [], summary: `No invoices found matching "${searchTerm}".` };
      }

      const total = invoices.reduce((sum: number, inv) => sum + parseFloat(String(inv.grand_total ?? inv.total_expenses ?? 0)), 0);

      const summary = `**Invoices (${invoices.length} found, $${total.toFixed(2)} total):**\n${invoices
        .map(
          (inv, i) =>
            `${i + 1}. [${inv.status}] #${inv.invoice_number || inv.id}: $${parseFloat(String(inv.grand_total ?? 0)).toFixed(2)} — ${inv.employee_name || 'N/A'} (due: ${inv.due_date ? new Date(inv.due_date as string).toLocaleDateString() : 'N/A'})`
        )
        .join('\n')}`;

      return {
        success: true,
        data: invoices,
        summary,
        metadata: { source: 'invoices', count: invoices.length },
      };
    } catch (err) {
      return {
        success: false,
        data: null,
        summary: `Invoice lookup failed: ${(err as Error).message}. Your system may not have an invoices table.`,
      };
    }
  },
};

registerTool(invoiceDetailsTool);
export default invoiceDetailsTool;
