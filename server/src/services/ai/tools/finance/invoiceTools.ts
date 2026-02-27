import { registerTool } from '../../toolRegistry.js';
import { query } from '../../../../db/index.js';
import type { ToolContext, ToolResult } from '../../types.js';

registerTool({
  name: 'invoice_status',
  category: 'finance',
  description: 'Get status of invoices including outstanding amounts, overdue invoices, and payment history.',
  parameters: {
    type: 'object',
    properties: {
      status: { type: 'string', description: 'Filter by status: draft, sent, partially_paid, paid, overdue, voided.', enum: ['draft', 'sent', 'partially_paid', 'paid', 'overdue', 'voided'] },
      client_name: { type: 'string', description: 'Filter by client name.' },
    },
    required: [],
  },
  async execute(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    const orgResult = await query<{ id: string }>('SELECT id FROM organizations WHERE slug = $1', ['messign']);
    const orgId = orgResult.rows[0]?.id;
    if (!orgId) return { success: false, data: null, summary: 'Organization not found.' };

    const conditions = ['(organization_id = $1 OR organization_id IS NULL)', '(is_deleted IS NULL OR is_deleted = FALSE)'];
    const params: unknown[] = [orgId];
    let idx = 2;

    if (args.status) {
      conditions.push(`status = $${idx++}`);
      params.push(args.status);
    }
    if (args.client_name) {
      conditions.push(`to_name ILIKE $${idx++}`);
      params.push(`%${args.client_name}%`);
    }

    const result = await query(
      `SELECT id, invoice_number, to_name, status, grand_total, total_amount, amount_paid,
              currency, sent_at, created_at
       FROM invoices
       WHERE ${conditions.join(' AND ')}
       ORDER BY created_at DESC LIMIT 20`,
      params,
    );

    const invoices = result.rows;
    const summary = invoices.length > 0
      ? `Found ${invoices.length} invoices:\n${invoices.map((i) => {
          const total = parseFloat(i.grand_total || i.total_amount || '0');
          const paid = parseFloat(i.amount_paid || '0');
          return `${i.invoice_number ?? i.id.substring(0, 8)}: ${i.to_name ?? 'N/A'} — $${total.toLocaleString()} (${i.status}), paid: $${paid.toLocaleString()}`;
        }).join('\n')}`
      : 'No invoices found matching criteria.';

    return { success: true, data: invoices, summary, metadata: { source: 'invoices', count: invoices.length } };
  },
});
