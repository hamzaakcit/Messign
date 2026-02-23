import { Router } from 'express';
import { query, getClient } from '../db/index.js';
import { reimbursementAuth, requireRole, type ReimbursementRequest } from '../middleware/reimbursementAuth.js';
import { emitToUser } from '../sockets/index.js';
import { getExchangeRate } from './exchangeRates.js';

const router = Router();
router.use(reimbursementAuth);

const COMPANY = {
  name: process.env.COMPANY_NAME || 'Messign Communications',
  prefix: process.env.INVOICE_PREFIX || 'MSG',
};

/* ── helpers ─────────────────────────────────────────── */
async function getNextInvoiceNumber(year: number): Promise<string> {
  const result = await query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM invoices WHERE period_year = $1`,
    [year]
  );
  const num = parseInt(result.rows[0]?.count ?? '0', 10) + 1;
  return `${COMPANY.prefix}-${year}-${String(num).padStart(3, '0')}`;
}

/* ── LIST ─────────────────────────────────────────────── */
/*  By default returns only the authenticated user's own invoices.
 *  Pass ?scope=all to get every invoice in the org (admin/finance only). */
router.get('/', async (req: ReimbursementRequest, res) => {
  const user = req.reimbursementUser!;
  const orgId = req.organizationId!;
  try {
    const wantAll = req.query.scope === 'all';
    const isAdmin = user.role === 'admin' || user.role === 'finance';

    let sql = `
      SELECT i.*, u.full_name AS employee_name, u.auth_user_id
      FROM invoices i
      JOIN reimbursement_users u ON u.id = i.employee_id
      WHERE u.organization_id = $1
    `;
    const params: unknown[] = [orgId];

    // Only admins requesting scope=all see every invoice; everyone else (including admins on the main panel) sees only their own.
    if (!(wantAll && isAdmin)) {
      params.push(user.id);
      sql += ` AND i.employee_id = $${params.length}`;
    }

    sql += ` ORDER BY i.period_year DESC, i.period_month DESC, i.created_at DESC`;
    const result = await query(sql, params);
    res.json(result.rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to list invoices' });
  }
});

/* ── GET by ID (with line items) ──────────────────────── */
router.get('/:id', async (req: ReimbursementRequest, res) => {
  const user = req.reimbursementUser!;
  const { id } = req.params;
  try {
    const invResult = await query(
      `SELECT i.*, u.full_name AS employee_name, u.auth_user_id, u.email AS employee_email,
              u.job_title AS employee_job_title, u.role AS employee_role
       FROM invoices i
       JOIN reimbursement_users u ON u.id = i.employee_id
       WHERE i.id = $1`,
      [id]
    );
    const inv = invResult.rows[0];
    if (!inv) { res.status(404).json({ error: 'Not found' }); return; }

    const isAdmin = user.role === 'admin' || user.role === 'finance';
    if (!isAdmin && inv.employee_id !== user.id) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    const itemsResult = await query(
      `SELECT * FROM invoice_line_items WHERE invoice_id = $1 ORDER BY sort_order`,
      [id]
    );
    const lineItems = itemsResult.rows;

    // Expense breakdown: for each line item with expense_id, fetch expense details + documents
    const expenseBreakdown: Array<{
      line_item: Record<string, unknown>;
      expense: Record<string, unknown> | null;
      documents: Array<{ id: string; file_name: string; file_url: string; document_type: string }>;
    }> = [];
    for (const item of lineItems) {
      const expenseId = item.expense_id;
      if (!expenseId) {
        expenseBreakdown.push({ line_item: item, expense: null, documents: [] });
        continue;
      }
      const expResult = await query(
        `SELECT r.id, r.title, r.description, r.expense_date, r.original_amount, r.original_currency,
                r.exchange_rate, r.converted_amount, r.status, r.submitted_at,
                c.name AS category_name
         FROM reimbursement_requests r
         LEFT JOIN expense_categories c ON c.id = r.category_id
         WHERE r.id = $1`,
        [expenseId]
      );
      const docsResult = await query(
        `SELECT id, file_name, file_url, document_type FROM reimbursement_documents WHERE reimbursement_id = $1 ORDER BY uploaded_at`,
        [expenseId]
      );
      expenseBreakdown.push({
        line_item: item,
        expense: expResult.rows[0] || null,
        documents: docsResult.rows.map((d) => ({
          id: d.id,
          file_name: d.file_name,
          file_url: d.file_url,
          document_type: d.document_type,
        })),
      });
    }

    // Fetch bank details and signature for the employee
    const bankResult = await query(
      `SELECT bank_name, iban, swift_bic, account_holder FROM bank_details WHERE user_id = $1`,
      [inv.employee_id]
    );
    const sigResult = await query(
      `SELECT signature_data FROM signatures WHERE user_id = $1`,
      [inv.employee_id]
    );

    res.json({
      ...inv,
      line_items: lineItems,
      expense_breakdown: expenseBreakdown,
      bank_details: bankResult.rows[0] || null,
      signature: sigResult.rows[0]?.signature_data || null,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to get invoice' });
  }
});

/* ── GENERATE-MINE (employee generates own invoice) ───── */
router.post('/generate-mine', async (req: ReimbursementRequest, res) => {
  const user = req.reimbursementUser!;
  const orgId = req.organizationId!;
  const { year, month } = req.body as { year: number; month: number };
  if (!year || !month) {
    res.status(400).json({ error: 'year, month required' });
    return;
  }
  try {
    // Check signature exists
    const sigCheck = await query(`SELECT id FROM signatures WHERE user_id = $1`, [user.id]);
    if (sigCheck.rows.length === 0) {
      res.status(403).json({ error: 'Set up your digital signature before generating invoices' });
      return;
    }
    const inv = await generateInvoiceForEmployee(orgId, user.id, year, month);
    res.status(201).json(inv);
  } catch (e: any) {
    if (e.code === '23505') {
      res.status(409).json({ error: 'Invoice already exists for this period (finalized)' });
      return;
    }
    console.error(e);
    res.status(500).json({ error: e.message || 'Failed to generate invoice' });
  }
});

/* ── GENERATE (single employee — admin) ───────────────── */
router.post('/generate', requireRole('admin', 'finance'), async (req: ReimbursementRequest, res) => {
  const orgId = req.organizationId!;
  const { employeeId, year, month } = req.body as { employeeId: string; year: number; month: number };
  if (!employeeId || !year || !month) {
    res.status(400).json({ error: 'employeeId, year, month required' });
    return;
  }
  try {
    const inv = await generateInvoiceForEmployee(orgId, employeeId, year, month);
    // Notify employee
    const emp = await query<{ auth_user_id: string }>(`SELECT auth_user_id FROM reimbursement_users WHERE id = $1`, [employeeId]);
    if (emp.rows[0]?.auth_user_id) {
      emitToUser(emp.rows[0].auth_user_id, 'invoice:generated', { invoiceId: inv.id, invoiceNumber: inv.invoice_number });
    }
    res.status(201).json(inv);
  } catch (e: any) {
    if (e.code === '23505') { // unique violation – already exists
      res.status(409).json({ error: 'Invoice already exists for this period (finalized)' });
      return;
    }
    console.error(e);
    res.status(500).json({ error: e.message || 'Failed to generate invoice' });
  }
});

/* ── GENERATE ALL ─────────────────────────────────────── */
router.post('/generate-all', requireRole('admin', 'finance'), async (req: ReimbursementRequest, res) => {
  const orgId = req.organizationId!;
  const { year, month } = req.body as { year: number; month: number };
  if (!year || !month) {
    res.status(400).json({ error: 'year, month required' });
    return;
  }
  try {
    const employees = await query<{ id: string; auth_user_id: string }>(
      `SELECT id, auth_user_id FROM reimbursement_users WHERE organization_id = $1`,
      [orgId]
    );
    const results: unknown[] = [];
    for (const emp of employees.rows) {
      try {
        const inv = await generateInvoiceForEmployee(orgId, emp.id, year, month);
        results.push(inv);
        if (emp.auth_user_id) {
          emitToUser(emp.auth_user_id, 'invoice:generated', { invoiceId: inv.id, invoiceNumber: inv.invoice_number });
        }
      } catch {
        // skip already-finalized
      }
    }
    res.status(201).json({ generated: results.length, invoices: results });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to generate invoices' });
  }
});

/* ── SIGN (employee signs own invoice) ────────────────── */
router.put('/:id/sign', async (req: ReimbursementRequest, res) => {
  const user = req.reimbursementUser!;
  const { id } = req.params;
  try {
    const inv = await query(`SELECT * FROM invoices WHERE id = $1`, [id]);
    if (!inv.rows[0]) { res.status(404).json({ error: 'Not found' }); return; }
    if (inv.rows[0].employee_id !== user.id) {
      res.status(403).json({ error: 'Only the invoice owner can sign' });
      return;
    }
    if (inv.rows[0].status !== 'draft') {
      res.status(400).json({ error: 'Invoice must be in draft status to sign' });
      return;
    }
    // Fetch employee's saved signature
    const sigResult = await query(`SELECT signature_data FROM signatures WHERE user_id = $1`, [user.id]);
    if (!sigResult.rows[0]?.signature_data) {
      res.status(403).json({ error: 'No signature on file. Set up your digital signature first.' });
      return;
    }
    const result = await query(
      `UPDATE invoices SET status = 'signed', signed_at = NOW(), signature_snapshot = $2, updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [id, sigResult.rows[0].signature_data]
    );
    res.json(result.rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to sign invoice' });
  }
});

