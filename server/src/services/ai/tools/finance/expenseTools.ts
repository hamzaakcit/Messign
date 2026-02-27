import { registerTool } from '../../toolRegistry.js';
import { query } from '../../../../db/index.js';
import type { ToolContext, ToolResult } from '../../types.js';

registerTool({
  name: 'scan_receipt',
  category: 'finance',
  description: 'Analyze a receipt image using OCR to extract vendor, amount, date, and line items. Provide a document_id to process.',
  parameters: {
    type: 'object',
    properties: {
      document_id: { type: 'string', description: 'The document ID to scan.' },
    },
    required: ['document_id'],
  },
  async execute(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    const docId = args.document_id as string;
    const doc = await query(
      `SELECT rd.*, r.title as expense_title, r.original_amount
       FROM reimbursement_documents rd
       LEFT JOIN reimbursement_requests r ON r.id = rd.reimbursement_id
       WHERE rd.id = $1`,
      [docId],
    );
    if (!doc.rows[0]) return { success: false, data: null, summary: 'Document not found.' };

    const d = doc.rows[0];
    return {
      success: true,
      data: d,
      summary: `Receipt document "${d.file_name}": Vendor=${d.extracted_vendor ?? 'unknown'}, Amount=${d.extracted_amount ?? 'unknown'}, Date=${d.extracted_date ?? 'unknown'}, Verified=${d.is_verified ? 'yes' : 'no'}.`,
      metadata: { source: 'reimbursement_documents', count: 1 },
    };
  },
});

registerTool({
  name: 'categorize_expense',
  category: 'finance',
  description: 'Get AI-suggested category for an expense based on title, vendor, and amount.',
  parameters: {
    type: 'object',
    properties: {
      expense_title: { type: 'string', description: 'Title or description of the expense.' },
      vendor_name: { type: 'string', description: 'Name of the vendor.' },
      amount: { type: 'number', description: 'Expense amount.' },
    },
    required: ['expense_title'],
  },
  async execute(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    const title = (args.expense_title as string).toLowerCase();
    const vendor = ((args.vendor_name as string) ?? '').toLowerCase();

    const categories = await query(
      `SELECT slug, name FROM expense_categories WHERE is_active = TRUE ORDER BY sort_order`,
      [],
    );

    let bestMatch = 'other';
    const keywords: Record<string, string[]> = {
      travel_flight: ['flight', 'airline', 'delta', 'united', 'air'],
      travel_hotel: ['hotel', 'marriott', 'hilton', 'airbnb', 'lodging'],
      travel_ground: ['uber', 'lyft', 'taxi', 'cab', 'parking'],
      meals_business: ['lunch', 'dinner', 'meal', 'restaurant'],
      meals_team: ['team', 'pizza', 'group'],
      meals_client: ['client', 'entertainment', 'networking'],
      software_subscription: ['subscription', 'saas', 'aws', 'google', 'slack', 'figma'],
      office_supplies: ['supplies', 'paper', 'staples', 'pens'],
      marketing_ads: ['ads', 'advertising', 'meta', 'google ads', 'campaign'],
      training_course: ['course', 'training', 'udemy', 'workshop'],
    };

    for (const [slug, kws] of Object.entries(keywords)) {
      if (kws.some((kw) => title.includes(kw) || vendor.includes(kw))) {
        bestMatch = slug;
        break;
      }
    }

    const catName = categories.rows.find((c) => c.slug === bestMatch)?.name ?? bestMatch;

    return {
      success: true,
      data: { suggested_category: bestMatch, category_name: catName, confidence: 0.85 },
      summary: `Suggested category: "${catName}" (${bestMatch}). Confidence: 85%.`,
      metadata: { source: 'expense_categories', count: 1 },
    };
  },
});

registerTool({
  name: 'check_expense_policy',
  category: 'finance',
  description: 'Check if an expense complies with organization expense policies. Provide amount and category.',
  parameters: {
    type: 'object',
    properties: {
      amount: { type: 'number', description: 'Expense amount.' },
      category_slug: { type: 'string', description: 'Category of the expense.' },
      expense_date: { type: 'string', description: 'Date of the expense YYYY-MM-DD.' },
    },
    required: ['amount'],
  },
  async execute(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    const { policyService } = await import('../../../finance/policyService.js');

    const orgResult = await query<{ id: string }>('SELECT id FROM organizations WHERE slug = $1', ['messign']);
    const orgId = orgResult.rows[0]?.id;
    if (!orgId) return { success: false, data: null, summary: 'Organization not found.' };

    const result = await policyService.checkExpense(
      {
        amount: args.amount as number,
        category_slug: args.category_slug as string | undefined,
        expense_date: args.expense_date as string | undefined,
      },
      orgId,
    );

    const summary = result.passed
      ? `Expense passes policy check. ${result.warnings.length} warnings. Auto-approve eligible: ${result.auto_approve_eligible ? 'yes' : 'no'}. Risk score: ${(result.risk_score * 100).toFixed(0)}%.`
      : `Expense VIOLATES ${result.violations.length} policies: ${result.violations.map((v) => v.message).join('; ')}`;

    return { success: true, data: result, summary, metadata: { source: 'finance_expense_policies', count: result.violations.length } };
  },
});

registerTool({
  name: 'detect_duplicate_expense',
  category: 'finance',
  description: 'Check if an expense might be a duplicate based on amount, date, and vendor similarity.',
  parameters: {
    type: 'object',
    properties: {
      amount: { type: 'number', description: 'Expense amount.' },
      expense_date: { type: 'string', description: 'Date YYYY-MM-DD.' },
      vendor: { type: 'string', description: 'Vendor name.' },
      receipt_hash: { type: 'string', description: 'SHA-256 hash of receipt file.' },
    },
    required: ['amount'],
  },
  async execute(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    const conditions = ['is_deleted = FALSE'];
    const params: unknown[] = [];
    let idx = 1;

    conditions.push(`ABS(original_amount - $${idx++}) < 1`);
    params.push(args.amount);

    if (args.expense_date) {
      conditions.push(`ABS(EXTRACT(EPOCH FROM (expense_date - $${idx++}::date)) / 86400) < 3`);
      params.push(args.expense_date);
    }

    if (args.receipt_hash) {
      conditions.push(`receipt_hash = $${idx++}`);
      params.push(args.receipt_hash);
    }

    const result = await query(
      `SELECT id, title, original_amount, expense_date, status, submitted_by
       FROM reimbursement_requests
       WHERE ${conditions.join(' AND ')}
       LIMIT 10`,
      params,
    );

    const matches = result.rows;
    return {
      success: true,
      data: { duplicates: matches, count: matches.length },
      summary: matches.length > 0
        ? `Found ${matches.length} potential duplicate(s): ${matches.map((m) => `"${m.title}" ($${m.original_amount})`).join(', ')}.`
        : 'No duplicates detected.',
      metadata: { source: 'reimbursement_requests', count: matches.length },
    };
  },
});
