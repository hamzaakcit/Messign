import { Router } from 'express';
import multer from 'multer';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { query } from '../db/index.js';
import { reimbursementAuth, type ReimbursementRequest } from '../middleware/reimbursementAuth.js';
import { requireFinanceRole } from '../middleware/financeRbac.js';
import { expenseService } from '../services/finance/expenseService.js';
import { auditService } from '../services/finance/auditService.js';
import { notificationService } from '../services/finance/notificationService.js';
import { invoiceService } from '../services/finance/invoiceService.js';
import { budgetService as budgetSvc } from '../services/finance/budgetService.js';
import { vendorService } from '../services/finance/vendorService.js';
import { paymentService } from '../services/finance/paymentService.js';
import { analyticsService } from '../services/finance/analyticsService.js';
import { approvalService } from '../services/finance/approvalService.js';
import { forecastService } from '../services/finance/forecastService.js';
import { extractReceiptData } from '../services/ai/receiptExtractor.js';
import { extractInvoiceData } from '../services/ai/invoiceExtractor.js';
import { generateFinanceInvoicePdf } from '../services/finance/financePdfService.js';
import { glAccountService } from '../services/finance/glAccountService.js';
import { journalEntryService } from '../services/finance/journalEntryService.js';
import { accountingReportService } from '../services/finance/accountingReportService.js';
import { taxService } from '../services/finance/taxService.js';
import { periodCloseService } from '../services/finance/periodCloseService.js';
import { slaService } from '../services/finance/slaService.js';
import type { Response } from 'express';

const router = Router();

const RECEIPT_DIR = path.join(process.cwd(), 'uploads', 'finance', 'receipts');
if (!fs.existsSync(RECEIPT_DIR)) {
  fs.mkdirSync(RECEIPT_DIR, { recursive: true });
}

const INVOICE_DOC_DIR = path.join(process.cwd(), 'uploads', 'finance', 'invoices');
if (!fs.existsSync(INVOICE_DOC_DIR)) {
  fs.mkdirSync(INVOICE_DOC_DIR, { recursive: true });
}

const receiptUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];
    cb(null, allowed.includes(file.mimetype));
  },
});

router.use(reimbursementAuth);

// ── DASHBOARD ──────────────────────────────────────
router.get('/dashboard', async (req: ReimbursementRequest, res: Response) => {
  try {
    const user = req.reimbursementUser!;
    const orgId = req.organizationId!;
    const metrics = await expenseService.getDashboardMetrics(orgId, user.id, user.role);
    res.json(metrics);
  } catch (err) {
    console.error('[finance/dashboard]', err);
    res.status(500).json({ error: 'Failed to load dashboard' });
  }
});