/* ── FINALIZE (requires signed status) ────────────────── */
router.put('/:id/finalize', requireRole('admin', 'finance'), async (req: ReimbursementRequest, res) => {
  const { id } = req.params;
  try {
    const result = await query(
      `UPDATE invoices SET status = 'finalized', updated_at = NOW() WHERE id = $1 AND status = 'signed' RETURNING *`,
      [id]
    );
    if (result.rows.length === 0) {
      res.status(400).json({ error: 'Invoice not found or not in signed status' });
      return;
    }
    const inv = result.rows[0];
    const emp = await query<{ auth_user_id: string }>(`SELECT auth_user_id FROM reimbursement_users WHERE id = $1`, [inv.employee_id]);
    if (emp.rows[0]?.auth_user_id) {
      emitToUser(emp.rows[0].auth_user_id, 'invoice:finalized', { invoiceId: inv.id });
    }
    res.json(inv);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to finalize invoice' });
  }
});

/* ── REJECT ───────────────────────────────────────────── */
router.put('/:id/reject', requireRole('admin', 'finance'), async (req: ReimbursementRequest, res) => {
  const { id } = req.params;
  const { rejectionNote } = req.body as { rejectionNote?: string };
  try {
    const result = await query(
      `UPDATE invoices SET status = 'revision', rejection_note = $2, signed_at = NULL, signature_snapshot = NULL, updated_at = NOW()
       WHERE id = $1 AND status IN ('draft', 'signed', 'finalized') RETURNING *`,
      [id, rejectionNote || null]
    );
    if (result.rows.length === 0) {
      res.status(400).json({ error: 'Invoice not found or cannot be rejected' });
      return;
    }
    const inv = result.rows[0];
    const emp = await query<{ auth_user_id: string }>(`SELECT auth_user_id FROM reimbursement_users WHERE id = $1`, [inv.employee_id]);
    if (emp.rows[0]?.auth_user_id) {
      emitToUser(emp.rows[0].auth_user_id, 'invoice:rejected', { invoiceId: inv.id, note: rejectionNote });
    }
    res.json(inv);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to reject invoice' });
  }
});

