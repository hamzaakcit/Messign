import { Router } from 'express';
import multer from 'multer';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type { Response } from 'express';
import { query } from '../../db/index.js';
import { type ReimbursementRequest } from '../../middleware/reimbursementAuth.js';
import { requireFinanceRole } from '../../middleware/financeRbac.js';
import { expenseService } from '../../services/finance/expenseService.js';
import { extractReceiptData } from '../../services/ai/receiptExtractor.js';

const router = Router();

const RECEIPT_DIR = path.join(process.cwd(), 'uploads', 'finance', 'receipts');
if (!fs.existsSync(RECEIPT_DIR)) {
  fs.mkdirSync(RECEIPT_DIR, { recursive: true });
}

const receiptUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];
    cb(null, allowed.includes(file.mimetype));
  },
});

router.post('/', async (req: ReimbursementRequest, res: Response) => {
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

router.get('/', async (req: ReimbursementRequest, res: Response) => {
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

router.get('/check-duplicate', async (req: ReimbursementRequest, res: Response) => {
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

router.get('/:id', async (req: ReimbursementRequest, res: Response) => {
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

router.put('/:id', async (req: ReimbursementRequest, res: Response) => {
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

router.delete('/:id', async (req: ReimbursementRequest, res: Response) => {
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

router.post('/:id/submit', async (req: ReimbursementRequest, res: Response) => {
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

router.post('/:id/approve', requireFinanceRole('manager', 'finance', 'admin'), async (req: ReimbursementRequest, res: Response) => {
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

router.post('/:id/mark-paid', requireFinanceRole('finance', 'admin'), async (req: ReimbursementRequest, res: Response) => {
  try {
    const user = req.reimbursementUser!;
    const orgId = req.organizationId!;
    const result = await expenseService.markPaid(req.params.id, user.id, orgId, req.body.notes);
    res.json(result);
  } catch (err) {
    console.error('[finance/expenses/:id/mark-paid]', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to mark expense as paid' });
  }
});

router.post('/:id/reject', requireFinanceRole('manager', 'finance', 'admin'), async (req: ReimbursementRequest, res: Response) => {
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

router.post('/bulk-approve', requireFinanceRole('manager', 'finance', 'admin'), async (req: ReimbursementRequest, res: Response) => {
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

router.post('/bulk-reject', requireFinanceRole('manager', 'finance', 'admin'), async (req: ReimbursementRequest, res: Response) => {
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

router.post('/:id/receipts', receiptUpload.single('receipt'), async (req: ReimbursementRequest, res: Response) => {
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

router.post('/:id/receipts/:docId/ocr', async (req: ReimbursementRequest, res: Response) => {
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

router.post('/:id/comments', async (req: ReimbursementRequest, res: Response) => {
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

router.post('/:id/request-info', requireFinanceRole('manager', 'finance', 'admin'), async (req: ReimbursementRequest, res: Response) => {
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

router.post('/:id/dora-feedback', async (req: ReimbursementRequest, res: Response) => {
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

const categoriesRouter = Router();
categoriesRouter.get('/', async (req: ReimbursementRequest, res: Response) => {
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

export { categoriesRouter };
export default router;
