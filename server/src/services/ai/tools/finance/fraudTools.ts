import { registerTool } from '../../toolRegistry.js';
import { query } from '../../../../db/index.js';
import type { ToolResult } from '../../types.js';

registerTool({
  name: 'detect_fraud_patterns',
  category: 'finance',
  description: 'Analyze expense patterns for potential fraud indicators including duplicate submissions, unusual amounts, and suspicious timing.',
  parameters: {
    type: 'object',
    properties: {
      user_id: { type: 'string', description: 'Specific user to analyze.' },
      days: { type: 'number', description: 'Number of days to analyze. Default: 90.' },
    },
    required: [],
  },
  requiredRoles: ['admin', 'finance'],
  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const days = (args.days as number) ?? 90;
    const orgResult = await query<{ id: string }>('SELECT id FROM organizations WHERE slug = $1', ['messign']);
    const orgId = orgResult.rows[0]?.id;
    if (!orgId) return { success: false, data: null, summary: 'Organization not found.' };

    const conditions = [`r.organization_id = $1`, `r.is_deleted = FALSE`, `r.expense_date >= NOW() - INTERVAL '${days} days'`];
    const params: unknown[] = [orgId];
    let idx = 2;

    if (args.user_id) {
      conditions.push(`r.submitted_by = $${idx++}`);
      params.push(args.user_id);
    }

    const [duplicateAmounts, weekendHigh, roundNumbers, highRisk] = await Promise.all([
      query(
        `SELECT original_amount, COUNT(*) as count, ARRAY_AGG(id) as expense_ids
         FROM reimbursement_requests r
         WHERE ${conditions.join(' AND ')}
         GROUP BY original_amount HAVING COUNT(*) > 2
         ORDER BY count DESC LIMIT 10`,
        params,
      ),
      query(
        `SELECT id, title, original_amount, expense_date
         FROM reimbursement_requests r
         WHERE ${conditions.join(' AND ')} AND EXTRACT(DOW FROM expense_date) IN (0, 6)
           AND original_amount > 200
         ORDER BY original_amount DESC LIMIT 10`,
        params,
      ),
      query(
        `SELECT id, title, original_amount, expense_date
         FROM reimbursement_requests r
         WHERE ${conditions.join(' AND ')} AND MOD(original_amount::numeric, 100) = 0
           AND original_amount > 500
         ORDER BY original_amount DESC LIMIT 10`,
        params,
      ),
      query(
        `SELECT id, title, original_amount, ai_risk_score, ai_risk_flags
         FROM reimbursement_requests r
         WHERE ${conditions.join(' AND ')} AND COALESCE(ai_risk_score, 0) >= 0.7
         ORDER BY ai_risk_score DESC LIMIT 10`,
        params,
      ),
    ]);

    const flags: string[] = [];
    if (duplicateAmounts.rows.length > 0) flags.push(`${duplicateAmounts.rows.length} amounts appear 3+ times (possible duplicates)`);
    if (weekendHigh.rows.length > 0) flags.push(`${weekendHigh.rows.length} high-value weekend expenses`);
    if (roundNumbers.rows.length > 0) flags.push(`${roundNumbers.rows.length} suspiciously round amounts over $500`);
    if (highRisk.rows.length > 0) flags.push(`${highRisk.rows.length} AI-flagged high-risk expenses`);

    return {
      success: true,
      data: {
        duplicate_amounts: duplicateAmounts.rows,
        weekend_high_value: weekendHigh.rows,
        round_numbers: roundNumbers.rows,
        high_risk: highRisk.rows,
        flags,
      },
      summary: flags.length > 0
        ? `Fraud analysis (${days} days): ${flags.join('. ')}.`
        : `No significant fraud patterns detected in the last ${days} days.`,
      metadata: { source: 'reimbursement_requests', count: flags.length },
    };
  },
});