// ── EXPENSES CRUD ──────────────────────────────────
router.post('/expenses', async (req: ReimbursementRequest, res: Response) => {
  try {
    const user = req.reimbursementUser!;
    const orgId = req.organizationId!;
    const expense = await expenseService.create(req.body, user.id, orgId);
    res.status(201).json(expense);
  } catch (err) {
    console.error('[finance/expenses POST]', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to create expense' });
  }
});

router.get('/expenses', async (req: ReimbursementRequest, res: Response) => {
  try {
    const user = req.reimbursementUser!;
    const orgId = req.organizationId!;
    const filters = {
      status: req.query.status as string | undefined,
      category_slug: req.query.category_slug as string | undefined,
      date_from: req.query.date_from as string | undefined,
      date_to: req.query.date_to as string | undefined,
      amount_min: req.query.amount_min ? parseFloat(req.query.amount_min as string) : undefined,
      amount_max: req.query.amount_max ? parseFloat(req.query.amount_max as string) : undefined,
      team_id: req.query.team_id as string | undefined,
      risk_level: req.query.risk_level as 'low' | 'medium' | 'high' | undefined,
      search: req.query.search as string | undefined,
      sort_by: req.query.sort_by as string | undefined,
      sort_dir: req.query.sort_dir as 'asc' | 'desc' | undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
      offset: req.query.offset ? parseInt(req.query.offset as string) : undefined,
    };
    const result = await expenseService.list(filters, user.id, orgId, user.role);
    res.json(result);
  } catch (err) {
    console.error('[finance/expenses GET]', err);
    res.status(500).json({ error: 'Failed to list expenses' });
  }
});

// ── DUPLICATE CHECK (must be before /:id) ─────────
router.get('/expenses/check-duplicate', async (req: ReimbursementRequest, res: Response) => {
  try {
    const user = req.reimbursementUser!;
    const orgId = req.organizationId!;
    const amount = parseFloat(req.query.amount as string);
    const date = req.query.date as string;
    if (!amount || !date) { res.json({ duplicates: [] }); return; }

    const tolerance = amount * 0.1;
    const result = await query(
      `SELECT id, title, original_amount, expense_date, status
       FROM reimbursement_requests
       WHERE organization_id = $1 AND submitted_by = $2 AND is_deleted = FALSE
         AND original_amount BETWEEN $3 AND $4
         AND expense_date BETWEEN ($5::date - INTERVAL '3 days') AND ($5::date + INTERVAL '3 days')
         AND created_at >= NOW() - INTERVAL '30 days'
       LIMIT 5`,
      [orgId, user.id, amount - tolerance, amount + tolerance, date],
    );

    res.json({ duplicates: result.rows });
  } catch (err) {
    console.error('[finance/check-duplicate]', err);
    res.status(500).json({ error: 'Duplicate check failed' });
  }
});

router.get('/expenses/:id', async (req: ReimbursementRequest, res: Response) => {
  try {
    const user = req.reimbursementUser!;
    const orgId = req.organizationId!;
    const expense = await expenseService.getById(req.params.id, user.id, orgId, user.role);
    if (!expense) { res.status(404).json({ error: 'Expense not found' }); return; }
    res.json(expense);
  } catch (err) {
    console.error('[finance/expenses/:id GET]', err);
    res.status(500).json({ error: 'Failed to get expense' });
  }
});

router.put('/expenses/:id', async (req: ReimbursementRequest, res: Response) => {
  try {
    const user = req.reimbursementUser!;
    const orgId = req.organizationId!;
    const expense = await expenseService.update(req.params.id, req.body, user.id, orgId);
    if (!expense) { res.status(404).json({ error: 'Expense not found' }); return; }
    res.json(expense);
  } catch (err) {
    console.error('[finance/expenses/:id PUT]', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to update expense' });
  }
});

router.delete('/expenses/:id', async (req: ReimbursementRequest, res: Response) => {
  try {
    const user = req.reimbursementUser!;
    const orgId = req.organizationId!;
    const deleted = await expenseService.softDelete(req.params.id, user.id, orgId);
    if (!deleted) { res.status(404).json({ error: 'Expense not found' }); return; }
    res.json({ success: true });
  } catch (err) {
    console.error('[finance/expenses/:id DELETE]', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to delete expense' });
  }
});

// ── EXPENSE ACTIONS ────────────────────────────────
router.post('/expenses/:id/submit', async (req: ReimbursementRequest, res: Response) => {
  try {
    const user = req.reimbursementUser!;
    const orgId = req.organizationId!;
    const result = await expenseService.submit(req.params.id, user.id, orgId);
    res.json(result);
  } catch (err) {
    console.error('[finance/expenses/:id/submit]', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to submit expense' });
  }
});

router.post('/expenses/:id/approve', requireFinanceRole('manager', 'finance', 'admin'), async (req: ReimbursementRequest, res: Response) => {
  try {
    const user = req.reimbursementUser!;
    const orgId = req.organizationId!;
    const result = await expenseService.approve(req.params.id, user.id, orgId, req.body.comments);
    res.json(result);
  } catch (err) {
    console.error('[finance/expenses/:id/approve]', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to approve expense' });
  }
});

router.post('/expenses/:id/reject', requireFinanceRole('manager', 'finance', 'admin'), async (req: ReimbursementRequest, res: Response) => {
  try {
    const user = req.reimbursementUser!;
    const orgId = req.organizationId!;
    if (!req.body.reason) { res.status(400).json({ error: 'Rejection reason is required' }); return; }
    const result = await expenseService.reject(req.params.id, user.id, orgId, req.body.reason);
    res.json(result);
  } catch (err) {
    console.error('[finance/expenses/:id/reject]', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to reject expense' });
  }
});

router.post('/expenses/bulk-approve', requireFinanceRole('manager', 'finance', 'admin'), async (req: ReimbursementRequest, res: Response) => {
  try {
    const user = req.reimbursementUser!;
    const orgId = req.organizationId!;
    const { expense_ids } = req.body;
    if (!Array.isArray(expense_ids) || expense_ids.length === 0) {
      res.status(400).json({ error: 'expense_ids array required' });
      return;
    }
    const results = await expenseService.bulkApprove(expense_ids, user.id, orgId);
    res.json({ results });
  } catch (err) {
    console.error('[finance/expenses/bulk-approve]', err);
    res.status(500).json({ error: 'Bulk approve failed' });
  }
});

// ── NOTIFICATIONS ──────────────────────────────────
router.get('/notifications', async (req: ReimbursementRequest, res: Response) => {
  try {
    const user = req.reimbursementUser!;
    const unreadOnly = req.query.unread === 'true';
    const notifications = await notificationService.getForUser(user.id, 50, 0, unreadOnly);
    const unreadCount = await notificationService.getUnreadCount(user.id);
    res.json({ notifications, unreadCount });
  } catch (err) {
    console.error('[finance/notifications GET]', err);
    res.status(500).json({ error: 'Failed to get notifications' });
  }
});

router.put('/notifications/:id/read', async (req: ReimbursementRequest, res: Response) => {
  try {
    const user = req.reimbursementUser!;
    await notificationService.markRead(req.params.id, user.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to mark notification' });
  }
});

router.put('/notifications/read-all', async (req: ReimbursementRequest, res: Response) => {
  try {
    const user = req.reimbursementUser!;
    await notificationService.markAllRead(user.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to mark all read' });
  }
});

// ── AUDIT LOG ──────────────────────────────────────
router.get('/audit-log', requireFinanceRole('finance', 'admin'), async (req: ReimbursementRequest, res: Response) => {
  try {
    const orgId = req.organizationId!;
    const log = await auditService.getLog(orgId, {
      entity_type: req.query.entity_type as string | undefined,
      entity_id: req.query.entity_id as string | undefined,
      actor_type: req.query.actor_type as string | undefined,
      event_category: req.query.event_category as string | undefined,
      severity: req.query.severity as string | undefined,
      date_from: req.query.date_from as string | undefined,
      date_to: req.query.date_to as string | undefined,
      search: req.query.search as string | undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
      offset: req.query.offset ? parseInt(req.query.offset as string) : undefined,
    });
    res.json(log);
  } catch (err) {
    console.error('[finance/audit-log]', err);
    res.status(500).json({ error: 'Failed to get audit log' });
  }
});

// ── INVOICES ───────────────────────────────────────
router.post('/invoices', requireFinanceRole('finance', 'admin'), async (req: ReimbursementRequest, res: Response) => {
  try {
    const user = req.reimbursementUser!;
    const orgId = req.organizationId!;
    const invoice = await invoiceService.create(req.body, user.id, orgId);
    res.status(201).json(invoice);
  } catch (err) {
    console.error('[finance/invoices POST]', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to create invoice' });
  }
});

router.get('/invoices', async (req: ReimbursementRequest, res: Response) => {
  try {
    const orgId = req.organizationId!;
    const invoices = await invoiceService.list(orgId, {
      status: req.query.status as string | undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
      offset: req.query.offset ? parseInt(req.query.offset as string) : undefined,
    });
    res.json(invoices);
  } catch (err) {
    console.error('[finance/invoices GET]', err);
    res.status(500).json({ error: 'Failed to list invoices' });
  }
});

// ── INVOICE DOCUMENT SCAN (Dora AI) ──────────────────────
router.post('/invoices/scan', receiptUpload.single('document'), async (req: ReimbursementRequest, res: Response) => {
  try {
    const orgId = req.organizationId!;
    const userId = req.reimbursementUser!.id;
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'No document file provided' });

    const ext = path.extname(file.originalname) || '.jpg';
    const fileName = `invoice_scan_${Date.now()}${ext}`;
    const filePath = path.join(INVOICE_DOC_DIR, fileName);
    fs.writeFileSync(filePath, file.buffer);

    const base64 = file.buffer.toString('base64');
    const mediaType = file.mimetype || 'image/jpeg';

    let extraction;
    try {
      extraction = await extractInvoiceData(base64, mediaType);
    } catch (aiErr) {
      const errMsg = aiErr instanceof Error ? aiErr.message : 'AI extraction failed';
      console.error('[finance/invoices/scan] AI error:', errMsg);
      return res.status(503).json({ error: errMsg });
    }

    // Log audit event with a valid UUID
    const { randomUUID } = await import('crypto');
    auditService.log({
      organization_id: orgId,
      event_type: 'invoice.document_scanned',
      event_category: 'invoice',
      actor_type: 'ai',
      actor_id: userId,
      entity_type: 'invoice',
      entity_id: randomUUID(),
      changes: {},
      metadata: {
        file_name: file.originalname,
        confidence: extraction.confidence,
        fields_extracted: Object.entries(extraction)
          .filter(([k, v]) => k !== 'raw_extraction' && k !== 'confidence' && v != null)
          .map(([k]) => k),
      },
    }).catch(() => {});

    res.json({ extraction });
  } catch (err) {
    console.error('[finance/invoices/scan]', err);
    res.status(500).json({ error: 'Failed to scan invoice document' });
  }
});

// Recurring + bulk invoice routes placed before :id to avoid conflicts
router.get('/invoices/recurring', async (req: ReimbursementRequest, res: Response) => {
  try {
    const orgId = req.organizationId!;
    const result = await query(
      `SELECT i.*, (SELECT json_agg(json_build_object(
         'id', li.id, 'description', li.description, 'quantity', li.quantity,
         'unit_price', li.unit_price, 'tax_rate', li.tax_rate, 'line_total', li.line_total, 'sort_order', li.sort_order
       ) ORDER BY li.sort_order) FROM invoice_line_items li WHERE li.invoice_id = i.id) AS line_items
       FROM invoices i
       WHERE i.organization_id = $1 AND i.is_recurring = TRUE AND (i.is_deleted IS NULL OR i.is_deleted = FALSE)
       ORDER BY i.created_at DESC`,
      [orgId],
    );
    res.json(result.rows);
  } catch (err) {
    console.error('[finance/invoices/recurring GET]', err);
    res.status(500).json({ error: 'Failed to load recurring invoices' });
  }
});

router.post('/invoices/recurring', requireFinanceRole('finance', 'admin'), async (req: ReimbursementRequest, res: Response) => {
  try {
    const user = req.reimbursementUser!;
    const orgId = req.organizationId!;
    const data = req.body;
    data.is_recurring = true;
    data.recurring_config = data.recurring_config || { frequency: 'monthly', next_date: new Date().toISOString().split('T')[0], auto_send: false };
    data.status = 'draft';
    const invoice = await invoiceService.create(data, user.id, orgId);
    res.status(201).json(invoice);
  } catch (err) {
    console.error('[finance/invoices/recurring POST]', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to create recurring invoice' });
  }
});

router.post('/invoices/recurring/:id/generate', requireFinanceRole('finance', 'admin'), async (req: ReimbursementRequest, res: Response) => {
  try {
    const user = req.reimbursementUser!;
    const orgId = req.organizationId!;
    const template = await invoiceService.getById(req.params.id, orgId);
    if (!template || !template.is_recurring) return res.status(404).json({ error: 'Recurring template not found' });
    const config = template.recurring_config || {};
    const cloneData = {
      ...template,
      id: undefined, invoice_number: undefined, is_recurring: false,
      parent_recurring_id: template.id, recurring_config: undefined,
      status: config.auto_send ? 'sent' : 'draft',
      created_at: undefined, updated_at: undefined,
      due_date: config.next_date || new Date().toISOString().split('T')[0],
      line_items: template.line_items || [],
    };
    const newInvoice = await invoiceService.create(cloneData, user.id, orgId);
    const nextDate = computeNextDate(config.next_date || new Date().toISOString().split('T')[0], config.frequency || 'monthly');
    await query(
      `UPDATE invoices SET recurring_config = jsonb_set(COALESCE(recurring_config, '{}'), '{next_date}', $1::jsonb) WHERE id = $2`,
      [JSON.stringify(nextDate), template.id],
    );
    res.status(201).json(newInvoice);
  } catch (err) {
    console.error('[finance/invoices/recurring/generate]', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to generate recurrence' });
  }
});

router.put('/invoices/recurring/:id/pause', requireFinanceRole('finance', 'admin'), async (req: ReimbursementRequest, res: Response) => {
  try {
    const orgId = req.organizationId!;
    const result = await query(
      `UPDATE invoices SET recurring_config = jsonb_set(COALESCE(recurring_config, '{}'), '{paused}', 'true')
       WHERE id = $1 AND organization_id = $2 AND is_recurring = TRUE RETURNING *`,
      [req.params.id, orgId],
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Recurring invoice not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('[finance/invoices/recurring/pause]', err);
    res.status(400).json({ error: 'Failed to pause recurring invoice' });
  }
});

router.put('/invoices/recurring/:id/resume', requireFinanceRole('finance', 'admin'), async (req: ReimbursementRequest, res: Response) => {
  try {
    const orgId = req.organizationId!;
    const result = await query(
      `UPDATE invoices SET recurring_config = jsonb_set(COALESCE(recurring_config, '{}'), '{paused}', 'false')
       WHERE id = $1 AND organization_id = $2 AND is_recurring = TRUE RETURNING *`,
      [req.params.id, orgId],
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Recurring invoice not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('[finance/invoices/recurring/resume]', err);
    res.status(400).json({ error: 'Failed to resume recurring invoice' });
  }
});

router.post('/invoices/bulk-send', requireFinanceRole('finance', 'admin'), async (req: ReimbursementRequest, res: Response) => {
  try {
    const user = req.reimbursementUser!;
    const orgId = req.organizationId!;
    const { invoice_ids } = req.body;
    if (!Array.isArray(invoice_ids)) return res.status(400).json({ error: 'invoice_ids required' });
    const results = [];
    for (const id of invoice_ids) {
      try {
        await invoiceService.send(id, user.id, orgId);
        results.push({ id, success: true });
      } catch (err) {
        results.push({ id, success: false, error: err instanceof Error ? err.message : 'Failed' });
      }
    }
    res.json({ results });
  } catch (err) {
    console.error('[finance/invoices/bulk-send]', err);
    res.status(500).json({ error: 'Bulk send failed' });
  }
});

router.get('/invoices/:id', async (req: ReimbursementRequest, res: Response) => {
  try {
    const orgId = req.organizationId!;
    const invoice = await invoiceService.getById(req.params.id, orgId);
    if (!invoice) { res.status(404).json({ error: 'Invoice not found' }); return; }
    res.json(invoice);
  } catch (err) {
    res.status(500).json({ error: 'Failed to get invoice' });
  }
});

router.post('/invoices/:id/send', requireFinanceRole('finance', 'admin'), async (req: ReimbursementRequest, res: Response) => {
  try {
    const invoice = await invoiceService.send(req.params.id, req.reimbursementUser!.id, req.organizationId!);
    res.json(invoice);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to send invoice' });
  }
});

router.post('/invoices/:id/payment', requireFinanceRole('finance', 'admin'), async (req: ReimbursementRequest, res: Response) => {
  try {
    const result = await invoiceService.recordPayment(req.params.id, req.body.amount, req.reimbursementUser!.id, req.organizationId!);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to record payment' });
  }
});

router.post('/invoices/:id/void', requireFinanceRole('finance', 'admin'), async (req: ReimbursementRequest, res: Response) => {
  try {
    const invoice = await invoiceService.void_(req.params.id, req.reimbursementUser!.id, req.organizationId!);
    res.json(invoice);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to void invoice' });
  }
});

router.put('/invoices/:id', requireFinanceRole('finance', 'admin'), async (req: ReimbursementRequest, res: Response) => {
  try {
    const invoice = await invoiceService.update(req.params.id, req.body, req.reimbursementUser!.id, req.organizationId!);
    res.json(invoice);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to update invoice' });
  }
});

router.delete('/invoices/:id', requireFinanceRole('finance', 'admin'), async (req: ReimbursementRequest, res: Response) => {
  try {
    const result = await invoiceService.softDelete(req.params.id, req.reimbursementUser!.id, req.organizationId!);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to delete invoice' });
  }
});

router.get('/invoices/:id/pdf', async (req: ReimbursementRequest, res: Response) => {
  try {
    const orgId = req.organizationId!;
    const pdfBuffer = await generateFinanceInvoicePdf(req.params.id, orgId);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="invoice-${req.params.id}.pdf"`,
      'Content-Length': pdfBuffer.length.toString(),
    });
    res.send(pdfBuffer);
  } catch (err) {
    console.error('[finance/invoices/:id/pdf]', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to generate PDF' });
  }
});

// Note: stats route placed before :id to avoid route collision
router.get('/invoices-stats', async (req: ReimbursementRequest, res: Response) => {
  try {
    const stats = await invoiceService.getStats(req.organizationId!);
    res.json(stats);
  } catch (err) {
    console.error('[finance/invoices-stats]', err);
    res.status(500).json({ error: 'Failed to get invoice stats' });
  }
});

// ── BUDGETS (v1.2) ────────────────────────────────
router.get('/budgets', async (req: ReimbursementRequest, res: Response) => {
  try {
    const orgId = req.organizationId!;
    const budgets = await budgetSvc.list(orgId, {
      status: req.query.status as string | undefined,
      team_id: req.query.team_id as string | undefined,
    });
    res.json(budgets);
  } catch (err) {
    res.status(500).json({ error: 'Failed to list budgets' });
  }
});

router.get('/budgets/:id', async (req: ReimbursementRequest, res: Response) => {
  try {
    const budget = await budgetSvc.getById(req.params.id, req.organizationId!);
    if (!budget) { res.status(404).json({ error: 'Budget not found' }); return; }
    res.json(budget);
  } catch (err) {
    res.status(500).json({ error: 'Failed to get budget' });
  }
});

router.post('/budgets', requireFinanceRole('finance', 'admin'), async (req: ReimbursementRequest, res: Response) => {
  try {
    const budget = await budgetSvc.create(req.body, req.reimbursementUser!.id, req.organizationId!);
    res.status(201).json(budget);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to create budget' });
  }
});

router.put('/budgets/:id', requireFinanceRole('finance', 'admin'), async (req: ReimbursementRequest, res: Response) => {
  try {
    const budget = await budgetSvc.update(req.params.id, req.body, req.reimbursementUser!.id, req.organizationId!);
    res.json(budget);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to update budget' });
  }
});

router.get('/budgets/:id/health', async (req: ReimbursementRequest, res: Response) => {
  try {
    const health = await budgetSvc.checkHealth(req.params.id, req.organizationId!);
    if (!health) { res.status(404).json({ error: 'Budget not found' }); return; }
    res.json(health);
  } catch (err) {
    res.status(500).json({ error: 'Failed to check budget health' });
  }
});

router.put('/budgets/:id/allocations', requireFinanceRole('finance', 'admin'), async (req: ReimbursementRequest, res: Response) => {
  try {
    await budgetSvc.setAllocations(req.params.id, req.body.allocations, req.reimbursementUser!.id, req.organizationId!);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to set allocations' });
  }
});

// ── VENDORS ────────────────────────────────────────
router.get('/vendors', async (req: ReimbursementRequest, res: Response) => {
  try {
    const vendors = await vendorService.list(req.organizationId!, {
      search: req.query.search as string | undefined,
    });
    res.json(vendors);
  } catch (err) {
    res.status(500).json({ error: 'Failed to list vendors' });
  }
});

router.get('/vendors/:id', async (req: ReimbursementRequest, res: Response) => {
  try {
    const vendor = await vendorService.getById(req.params.id, req.organizationId!);
    if (!vendor) { res.status(404).json({ error: 'Vendor not found' }); return; }
    res.json(vendor);
  } catch (err) {
    res.status(500).json({ error: 'Failed to get vendor' });
  }
});

router.post('/vendors', requireFinanceRole('finance', 'admin'), async (req: ReimbursementRequest, res: Response) => {
  try {
    const vendor = await vendorService.create(req.body, req.reimbursementUser!.id, req.organizationId!);
    res.status(201).json(vendor);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to create vendor' });
  }
});

router.put('/vendors/:id', requireFinanceRole('finance', 'admin'), async (req: ReimbursementRequest, res: Response) => {
  try {
    const vendor = await vendorService.update(req.params.id, req.body, req.reimbursementUser!.id, req.organizationId!);
    res.json(vendor);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to update vendor' });
  }
});

// ── PAYMENTS ───────────────────────────────────────
router.get('/payments', requireFinanceRole('finance', 'admin'), async (req: ReimbursementRequest, res: Response) => {
  try {
    const payments = await paymentService.list(req.organizationId!, {
      status: req.query.status as string | undefined,
    });
    res.json(payments);
  } catch (err) {
    res.status(500).json({ error: 'Failed to list payments' });
  }
});

router.post('/payments', requireFinanceRole('finance', 'admin'), async (req: ReimbursementRequest, res: Response) => {
  try {
    const payment = await paymentService.create(req.body, req.reimbursementUser!.id, req.organizationId!);
    res.status(201).json(payment);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to create payment' });
  }
});

router.post('/payments/:id/complete', requireFinanceRole('finance', 'admin'), async (req: ReimbursementRequest, res: Response) => {
  try {
    const payment = await paymentService.complete(req.params.id, req.reimbursementUser!.id, req.organizationId!);
    res.json(payment);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to complete payment' });
  }
});

// ── ANALYTICS ──────────────────────────────────────
router.get('/analytics/dashboard', async (req: ReimbursementRequest, res: Response) => {
  try {
    const data = await analyticsService.getDashboard(req.organizationId!);
    res.json(data);
  } catch (err) {
    console.error('[finance/analytics/dashboard]', err);
    res.status(500).json({ error: 'Failed to load analytics' });
  }
});

router.get('/analytics/spending-trend', async (req: ReimbursementRequest, res: Response) => {
  try {
    const months = req.query.months ? parseInt(req.query.months as string) : 6;
    const data = await analyticsService.getSpendingTrend(req.organizationId!, months);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load spending trend' });
  }
});

router.get('/analytics/spending-by-category', async (req: ReimbursementRequest, res: Response) => {
  try {
    const data = await analyticsService.getSpendingByCategory(req.organizationId!);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load category breakdown' });
  }
});

router.get('/analytics/ai-metrics', requireFinanceRole('finance', 'admin'), async (req: ReimbursementRequest, res: Response) => {
  try {
    const data = await analyticsService.getAIMetrics(req.organizationId!);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load AI metrics' });
  }
});

// ── APPROVALS ─────────────────────────────────────
router.get('/approvals/chain/:entityType/:entityId', async (req: ReimbursementRequest, res: Response) => {
  try {
    const chain = await approvalService.getChain(req.params.entityType, req.params.entityId);
    res.json(chain);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load approval chain' });
  }
});

router.post('/approvals/advance', requireFinanceRole('manager', 'finance', 'admin'), async (req: ReimbursementRequest, res: Response) => {
  try {
    const { entityType, entityId, action, notes } = req.body;
    const actorId = req.reimbursementUser!.id;
    if (!approvalService.checkSoD(req.body.submitterId || '', actorId)) {
      return res.status(403).json({ error: 'Separation of duties violation: submitter cannot approve' });
    }
    const result = await approvalService.advanceStep(entityType, entityId, actorId, req.organizationId!, action, notes);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to advance approval' });
  }
});

router.post('/approvals/delegate', requireFinanceRole('manager', 'finance', 'admin'), async (req: ReimbursementRequest, res: Response) => {
  try {
    const { stepId, delegateToId } = req.body;
    const result = await approvalService.delegate(stepId, delegateToId, req.organizationId!, req.reimbursementUser!.id);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Delegation failed' });
  }
});

router.post('/approvals/escalate', requireFinanceRole('manager', 'finance', 'admin'), async (req: ReimbursementRequest, res: Response) => {
  try {
    const { stepId } = req.body;
    const result = await approvalService.escalate(stepId, req.organizationId!);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Escalation failed' });
  }
});

// ── FORECASTS ─────────────────────────────────────
router.get('/forecast/budgets', requireFinanceRole('finance', 'admin'), async (req: ReimbursementRequest, res: Response) => {
  try {
    const forecasts = await forecastService.forecastBudgets(req.organizationId!);
    res.json(forecasts);
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate budget forecasts' });
  }
});

router.get('/forecast/payments', requireFinanceRole('finance', 'admin'), async (req: ReimbursementRequest, res: Response) => {
  try {
    const months = parseInt(req.query.months as string) || 3;
    const forecasts = await forecastService.forecastPayments(req.organizationId!, months);
    res.json(forecasts);
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate payment forecasts' });
  }
});

// ── RECEIPT UPLOAD + OCR ───────────────────────────
router.post('/expenses/:id/receipts', receiptUpload.single('receipt'), async (req: ReimbursementRequest, res: Response) => {
  try {
    const user = req.reimbursementUser!;
    const orgId = req.organizationId!;
    const expenseId = req.params.id;
    const file = (req as any).file;
    if (!file) { res.status(400).json({ error: 'No file uploaded' }); return; }

    const expense = await query('SELECT id, submitted_by FROM reimbursement_requests WHERE id = $1 AND organization_id = $2 AND is_deleted = FALSE', [expenseId, orgId]);
    if (!expense.rows[0]) { res.status(404).json({ error: 'Expense not found' }); return; }

    const fileHash = crypto.createHash('sha256').update(file.buffer).digest('hex');
    const ext = path.extname(file.originalname) || '.jpg';
    const fileName = `${expenseId}_${Date.now()}${ext}`;
    const filePath = path.join(RECEIPT_DIR, fileName);
    fs.writeFileSync(filePath, file.buffer);

    const fileUrl = `/uploads/finance/receipts/${fileName}`;
    const result = await query(
      `INSERT INTO reimbursement_documents
       (reimbursement_id, document_type, file_name, file_url, mime_type, file_size_bytes, file_hash)
       VALUES ($1, 'receipt', $2, $3, $4, $5, $6)
       RETURNING *`,
      [expenseId, file.originalname, fileUrl, file.mimetype, file.size, fileHash],
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('[finance/receipts POST]', err);
    res.status(500).json({ error: 'Failed to upload receipt' });
  }
});

router.post('/expenses/:id/receipts/:docId/ocr', async (req: ReimbursementRequest, res: Response) => {
  try {
    const orgId = req.organizationId!;
    const { id: expenseId, docId } = req.params;

    const doc = await query('SELECT * FROM reimbursement_documents WHERE id = $1 AND reimbursement_id = $2', [docId, expenseId]);
    if (!doc.rows[0]) { res.status(404).json({ error: 'Document not found' }); return; }

    const filePath = path.join(process.cwd(), doc.rows[0].file_url);
    if (!fs.existsSync(filePath)) { res.status(404).json({ error: 'File not found on disk' }); return; }

    const fileBuffer = fs.readFileSync(filePath);
    const base64 = fileBuffer.toString('base64');
    const mediaType = doc.rows[0].mime_type || 'image/jpeg';

    const extraction = await extractReceiptData(base64, mediaType);

    await query(
      `UPDATE reimbursement_documents SET
         ocr_processed = TRUE, ocr_vendor_name = $1, ocr_amount = $2,
         extracted_vendor = $1, extracted_amount = $2, extracted_date = $3,
         ocr_raw_response = $4
       WHERE id = $5`,
      [extraction.vendor_name, extraction.amount, extraction.date, JSON.stringify(extraction.raw_extraction), docId],
    );

    res.json({
      extraction,
      document_id: docId,
    });
  } catch (err) {
    console.error('[finance/receipts OCR]', err);
    res.status(500).json({ error: 'OCR processing failed' });
  }
});

// ── COMMENTS ──────────────────────────────────────
router.post('/expenses/:id/comments', async (req: ReimbursementRequest, res: Response) => {
  try {
    const user = req.reimbursementUser!;
    const orgId = req.organizationId!;
    const { comment_text, is_internal } = req.body;
    if (!comment_text?.trim()) { res.status(400).json({ error: 'Comment text required' }); return; }

    const expense = await query('SELECT id FROM reimbursement_requests WHERE id = $1 AND organization_id = $2 AND is_deleted = FALSE', [req.params.id, orgId]);
    if (!expense.rows[0]) { res.status(404).json({ error: 'Expense not found' }); return; }

    const result = await query(
      `INSERT INTO reimbursement_comments (reimbursement_id, user_id, comment_text, is_internal)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [req.params.id, user.id, comment_text.trim(), is_internal || false],
    );

    const withName = await query(
      `SELECT c.*, u.full_name as author_name FROM reimbursement_comments c
       LEFT JOIN reimbursement_users u ON u.id = c.user_id WHERE c.id = $1`,
      [result.rows[0].id],
    );

    res.status(201).json(withName.rows[0]);
  } catch (err) {
    console.error('[finance/comments POST]', err);
    res.status(500).json({ error: 'Failed to add comment' });
  }
});

// ── REQUEST INFO ──────────────────────────────────
router.post('/expenses/:id/request-info', requireFinanceRole('manager', 'finance', 'admin'), async (req: ReimbursementRequest, res: Response) => {
  try {
    const user = req.reimbursementUser!;
    const orgId = req.organizationId!;
    const { message } = req.body;
    if (!message?.trim()) { res.status(400).json({ error: 'Message is required' }); return; }

    const result = await expenseService.requestInfo(req.params.id, user.id, orgId, message);
    res.json(result);
  } catch (err) {
    console.error('[finance/request-info]', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to request info' });
  }
});

// ── DORA FEEDBACK ─────────────────────────────────
router.post('/dora-decisions/:id/feedback', async (req: ReimbursementRequest, res: Response) => {
  try {
    const { rating, comment } = req.body;
    await query(
      `UPDATE finance_dora_decisions SET feedback_rating = $1, feedback_comment = $2 WHERE id = $3`,
      [rating, comment ?? null, req.params.id],
    );
    res.json({ success: true });
  } catch (err) {
    console.error('[finance/dora-feedback]', err);
    res.status(500).json({ error: 'Failed to save feedback' });
  }
});

router.post('/expenses/:id/dora-feedback', async (req: ReimbursementRequest, res: Response) => {
  try {
    const { rating, comment } = req.body;
    const decision = await query(
      `SELECT id FROM finance_dora_decisions WHERE expense_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [req.params.id],
    );
    if (!decision.rows[0]) return res.status(404).json({ error: 'No AI decision found for this expense' });
    await query(
      `UPDATE finance_dora_decisions SET feedback_rating = $1, feedback_comment = $2 WHERE id = $3`,
      [rating, comment ?? null, decision.rows[0].id],
    );
    res.json({ success: true });
  } catch (err) {
    console.error('[finance/expense-dora-feedback]', err);
    res.status(500).json({ error: 'Failed to save feedback' });
  }
});

// ── CATEGORIES ─────────────────────────────────────
router.get('/categories', async (req: ReimbursementRequest, res: Response) => {
  try {
    const { rows } = await query(
      'SELECT * FROM expense_categories WHERE organization_id = $1 AND is_active = TRUE ORDER BY sort_order, name',
      [req.organizationId!],
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load categories' });
  }
});

// ── GL ACCOUNTS ───────────────────────────────────
router.get('/gl-accounts/tree', async (req: ReimbursementRequest, res: Response) => {
  try {
    const tree = await glAccountService.getTree(req.organizationId!);
    res.json(tree);
  } catch (err) {
    console.error('[finance/gl-accounts/tree]', err);
    res.status(500).json({ error: 'Failed to load account tree' });
  }
});

router.get('/gl-accounts/trial-balance', async (req: ReimbursementRequest, res: Response) => {
  try {
    const { period } = req.query;
    const tb = await glAccountService.getTrialBalance(req.organizationId!, period as string | undefined);
    res.json(tb);
  } catch (err) {
    console.error('[finance/gl-accounts/trial-balance]', err);
    res.status(500).json({ error: 'Failed to load trial balance' });
  }
});

router.get('/gl-accounts', async (req: ReimbursementRequest, res: Response) => {
  try {
    const accounts = await glAccountService.list(req.organizationId!);
    res.json(accounts);
  } catch (err) {
    console.error('[finance/gl-accounts]', err);
    res.status(500).json({ error: 'Failed to load GL accounts' });
  }
});

router.get('/gl-accounts/:id', async (req: ReimbursementRequest, res: Response) => {
  try {
    const account = await glAccountService.getById(req.organizationId!, req.params.id);
    if (!account) { res.status(404).json({ error: 'Account not found' }); return; }
    res.json(account);
  } catch (err) {
    console.error('[finance/gl-accounts/:id]', err);
    res.status(500).json({ error: 'Failed to load GL account' });
  }
});

router.post('/gl-accounts', requireFinanceRole('finance', 'admin'), async (req: ReimbursementRequest, res: Response) => {
  try {
    const account = await glAccountService.create(req.organizationId!, req.body);
    res.status(201).json(account);
  } catch (err) {
    console.error('[finance/gl-accounts POST]', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to create account' });
  }
});

router.put('/gl-accounts/:id', requireFinanceRole('finance', 'admin'), async (req: ReimbursementRequest, res: Response) => {
  try {
    const account = await glAccountService.update(req.organizationId!, req.params.id, req.body);
    res.json(account);
  } catch (err) {
    console.error('[finance/gl-accounts PUT]', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to update account' });
  }
});

router.delete('/gl-accounts/:id', requireFinanceRole('finance', 'admin'), async (req: ReimbursementRequest, res: Response) => {
  try {
    const account = await glAccountService.deactivate(req.organizationId!, req.params.id);
    res.json(account);
  } catch (err) {
    console.error('[finance/gl-accounts DELETE]', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to deactivate account' });
  }
});

// ── JOURNAL ENTRIES ───────────────────────────────
router.get('/journal-entries', async (req: ReimbursementRequest, res: Response) => {
  try {
    const { period, source_type, status, search, limit, offset } = req.query;
    const result = await journalEntryService.list(req.organizationId!, {
      period: period as string,
      source_type: source_type as string,
      status: status as string,
      search: search as string,
      limit: limit ? parseInt(limit as string) : undefined,
      offset: offset ? parseInt(offset as string) : undefined,
    });
    res.json(result);
  } catch (err) {
    console.error('[finance/journal-entries]', err);
    res.status(500).json({ error: 'Failed to load journal entries' });
  }
});

router.get('/journal-entries/:id', async (req: ReimbursementRequest, res: Response) => {
  try {
    const entry = await journalEntryService.getById(req.organizationId!, req.params.id);
    if (!entry) { res.status(404).json({ error: 'Journal entry not found' }); return; }
    res.json(entry);
  } catch (err) {
    console.error('[finance/journal-entries/:id]', err);
    res.status(500).json({ error: 'Failed to load journal entry' });
  }
});

router.post('/journal-entries', requireFinanceRole('finance', 'admin'), async (req: ReimbursementRequest, res: Response) => {
  try {
    const orgId = req.organizationId!;
    const userId = req.reimbursementUser!.id;
    const { description, entry_date, period, reference, lines } = req.body;

    if (!description || !lines || !Array.isArray(lines) || lines.length < 2) {
      res.status(400).json({ error: 'Description and at least 2 lines are required' });
      return;
    }
    const totalDebit = lines.reduce((s: number, l: { debit: number }) => s + (Number(l.debit) || 0), 0);
    const totalCredit = lines.reduce((s: number, l: { credit: number }) => s + (Number(l.credit) || 0), 0);
    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      res.status(400).json({ error: `Debits ($${totalDebit.toFixed(2)}) must equal credits ($${totalCredit.toFixed(2)})` });
      return;
    }

    const entryDate = entry_date || new Date().toISOString().split('T')[0];
    const entryPeriod = period || entryDate.slice(0, 7);

    const entry = await journalEntryService._createEntry(orgId, {
      description,
      source_type: 'manual',
      source_id: reference || `manual-${Date.now()}`,
      period: entryPeriod,
      entry_date: entryDate,
      lines: lines.map((l: { gl_code: string; debit: number; credit: number; description?: string }) => ({
        gl_code: l.gl_code,
        debit: Number(l.debit) || 0,
        credit: Number(l.credit) || 0,
        description: l.description || description,
      })),
      created_by: userId,
    });

    res.status(201).json(entry);
  } catch (err) {
    console.error('[finance/journal-entries POST]', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to create journal entry' });
  }
});

router.post('/journal-entries/:id/void', requireFinanceRole('finance', 'admin'), async (req: ReimbursementRequest, res: Response) => {
  try {
    const user = req.reimbursementUser!;
    const reversal = await journalEntryService.void_(req.organizationId!, req.params.id, user.id);
    res.json(reversal);
  } catch (err) {
    console.error('[finance/journal-entries/void]', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to void entry' });
  }
});

// ── ACCOUNTING REPORTS ────────────────────────────
router.get('/reports/profit-loss', async (req: ReimbursementRequest, res: Response) => {
  try {
    const { period_from, period_to } = req.query;
    const now = new Date();
    const defaultPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const report = await accountingReportService.getProfitLoss(
      req.organizationId!,
      (period_from as string) || defaultPeriod,
      (period_to as string) || defaultPeriod,
    );
    res.json(report);
  } catch (err) {
    console.error('[finance/reports/profit-loss]', err);
    res.status(500).json({ error: 'Failed to generate P&L report' });
  }
});

router.get('/reports/ap-aging', async (req: ReimbursementRequest, res: Response) => {
  try {
    const report = await accountingReportService.getAPAging(req.organizationId!);
    res.json(report);
  } catch (err) {
    console.error('[finance/reports/ap-aging]', err);
    res.status(500).json({ error: 'Failed to generate AP aging report' });
  }
});

router.get('/reports/ar-aging', async (req: ReimbursementRequest, res: Response) => {
  try {
    const report = await accountingReportService.getARAging(req.organizationId!);
    res.json(report);
  } catch (err) {
    console.error('[finance/reports/ar-aging]', err);
    res.status(500).json({ error: 'Failed to generate AR aging report' });
  }
});

router.get('/reports/balance-sheet', async (req: ReimbursementRequest, res: Response) => {
  try {
    const asOfDate = req.query.as_of_date as string | undefined;
    const report = await accountingReportService.getBalanceSheet(req.organizationId!, asOfDate);
    res.json(report);
  } catch (err) {
    console.error('[finance/reports/balance-sheet]', err);
    res.status(500).json({ error: 'Failed to generate balance sheet' });
  }
});

router.get('/reports/tax-summary', async (req: ReimbursementRequest, res: Response) => {
  try {
    const { period_from, period_to } = req.query;
    const now = new Date();
    const defaultPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const report = await accountingReportService.getTaxSummary(
      req.organizationId!,
      (period_from as string) || defaultPeriod,
      (period_to as string) || defaultPeriod,
    );
    res.json(report);
  } catch (err) {
    console.error('[finance/reports/tax-summary]', err);
    res.status(500).json({ error: 'Failed to generate tax summary' });
  }
});

// ── TAX RATES ─────────────────────────────────────
router.get('/tax-rates', async (req: ReimbursementRequest, res: Response) => {
  try {
    const rates = await taxService.list(req.organizationId!);
    res.json(rates);
  } catch (err) {
    console.error('[finance/tax-rates]', err);
    res.status(500).json({ error: 'Failed to load tax rates' });
  }
});

router.post('/tax-rates', requireFinanceRole('finance', 'admin'), async (req: ReimbursementRequest, res: Response) => {
  try {
    const rate = await taxService.create(req.organizationId!, req.body);
    res.status(201).json(rate);
  } catch (err) {
    console.error('[finance/tax-rates POST]', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to create tax rate' });
  }
});

router.put('/tax-rates/:id', requireFinanceRole('finance', 'admin'), async (req: ReimbursementRequest, res: Response) => {
  try {
    const rate = await taxService.update(req.organizationId!, req.params.id, req.body);
    res.json(rate);
  } catch (err) {
    console.error('[finance/tax-rates PUT]', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to update tax rate' });
  }
});

router.delete('/tax-rates/:id', requireFinanceRole('finance', 'admin'), async (req: ReimbursementRequest, res: Response) => {
  try {
    const rate = await taxService.deactivate(req.organizationId!, req.params.id);
    res.json(rate);
  } catch (err) {
    console.error('[finance/tax-rates DELETE]', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to deactivate tax rate' });
  }
});

// ── PERIOD CLOSE ──────────────────────────────────
router.get('/period-close', async (req: ReimbursementRequest, res: Response) => {
  try {
    const periods = await periodCloseService.list(req.organizationId!);
    res.json(periods);
  } catch (err) {
    console.error('[finance/period-close]', err);
    res.status(500).json({ error: 'Failed to load period closes' });
  }
});

router.get('/period-close/:period', async (req: ReimbursementRequest, res: Response) => {
  try {
    const pc = await periodCloseService.getOrCreate(req.organizationId!, req.params.period);
    res.json(pc);
  } catch (err) {
    console.error('[finance/period-close/:period]', err);
    res.status(500).json({ error: 'Failed to load period close' });
  }
});

router.put('/period-close/:id/task', async (req: ReimbursementRequest, res: Response) => {
  try {
    const user = req.reimbursementUser!;
    const { task_key, completed } = req.body;
    const task = await periodCloseService.updateTask(req.organizationId!, req.params.id, task_key, completed, user.id);
    res.json(task);
  } catch (err) {
    console.error('[finance/period-close/task]', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to update task' });
  }
});

router.post('/period-close/:id/close', requireFinanceRole('finance', 'admin'), async (req: ReimbursementRequest, res: Response) => {
  try {
    const user = req.reimbursementUser!;
    const pc = await periodCloseService.closePeriod(req.organizationId!, req.params.id, user.id);
    res.json(pc);
  } catch (err) {
    console.error('[finance/period-close/close]', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to close period' });
  }
});

router.post('/period-close/:id/lock', requireFinanceRole('finance', 'admin'), async (req: ReimbursementRequest, res: Response) => {
  try {
    const user = req.reimbursementUser!;
    const pc = await periodCloseService.lockPeriod(req.organizationId!, req.params.id, user.id);
    res.json(pc);
  } catch (err) {
    console.error('[finance/period-close/lock]', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to lock period' });
  }
});

router.post('/period-close/:id/reopen', requireFinanceRole('finance', 'admin'), async (req: ReimbursementRequest, res: Response) => {
  try {
    const user = req.reimbursementUser!;
    const pc = await periodCloseService.reopenPeriod(req.organizationId!, req.params.id, user.id);
    res.json(pc);
  } catch (err) {
    console.error('[finance/period-close/reopen]', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to reopen period' });
  }
});

// ── Sprint 4: Settings ────────────────────────────────

router.get('/settings', async (req: ReimbursementRequest, res: Response) => {
  try {
    const orgId = req.organizationId!;
    const result = await query(
      `SELECT * FROM finance_settings WHERE organization_id = $1`,
      [orgId],
    );
    if (!result.rows[0]) {
      const created = await query(
        `INSERT INTO finance_settings (organization_id) VALUES ($1)
         ON CONFLICT (organization_id) DO UPDATE SET organization_id = $1
         RETURNING *`,
        [orgId],
      );
      return res.json(created.rows[0]);
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('[finance/settings GET]', err);
    res.status(500).json({ error: 'Failed to load settings' });
  }
});

router.put('/settings', requireFinanceRole('finance', 'admin'), async (req: ReimbursementRequest, res: Response) => {
  try {
    const orgId = req.organizationId!;
    const allowedFields = [
      'company_name', 'company_address', 'company_phone', 'company_email',
      'company_website', 'company_tax_id', 'company_logo_url', 'base_currency',
      'fiscal_year_start', 'receipt_required_above', 'dora_autonomy_level',
      'dora_auto_approve_enabled', 'dora_auto_approve_max', 'dora_min_confidence',
      'dora_max_risk', 'dora_features',
    ];
    const sets: string[] = [];
    const params: unknown[] = [];
    let idx = 1;
    for (const [key, val] of Object.entries(req.body)) {
      if (allowedFields.includes(key) && val !== undefined) {
        sets.push(`${key} = $${idx++}`);
        params.push(key === 'dora_features' ? JSON.stringify(val) : val);
      }
    }
    if (sets.length === 0) return res.status(400).json({ error: 'No fields to update' });
    sets.push('updated_at = NOW()');
    params.push(orgId);
    const result = await query(
      `UPDATE finance_settings SET ${sets.join(', ')} WHERE organization_id = $${idx} RETURNING *`,
      params,
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Settings not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('[finance/settings PUT]', err);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// ── Sprint 4: Expense Policies ────────────────────────

router.get('/expense-policies', async (req: ReimbursementRequest, res: Response) => {
  try {
    const orgId = req.organizationId!;
    const result = await query(
      `SELECT * FROM finance_expense_policies WHERE organization_id = $1 ORDER BY priority, name`,
      [orgId],
    );
    res.json(result.rows);
  } catch (err) {
    console.error('[finance/expense-policies GET]', err);
    res.status(500).json({ error: 'Failed to load expense policies' });
  }
});

router.post('/expense-policies', requireFinanceRole('finance', 'admin'), async (req: ReimbursementRequest, res: Response) => {
  try {
    const orgId = req.organizationId!;
    const { name, description, rules, violation_action, violation_message, applies_to_teams, applies_to_roles, priority } = req.body;
    if (!name || !rules) return res.status(400).json({ error: 'Name and rules are required' });
    const result = await query(
      `INSERT INTO finance_expense_policies
       (organization_id, name, description, rules, violation_action, violation_message, applies_to_teams, applies_to_roles, priority)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [orgId, name, description || null, JSON.stringify(rules), violation_action || 'flag',
       violation_message || null, applies_to_teams || '{}', applies_to_roles || '{}', priority ?? 0],
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('[finance/expense-policies POST]', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to create policy' });
  }
});

router.put('/expense-policies/:id', requireFinanceRole('finance', 'admin'), async (req: ReimbursementRequest, res: Response) => {
  try {
    const orgId = req.organizationId!;
    const sets: string[] = [];
    const params: unknown[] = [];
    let idx = 1;
    const allowed = ['name', 'description', 'rules', 'violation_action', 'violation_message', 'is_active', 'priority'];
    for (const [key, val] of Object.entries(req.body)) {
      if (allowed.includes(key) && val !== undefined) {
        sets.push(`${key} = $${idx++}`);
        params.push(key === 'rules' ? JSON.stringify(val) : val);
      }
    }
    if (sets.length === 0) return res.status(400).json({ error: 'No fields to update' });
    sets.push('updated_at = NOW()');
    params.push(req.params.id, orgId);
    const result = await query(
      `UPDATE finance_expense_policies SET ${sets.join(', ')} WHERE id = $${idx++} AND organization_id = $${idx} RETURNING *`,
      params,
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Policy not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('[finance/expense-policies PUT]', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to update policy' });
  }
});

router.delete('/expense-policies/:id', requireFinanceRole('finance', 'admin'), async (req: ReimbursementRequest, res: Response) => {
  try {
    const orgId = req.organizationId!;
    await query(
      `DELETE FROM finance_expense_policies WHERE id = $1 AND organization_id = $2`,
      [req.params.id, orgId],
    );
    res.json({ success: true });
  } catch (err) {
    console.error('[finance/expense-policies DELETE]', err);
    res.status(500).json({ error: 'Failed to delete policy' });
  }
});

function computeNextDate(current: string, frequency: string): string {
  const d = new Date(current);
  switch (frequency) {
    case 'weekly': d.setDate(d.getDate() + 7); break;
    case 'monthly': d.setMonth(d.getMonth() + 1); break;
    case 'quarterly': d.setMonth(d.getMonth() + 3); break;
    case 'yearly': d.setFullYear(d.getFullYear() + 1); break;
  }
  return d.toISOString().split('T')[0];
}

// ── Sprint 4: Batch Reject ────────────────────────────

router.post('/expenses/bulk-reject', requireFinanceRole('manager', 'finance', 'admin'), async (req: ReimbursementRequest, res: Response) => {
  try {
    const user = req.reimbursementUser!;
    const orgId = req.organizationId!;
    const { expense_ids, reason } = req.body;
    if (!Array.isArray(expense_ids) || !reason) return res.status(400).json({ error: 'expense_ids and reason required' });
    const results = [];
    for (const id of expense_ids) {
      try {
        await expenseService.reject(id, user.id, orgId, reason);
        results.push({ id, success: true });
      } catch (err) {
        results.push({ id, success: false, error: err instanceof Error ? err.message : 'Failed' });
      }
    }
    res.json({ results });
  } catch (err) {
    console.error('[finance/expenses/bulk-reject]', err);
    res.status(500).json({ error: 'Bulk reject failed' });
  }
});

// ── Sprint 4: Budget Expenses ─────────────────────────

router.get('/budgets/:id/expenses', async (req: ReimbursementRequest, res: Response) => {
  try {
    const orgId = req.organizationId!;
    const budget = await budgetSvc.getById(req.params.id, orgId);
    if (!budget) return res.status(404).json({ error: 'Budget not found' });
    const result = await query(
      `SELECT r.*, u.full_name as submitter_name
       FROM reimbursement_requests r
       LEFT JOIN reimbursement_users u ON u.id = r.submitted_by
       WHERE r.organization_id = $1 AND r.is_deleted = FALSE
         AND r.budget_id = $2
       ORDER BY r.created_at DESC LIMIT 100`,
      [orgId, req.params.id],
    );
    res.json(result.rows);
  } catch (err) {
    console.error('[finance/budgets/:id/expenses]', err);
    res.status(500).json({ error: 'Failed to load budget expenses' });
  }
});

// ── Sprint 4: Vendor Transactions ─────────────────────

router.get('/vendors/:id/transactions', async (req: ReimbursementRequest, res: Response) => {
  try {
    const orgId = req.organizationId!;
    const invoices = await query(
      `SELECT * FROM invoices
       WHERE organization_id = $1 AND vendor_id = $2 AND (is_deleted IS NULL OR is_deleted = FALSE)
       ORDER BY created_at DESC LIMIT 50`,
      [orgId, req.params.id],
    );
    const payments = await query(
      `SELECT * FROM finance_payments
       WHERE organization_id = $1 AND vendor_id = $2
       ORDER BY created_at DESC LIMIT 50`,
      [orgId, req.params.id],
    );
    res.json({ invoices: invoices.rows, payments: payments.rows });
  } catch (err) {
    console.error('[finance/vendors/:id/transactions]', err);
    res.status(500).json({ error: 'Failed to load vendor transactions' });
  }
});

router.delete('/vendors/:id', requireFinanceRole('finance', 'admin'), async (req: ReimbursementRequest, res: Response) => {
  try {
    const user = req.reimbursementUser!;
    const orgId = req.organizationId!;
    await vendorService.deactivate(req.params.id, user.id, orgId);
    res.json({ success: true });
  } catch (err) {
    console.error('[finance/vendors DELETE]', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to deactivate vendor' });
  }
});

// ── Sprint 4: Dashboard Activity & Approvals ──────────

router.get('/activity', async (req: ReimbursementRequest, res: Response) => {
  try {
    const orgId = req.organizationId!;
    const limit = parseInt(req.query.limit as string) || 10;
    const expenses = await query(
      `SELECT id, title, original_amount AS amount, status, created_at, 'expense' AS type
       FROM reimbursement_requests WHERE organization_id = $1 AND is_deleted = FALSE
       ORDER BY created_at DESC LIMIT $2`,
      [orgId, limit],
    );
    const invoices = await query(
      `SELECT id, invoice_number AS title, grand_total AS amount, status, created_at, 'invoice' AS type
       FROM invoices WHERE organization_id = $1 AND (is_deleted IS NULL OR is_deleted = FALSE)
       ORDER BY created_at DESC LIMIT $2`,
      [orgId, limit],
    );
    const all = [...expenses.rows, ...invoices.rows]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, limit);
    res.json(all);
  } catch (err) {
    console.error('[finance/activity]', err);
    res.status(500).json({ error: 'Failed to load activity' });
  }
});

router.get('/pending-approvals', async (req: ReimbursementRequest, res: Response) => {
  try {
    const user = req.reimbursementUser!;
    const orgId = req.organizationId!;
    const result = await query(
      `SELECT r.id, r.title, r.original_amount AS amount, u.full_name AS submitted_by_name, r.created_at, 'expense' AS type
       FROM reimbursement_requests r
       LEFT JOIN reimbursement_users u ON u.id = r.submitted_by
       LEFT JOIN approval_steps s ON s.entity_type = 'expense' AND s.entity_id = r.id AND s.status = 'pending'
       WHERE r.organization_id = $1 AND r.is_deleted = FALSE
         AND r.status IN ('submitted', 'pending_approval', 'manager_review')
         AND (s.assigned_to = $2 OR r.submitted_by != $2)
       ORDER BY r.created_at DESC LIMIT 20`,
      [orgId, user.id],
    );
    res.json(result.rows);
  } catch (err) {
    console.error('[finance/pending-approvals]', err);
    res.status(500).json({ error: 'Failed to load pending approvals' });
  }
});

router.delete('/budgets/:id', requireFinanceRole('finance', 'admin'), async (req: ReimbursementRequest, res: Response) => {
  try {
    const orgId = req.organizationId!;
    await query(`DELETE FROM budgets WHERE id = $1 AND organization_id = $2`, [req.params.id, orgId]);
    res.json({ success: true });
  } catch (err) {
    console.error('[finance/budgets DELETE]', err);
    res.status(400).json({ error: 'Failed to delete budget' });
  }
});

// ── Sprint 5: SLA Monitoring ──────────────────────────

router.get('/sla/status/:expenseId', async (req: ReimbursementRequest, res: Response) => {
  try {
    const status = await slaService.getStatusForExpense(req.params.expenseId);
    res.json(status);
  } catch (err) {
    console.error('[finance/sla/status]', err);
    res.status(500).json({ error: 'Failed to get SLA status' });
  }
});

router.get('/sla/metrics', requireFinanceRole('finance', 'admin'), async (req: ReimbursementRequest, res: Response) => {
  try {
    const metrics = await slaService.getSLAMetrics(req.organizationId!);
    res.json(metrics);
  } catch (err) {
    console.error('[finance/sla/metrics]', err);
    res.status(500).json({ error: 'Failed to get SLA metrics' });
  }
});

router.get('/sla/overdue', requireFinanceRole('finance', 'admin'), async (req: ReimbursementRequest, res: Response) => {
  try {
    const overdue = await slaService.getOverdueSteps(req.organizationId!);
    res.json(overdue);
  } catch (err) {
    console.error('[finance/sla/overdue]', err);
    res.status(500).json({ error: 'Failed to get overdue SLAs' });
  }
});

// ── Sprint 5: Dora Insights ──────────────────────────

router.get('/dora/insights', async (req: ReimbursementRequest, res: Response) => {
  try {
    const user = req.reimbursementUser!;
    const orgId = req.organizationId!;
    const insights: Array<{ priority: number; type: string; title: string; message: string; action_url?: string; action_label?: string }> = [];

    const pending = await query(
      `SELECT COUNT(*) as c, COALESCE(SUM(original_amount), 0) as total
       FROM reimbursement_requests
       WHERE organization_id = $1 AND is_deleted = FALSE AND status IN ('submitted', 'manager_review', 'ai_reviewing')`,
      [orgId],
    );
    const pendingCount = parseInt(pending.rows[0]?.c ?? '0');
    const pendingTotal = parseFloat(pending.rows[0]?.total ?? '0');
    if (pendingCount > 0) {
      insights.push({
        priority: 1, type: 'warning',
        title: `${pendingCount} expense${pendingCount > 1 ? 's' : ''} pending`,
        message: `$${pendingTotal.toFixed(0)} total awaiting review.`,
        action_label: 'Review', action_url: '/finance/expenses?status=submitted',
      });
    }

    const overdue = await query(
      `SELECT COUNT(*) as c, COALESCE(SUM(grand_total), 0) as total
       FROM invoices WHERE organization_id = $1 AND status = 'overdue' AND (is_deleted IS NULL OR is_deleted = FALSE)`,
      [orgId],
    );
    const overdueCount = parseInt(overdue.rows[0]?.c ?? '0');
    if (overdueCount > 0) {
      insights.push({
        priority: 2, type: 'warning',
        title: `${overdueCount} overdue invoice${overdueCount > 1 ? 's' : ''}`,
        message: `$${parseFloat(overdue.rows[0]?.total ?? '0').toFixed(0)} outstanding.`,
        action_label: 'View', action_url: '/finance/invoices?status=overdue',
      });
    }

    const budgetAlerts = await query(
      `SELECT department, CASE WHEN allocated_amount > 0 THEN COALESCE(spent_amount,0) / allocated_amount ELSE 0 END AS pct
       FROM budgets WHERE organization_id = $1 AND status = 'active'
       AND allocated_amount > 0 AND COALESCE(spent_amount,0) / allocated_amount >= alert_threshold
       ORDER BY pct DESC LIMIT 3`,
      [orgId],
    );
    for (const b of budgetAlerts.rows) {
      insights.push({
        priority: 3, type: parseFloat(b.pct) >= 1 ? 'warning' : 'info',
        title: `${b.department} budget at ${(parseFloat(b.pct) * 100).toFixed(0)}%`,
        message: 'Consider reviewing spending.',
        action_label: 'View Budgets', action_url: '/finance/budgets',
      });
    }

    if (insights.length === 0) {
      insights.push({
        priority: 10, type: 'success',
        title: 'All clear',
        message: 'No urgent items requiring attention.',
      });
    }

    insights.sort((a, b) => a.priority - b.priority);
    res.json({ insights });
  } catch (err) {
    console.error('[finance/dora/insights]', err);
    res.status(500).json({ error: 'Failed to generate insights' });
  }
});

router.get('/dora/scheduled-jobs/status', requireFinanceRole('admin'), async (req: ReimbursementRequest, res: Response) => {
  try {
    const orgId = req.organizationId!;
    const result = await query(
      `SELECT * FROM finance_dora_job_runs WHERE organization_id = $1 ORDER BY started_at DESC LIMIT 50`,
      [orgId],
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load job status' });
  }
});

// ── Sprint 5: Notification Preferences ───────────────

router.get('/notification-preferences', async (req: ReimbursementRequest, res: Response) => {
  try {
    const user = req.reimbursementUser!;
    const orgId = req.organizationId!;
    const result = await query(
      `SELECT preferences FROM finance_notification_preferences WHERE user_id = $1 AND organization_id = $2`,
      [user.id, orgId],
    );
    res.json(result.rows[0]?.preferences ?? {});
  } catch (err) {
    res.status(500).json({ error: 'Failed to load notification preferences' });
  }
});

router.put('/notification-preferences', async (req: ReimbursementRequest, res: Response) => {
  try {
    const user = req.reimbursementUser!;
    const orgId = req.organizationId!;
    const result = await query(
      `INSERT INTO finance_notification_preferences (user_id, organization_id, preferences)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, organization_id) DO UPDATE SET preferences = $3, updated_at = NOW()
       RETURNING preferences`,
      [user.id, orgId, JSON.stringify(req.body)],
    );
    res.json(result.rows[0]?.preferences ?? {});
  } catch (err) {
    res.status(500).json({ error: 'Failed to update notification preferences' });
  }
});

// ── Sprint 5: Approval Workflow Config ───────────────

router.get('/settings/approval-workflows', async (req: ReimbursementRequest, res: Response) => {
  try {
    const orgId = req.organizationId!;
    const result = await query(
      `SELECT approval_workflow_config FROM finance_settings WHERE organization_id = $1`,
      [orgId],
    );
    res.json(result.rows[0]?.approval_workflow_config ?? []);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load workflows' });
  }
});

router.put('/settings/approval-workflows', requireFinanceRole('finance', 'admin'), async (req: ReimbursementRequest, res: Response) => {
  try {
    const orgId = req.organizationId!;
    const result = await query(
      `UPDATE finance_settings SET approval_workflow_config = $1, updated_at = NOW() WHERE organization_id = $2 RETURNING approval_workflow_config`,
      [JSON.stringify(req.body.workflows ?? []), orgId],
    );
    res.json(result.rows[0]?.approval_workflow_config ?? []);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update workflows' });
  }
});

// ── Sprint 5: Bulk Operations ────────────────────────

router.post('/vendors/bulk-deactivate', requireFinanceRole('finance', 'admin'), async (req: ReimbursementRequest, res: Response) => {
  try {
    const user = req.reimbursementUser!;
    const orgId = req.organizationId!;
    const { vendor_ids } = req.body;
    if (!Array.isArray(vendor_ids)) return res.status(400).json({ error: 'vendor_ids required' });
    const results = [];
    for (const id of vendor_ids) {
      try {
        await vendorService.deactivate(id, user.id, orgId);
        results.push({ id, success: true });
      } catch (err) {
        results.push({ id, success: false, error: err instanceof Error ? err.message : 'Failed' });
      }
    }
    res.json({ results });
  } catch (err) {
    res.status(500).json({ error: 'Bulk deactivate failed' });
  }
});

router.post('/payments/bulk-complete', requireFinanceRole('finance', 'admin'), async (req: ReimbursementRequest, res: Response) => {
  try {
    const user = req.reimbursementUser!;
    const orgId = req.organizationId!;
    const { payment_ids } = req.body;
    if (!Array.isArray(payment_ids)) return res.status(400).json({ error: 'payment_ids required' });
    const results = [];
    for (const id of payment_ids) {
      try {
        await paymentService.complete(id, user.id, orgId);
        results.push({ id, success: true });
      } catch (err) {
        results.push({ id, success: false, error: err instanceof Error ? err.message : 'Failed' });
      }
    }
    res.json({ results });
  } catch (err) {
    res.status(500).json({ error: 'Bulk complete failed' });
  }
});

// ── Sprint 5: Hash Chain Verification ────────────────

router.get('/audit-log/verify-chain', requireFinanceRole('finance', 'admin'), async (req: ReimbursementRequest, res: Response) => {
  try {
    const orgId = req.organizationId!;
    const verification = await auditService.verifyHashChain(orgId, 100);
    res.json(verification);
  } catch (err) {
    res.status(500).json({ error: 'Failed to verify chain' });
  }
});

export { router as financeRouter };