/* ── REOPEN (admin: set finalized/paid back to draft so it can be regenerated) ── */
router.put('/:id/reopen', requireRole('admin', 'finance'), async (req: ReimbursementRequest, res) => {
  const { id } = req.params;
  try {
    const result = await query(
      `UPDATE invoices SET status = 'draft', rejection_note = NULL, pdf_url = NULL, signed_at = NULL, signature_snapshot = NULL, updated_at = NOW()
       WHERE id = $1 AND status IN ('finalized', 'paid') RETURNING *`,
      [id]
    );
    if (result.rows.length === 0) {
      res.status(400).json({ error: 'Invoice not found or not in finalized/paid status' });
      return;
    }
    res.json(result.rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to reopen invoice' });
  }
});

/* ── RESUBMIT ─────────────────────────────────────────── */
router.put('/:id/resubmit', async (req: ReimbursementRequest, res) => {
  const user = req.reimbursementUser!;
  const { id } = req.params;
  try {
    const inv = await query(`SELECT * FROM invoices WHERE id = $1`, [id]);
    if (!inv.rows[0]) { res.status(404).json({ error: 'Not found' }); return; }
    if (inv.rows[0].status !== 'revision') {
      res.status(400).json({ error: 'Invoice must be in revision status' });
      return;
    }
    if (inv.rows[0].employee_id !== user.id && user.role !== 'admin' && user.role !== 'finance') {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    const result = await query(
      `UPDATE invoices SET status = 'draft', rejection_note = NULL, signed_at = NULL, signature_snapshot = NULL, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [id]
    );
    res.json(result.rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to resubmit invoice' });
  }
});

/* ── PDF DOWNLOAD ─────────────────────────────────────── */
router.get('/:id/pdf', async (req: ReimbursementRequest, res) => {
  const user = req.reimbursementUser!;
  const { id } = req.params;
  try {
    const inv = await query(`SELECT * FROM invoices WHERE id = $1`, [id]);
    if (!inv.rows[0]) { res.status(404).json({ error: 'Not found' }); return; }
    if (inv.rows[0].employee_id !== user.id && user.role !== 'admin' && user.role !== 'finance') {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    if (!inv.rows[0].pdf_url) {
      // Generate on-demand
      try {
        const { generateInvoicePdf } = await import('../services/pdfService.js');
        const pdfUrl = await generateInvoicePdf(id);
        await query(`UPDATE invoices SET pdf_url = $1 WHERE id = $2`, [pdfUrl, id]);
        res.download(pdfUrl, `${inv.rows[0].invoice_number}.pdf`);
      } catch (pdfErr) {
        console.error('PDF generation error:', pdfErr);
        res.status(500).json({ error: 'PDF generation failed' });
      }
      return;
    }
    res.download(inv.rows[0].pdf_url, `${inv.rows[0].invoice_number}.pdf`);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to download PDF' });
  }
});

/* ═══════════════════════════════════════════════════════
   CORE GENERATION LOGIC
   ═══════════════════════════════════════════════════════ */
async function generateInvoiceForEmployee(
  orgId: string,
  employeeId: string,
  year: number,
  month: number
) {
  // Check existing
  const existing = await query(
    `SELECT id, status FROM invoices WHERE employee_id = $1 AND period_year = $2 AND period_month = $3`,
    [employeeId, year, month]
  );
  if (existing.rows[0]?.status === 'finalized' || existing.rows[0]?.status === 'paid') {
    throw new Error('Invoice already finalized for this period');
  }

  const employee = await query<{ id: string; full_name: string; base_retainer: string }>(
    `SELECT id, full_name, COALESCE(base_retainer, 5000) AS base_retainer FROM reimbursement_users WHERE id = $1 AND organization_id = $2`,
    [employeeId, orgId]
  );
  if (!employee.rows[0]) throw new Error('Employee not found');

  const emp = employee.rows[0];
  const baseRetainer = parseFloat(emp.base_retainer);

  // Find approved expenses for the period
  const periodStart = `${year}-${String(month).padStart(2, '0')}-01`;
  const periodEnd = `${year}-${String(month).padStart(2, '0')}-${new Date(year, month, 0).getDate()}`;

  const expResult = await query(
    `SELECT r.id, r.title, r.original_amount, r.original_currency, r.converted_amount, r.expense_date,
            c.name AS category_name
     FROM reimbursement_requests r
     JOIN expense_categories c ON c.id = r.category_id
     JOIN reimbursement_users u ON u.id = r.submitted_by
     WHERE u.id = $1 AND r.organization_id = $2
       AND r.status IN ('approved', 'paid')
       AND r.expense_date >= $3 AND r.expense_date <= $4
     ORDER BY r.expense_date`,
    [employeeId, orgId, periodStart, periodEnd]
  );

  const rawExpenses = expResult.rows;
  // Recompute EUR amount per expense using exchange rate at expense date (fixes old 1:1 stored values)
  const expenses: { id: string; title: string; original_amount: string; original_currency: string; category_name: string; expense_date: string; amount_eur: number }[] = [];
  let totalExpenses = 0;
  for (const e of rawExpenses) {
    const origAmt = parseFloat(e.original_amount ?? '0');
    const origCur = (e.original_currency ?? 'EUR').toUpperCase().slice(0, 3);
    const dateStr = String(e.expense_date ?? periodStart).slice(0, 10);
    let amountEur: number;
    if (origCur === 'EUR') {
      amountEur = origAmt;
    } else {
      const rate = await getExchangeRate(origCur, dateStr);
      amountEur = Math.round(origAmt * rate * 100) / 100;
    }
    totalExpenses += amountEur;
    expenses.push({
      id: e.id,
      title: e.title,
      original_amount: e.original_amount,
      original_currency: e.original_currency,
      category_name: e.category_name,
      expense_date: dateStr,
      amount_eur: amountEur,
    });
  }
  const grandTotal = baseRetainer + totalExpenses;

  const today = new Date().toISOString().slice(0, 10);
  const dueDate = new Date(year, month, 25).toISOString().slice(0, 10);
  const periodLabel = new Date(year, month - 1).toLocaleDateString('en-US', { year: 'numeric', month: 'long' });

  const client = await getClient();
  try {
    await client.query('BEGIN');

    let invoiceId: string;
    let invoiceNumber: string;

    if (existing.rows[0]) {
      // Update existing draft/revision invoice
      invoiceId = existing.rows[0].id;
      const updateResult = await client.query(
        `UPDATE invoices SET base_retainer = $1, total_expenses = $2, grand_total = $3,
                generated_date = $4, due_date = $5, status = 'draft', rejection_note = NULL,
                pdf_url = NULL, signed_at = NULL, signature_snapshot = NULL, updated_at = NOW()
         WHERE id = $6 RETURNING *`,
        [baseRetainer, totalExpenses, grandTotal, today, dueDate, invoiceId]
      );
      invoiceNumber = updateResult.rows[0].invoice_number;

      // Delete old line items
      await client.query(`DELETE FROM invoice_line_items WHERE invoice_id = $1`, [invoiceId]);
    } else {
      // Create new invoice
      invoiceNumber = await getNextInvoiceNumber(year);
      const insertResult = await client.query(
        `INSERT INTO invoices (invoice_number, employee_id, period_year, period_month,
           base_retainer, total_expenses, grand_total, status, generated_date, due_date)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'draft',$8,$9) RETURNING *`,
        [invoiceNumber, employeeId, year, month, baseRetainer, totalExpenses, grandTotal, today, dueDate]
      );
      invoiceId = insertResult.rows[0].id;
    }

    // Insert line items: consultation fee first
    await client.query(
      `INSERT INTO invoice_line_items (invoice_id, expense_id, description, amount_eur, sort_order)
       VALUES ($1, NULL, $2, $3, 0)`,
      [invoiceId, `Consultation Fee — ${periodLabel}`, baseRetainer]
    );

    // Insert expense lines (amount_eur already recomputed from exchange rate at expense date)
    for (let i = 0; i < expenses.length; i++) {
      const exp = expenses[i];
      const eurAmt = exp.amount_eur;
      const origAmt = parseFloat(exp.original_amount ?? '0');
      const origCur = exp.original_currency;
      const desc = `${exp.category_name}: ${exp.title}`;

      await client.query(
        `INSERT INTO invoice_line_items (invoice_id, expense_id, description, amount_eur,
           original_amount, original_currency, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [invoiceId, exp.id, desc, eurAmt, origCur !== 'EUR' ? origAmt : null, origCur !== 'EUR' ? origCur : null, i + 1]
      );
    }

    await client.query('COMMIT');

    const final = await query(`SELECT * FROM invoices WHERE id = $1`, [invoiceId]);
    return final.rows[0];
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export const invoicesRouter = router;
