import { Router } from 'express';
import multer from 'multer';
import { writeFileSync, mkdirSync, existsSync, unlinkSync, readFileSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { query } from '../../../db/index.js';
import { reimbursementAuth, type ReimbursementRequest } from '../../../middleware/reimbursementAuth.js';
import { extractReceiptData, applyExtractionToReimbursement } from '../../../services/ai/receiptExtractor.js';
import { emitToUser } from '../../../sockets/index.js';
import { getExchangeRate } from '../../../routes/exchangeRates.js';

const router = Router();
const UPLOAD_DIR = process.env.UPLOAD_DIR || join(process.cwd(), 'uploads');

if (!existsSync(UPLOAD_DIR)) {
  mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
});

router.use(reimbursementAuth);

function canViewRequest(user: NonNullable<ReimbursementRequest['reimbursementUser']>, submittedBy: string): boolean {
  if (user.id === submittedBy) return true;
  if (user.role === 'admin' || user.role === 'finance') return true;
  if (user.role === 'manager') {
    return true;
  }
  return false;
}

function canEditRequest(user: NonNullable<ReimbursementRequest['reimbursementUser']>, submittedBy: string): boolean {
  return user.id === submittedBy;
}

// Single source of truth: compute all counts from reimbursement_requests so they match the list.
router.get('/counts', async (req: ReimbursementRequest, res) => {
  const user = req.reimbursementUser!;
  const orgId = req.organizationId!;
  try {
    const stats = await query<{
      pending_count: string;
      pending_total: string;
      under_review_count: string;
      approved_count: string;
      total_paid: string;
    }>(
      `SELECT
         COUNT(*) FILTER (WHERE status IN ('submitted', 'manager_review', 'finance_review')) AS pending_count,
         COALESCE(SUM(converted_amount) FILTER (WHERE status IN ('submitted', 'manager_review', 'finance_review')), 0) AS pending_total,
         COUNT(*) FILTER (WHERE status IN ('manager_review', 'finance_review')) AS under_review_count,
         COUNT(*) FILTER (WHERE status IN ('approved', 'paid')) AS approved_count,
         COALESCE(SUM(converted_amount) FILTER (WHERE status = 'paid'), 0) AS total_paid
       FROM reimbursement_requests
       WHERE organization_id = $1 AND submitted_by = $2`,
      [orgId, user.id]
    );
    const row = stats.rows[0] || {
      pending_count: '0',
      pending_total: '0',
      under_review_count: '0',
      approved_count: '0',
      total_paid: '0',
    };
    res.json({
      myPendingCount: parseInt(row.pending_count, 10) || 0,
      myPendingTotal: parseFloat(row.pending_total) || 0,
      underReviewCount: parseInt(row.under_review_count, 10) || 0,
      approvedThisMonth: parseInt(row.approved_count, 10) || 0,
      totalReimbursedYtd: parseFloat(row.total_paid) || 0,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to get counts' });
  }
});

router.get('/', async (req: ReimbursementRequest, res) => {
  const user = req.reimbursementUser!;
  const orgId = req.organizationId!;
  const status = req.query.status as string | undefined;
  try {
    let sql = `
      SELECT r.id, r.organization_id, r.submitted_by, r.title, r.description, r.category_id,
             r.original_amount, r.original_currency, r.exchange_rate, r.converted_amount,
             r.status, r.expense_date, r.submitted_at, r.created_at, r.updated_at,
             c.name AS category_name, c.icon AS category_icon
      FROM reimbursement_requests r
      JOIN expense_categories c ON c.id = r.category_id
      WHERE r.organization_id = $1 AND r.submitted_by = $2
    `;
    const params: unknown[] = [orgId, user.id];
    if (status) {
      params.push(status);
      sql += ` AND r.status = $${params.length}`;
    }
    sql += ` ORDER BY r.created_at DESC`;
    const result = await query(sql, params);
    res.json(result.rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to list reimbursements' });
  }
});

router.post('/', async (req: ReimbursementRequest, res) => {
  const user = req.reimbursementUser!;
  const orgId = req.organizationId!;
  const { title, description, category_id, original_amount, original_currency, exchange_rate, converted_amount, expense_date } = req.body;
  if (!title || !category_id || original_amount == null || !original_currency || !expense_date) {
    res.status(400).json({ error: 'Missing required fields: title, category_id, original_amount, original_currency, expense_date' });
    return;
  }
  // Validate category_id is a valid UUID
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(category_id)) {
    res.status(400).json({ error: `Invalid category_id format` });
    return;
  }
  try {
    const amount = parseFloat(original_amount);
    const cur = String(original_currency).toUpperCase().slice(0, 3);
    const dateStr = String(expense_date).slice(0, 10);
    let rate: number | null = exchange_rate != null ? parseFloat(exchange_rate) : null;
    let eurAmount: number;
    if (cur === 'EUR') {
      eurAmount = amount;
      rate = 1;
    } else {
      const serverRate = await getExchangeRate(cur, dateStr);
      eurAmount = Math.round(amount * serverRate * 100) / 100;
      rate = serverRate;
    }
    const result = await query(
      `INSERT INTO reimbursement_requests (organization_id, submitted_by, title, description, category_id, original_amount, original_currency, exchange_rate, converted_amount, status, expense_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'draft', $10)
       RETURNING id, organization_id, submitted_by, title, description, category_id, original_amount, original_currency, exchange_rate, converted_amount, status, expense_date, submitted_at, created_at, updated_at`,
      [orgId, user.id, title, description || null, category_id, original_amount, original_currency, rate, eurAmount, expense_date]
    );
    const row = result.rows[0];
    await query(
      `INSERT INTO reimbursement_activity_log (reimbursement_id, user_id, action) VALUES ($1, $2, 'created')`,
      [row.id, user.id]
    );
    res.status(201).json(row);
  } catch (e) {
    console.error('[create reimbursement]', e);
    res.status(500).json({ error: 'Failed to create reimbursement' });
  }
});

// ── Admin: list ALL approved/paid reimbursements across all employees ──
router.get('/admin/all-approved', async (req: ReimbursementRequest, res) => {
  const user = req.reimbursementUser!;
  const orgId = req.organizationId!;
  if (user.role !== 'admin' && user.role !== 'finance') {
    res.status(403).json({ error: 'Admin or finance role required' });
    return;
  }
  try {
    const result = await query(
      `SELECT r.id, r.title, r.description, r.category_id,
              r.original_amount, r.original_currency, r.exchange_rate, r.converted_amount,
              r.status, r.expense_date, r.submitted_at, r.created_at,
              c.name AS category_name,
              u.auth_user_id AS submitter_auth_id,
              u.full_name AS submitter_name
       FROM reimbursement_requests r
       JOIN expense_categories c ON c.id = r.category_id
       JOIN reimbursement_users u ON u.id = r.submitted_by
       WHERE r.organization_id = $1 AND r.status IN ('approved', 'paid')
       ORDER BY r.expense_date DESC`,
      [orgId]
    );
    res.json(result.rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to list approved reimbursements' });
  }
});

router.get('/:id', async (req: ReimbursementRequest, res) => {
  const user = req.reimbursementUser!;
  const { id } = req.params;
  try {
    const result = await query(
      `SELECT r.*, c.name AS category_name, c.icon AS category_icon
       FROM reimbursement_requests r
       JOIN expense_categories c ON c.id = r.category_id
       WHERE r.id = $1`,
      [id]
    );
    const row = result.rows[0];
    if (!row) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    if (!canViewRequest(user, row.submitted_by)) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    const docs = await query(
      `SELECT id, reimbursement_id, document_type, file_name, file_url, file_size_bytes, mime_type, ocr_processed, ocr_vendor_name, ocr_amount, ocr_currency, ocr_date, ocr_confidence_score, signature_status, uploaded_at
       FROM reimbursement_documents WHERE reimbursement_id = $1 ORDER BY uploaded_at`,
      [id]
    );
    const steps = await query(
      `SELECT a.*, u.full_name AS assigned_to_name
       FROM approval_steps a
       LEFT JOIN reimbursement_users u ON u.id = a.assigned_to
       WHERE a.reimbursement_id = $1 ORDER BY a.step_order`,
      [id]
    );
    const activity = await query(
      `SELECT al.id, al.reimbursement_id, al.user_id, al.action, al.action_details, al.created_at, u.full_name AS user_name
       FROM reimbursement_activity_log al
       LEFT JOIN reimbursement_users u ON u.id = al.user_id
       WHERE al.reimbursement_id = $1 ORDER BY al.created_at DESC`,
      [id]
    );
    res.json({ ...row, documents: docs.rows, approval_steps: steps.rows, activity_log: activity.rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to get reimbursement' });
  }
});

router.patch('/:id', async (req: ReimbursementRequest, res) => {
  const user = req.reimbursementUser!;
  const { id } = req.params;
  const { title, description, category_id, original_amount, original_currency, exchange_rate, converted_amount, expense_date } = req.body;
  try {
    const existing = await query(`SELECT * FROM reimbursement_requests WHERE id = $1`, [id]);
    const row = existing.rows[0];
    if (!row) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    if (row.status !== 'draft') {
      res.status(400).json({ error: 'Only drafts can be edited' });
      return;
    }
    if (!canEditRequest(user, row.submitted_by)) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    const updates: string[] = [];
    const params: unknown[] = [];
    let idx = 1;
    const finalAmount = original_amount !== undefined ? original_amount : row.original_amount;
    const finalCurrency = (original_currency !== undefined ? String(original_currency) : String(row.original_currency)).toUpperCase().slice(0, 3);
    const finalDate = (expense_date !== undefined ? String(expense_date) : String(row.expense_date)).slice(0, 10);
    const amountOrDateChanged = original_amount !== undefined || original_currency !== undefined || expense_date !== undefined;
    let resolvedRate = exchange_rate;
    let resolvedConverted = converted_amount;
    if (amountOrDateChanged && finalCurrency !== 'EUR') {
      const rate = await getExchangeRate(finalCurrency, finalDate);
      const amt = parseFloat(finalAmount);
      resolvedRate = rate;
      resolvedConverted = Math.round(amt * rate * 100) / 100;
    } else if (amountOrDateChanged && finalCurrency === 'EUR') {
      resolvedRate = 1;
      resolvedConverted = parseFloat(finalAmount);
    }
    if (title !== undefined) { updates.push(`title = $${idx++}`); params.push(title); }
    if (description !== undefined) { updates.push(`description = $${idx++}`); params.push(description); }
    if (category_id !== undefined) { updates.push(`category_id = $${idx++}`); params.push(category_id); }
    if (original_amount !== undefined) { updates.push(`original_amount = $${idx++}`); params.push(original_amount); }
    if (original_currency !== undefined) { updates.push(`original_currency = $${idx++}`); params.push(original_currency); }
    if (resolvedRate !== undefined) { updates.push(`exchange_rate = $${idx++}`); params.push(resolvedRate); }
    if (resolvedConverted !== undefined) { updates.push(`converted_amount = $${idx++}`); params.push(resolvedConverted); }
    if (expense_date !== undefined) { updates.push(`expense_date = $${idx++}`); params.push(expense_date); }
    if (updates.length === 0) {
      const get = await query(`SELECT * FROM reimbursement_requests WHERE id = $1`, [id]);
      return res.json(get.rows[0]);
    }
    updates.push(`updated_at = NOW()`);
    params.push(id);
    const result = await query(
      `UPDATE reimbursement_requests SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`,
      params
    );
    res.json(result.rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to update reimbursement' });
  }
});

router.delete('/:id', async (req: ReimbursementRequest, res) => {
  const user = req.reimbursementUser!;
  const { id } = req.params;
  try {
    const existing = await query(`SELECT id, submitted_by, status FROM reimbursement_requests WHERE id = $1`, [id]);
    const row = existing.rows[0];
    if (!row) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    if (row.status !== 'draft') {
      res.status(400).json({ error: 'Only drafts can be deleted' });
      return;
    }
    if (!canEditRequest(user, row.submitted_by)) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    await query(`DELETE FROM reimbursement_requests WHERE id = $1`, [id]);
    res.status(204).send();
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to delete reimbursement' });
  }
});

router.post('/:id/submit', async (req: ReimbursementRequest, res) => {
  const user = req.reimbursementUser!;
  const { id } = req.params;
  try {
    const existing = await query(
      `SELECT r.id, r.submitted_by, r.status, r.organization_id, u.manager_id
       FROM reimbursement_requests r
       JOIN reimbursement_users u ON u.id = r.submitted_by
       WHERE r.id = $1`,
      [id]
    );
    const row = existing.rows[0];
    if (!row) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    if (row.status !== 'draft') {
      res.status(400).json({ error: 'Only drafts can be submitted' });
      return;
    }
    if (row.submitted_by !== user.id) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    const managerId = row.manager_id;
    const financeUser = await query(
      `SELECT id FROM reimbursement_users WHERE organization_id = $1 AND role IN ('finance', 'admin') ORDER BY role = 'admin' DESC LIMIT 1`,
      [row.organization_id]
    );
    const financeId = financeUser.rows[0]?.id ?? null;
    const autoApproveBelow = await query(
      `SELECT auto_approve_below FROM reimbursement_settings WHERE organization_id = $1`,
      [row.organization_id]
    );
    const threshold = autoApproveBelow.rows[0]?.auto_approve_below;
    const amountResult = await query(`SELECT converted_amount, original_amount FROM reimbursement_requests WHERE id = $1`, [id]);
    const amount = parseFloat(amountResult.rows[0]?.converted_amount ?? amountResult.rows[0]?.original_amount ?? '0');
    let nextStatus = 'manager_review';
    if (threshold != null && amount <= parseFloat(threshold) && !managerId) {
      nextStatus = 'finance_review';
    } else if (threshold != null && amount <= parseFloat(threshold) && managerId) {
      nextStatus = 'manager_review';
    }
    await query(
      `UPDATE reimbursement_requests SET status = $1, submitted_at = NOW(), updated_at = NOW() WHERE id = $2`,
      [nextStatus, id]
    );
    const step1Assigned = nextStatus === 'manager_review' ? managerId : null;
    await query(
      `INSERT INTO approval_steps (reimbursement_id, step_order, step_type, assigned_to, status) VALUES ($1, 1, 'manager_approval', $2, $3)`,
      [id, step1Assigned, step1Assigned ? 'pending' : 'skipped']
    );
    await query(
      `INSERT INTO approval_steps (reimbursement_id, step_order, step_type, assigned_to, status) VALUES ($1, 2, 'finance_approval', $2, 'pending')`,
      [id, financeId]
    );
    await query(
      `INSERT INTO reimbursement_activity_log (reimbursement_id, user_id, action) VALUES ($1, $2, 'submitted')`,
      [id, user.id]
    );
    const updated = await query(`SELECT * FROM reimbursement_requests WHERE id = $1`, [id]);
    res.json(updated.rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to submit' });
  }
});

router.post('/:id/documents', upload.single('file'), async (req: ReimbursementRequest, res) => {
  const user = req.reimbursementUser!;
  const { id } = req.params;
  const file = (req as any).file;
  console.log(`[upload] POST /${id}/documents — file present: ${!!file}, contentType: ${req.headers['content-type']?.slice(0, 40)}`);
  if (!file) {
    console.log('[upload] No file found in request. Body keys:', Object.keys(req.body || {}));
    res.status(400).json({ error: 'No file uploaded' });
    return;
  }
  const document_type = (req.body.document_type as string) || 'receipt';
  try {
    // Validate that id looks like a UUID before querying
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      res.status(400).json({ error: `Invalid reimbursement ID format: "${id}"` });
      return;
    }
    const existing = await query(`SELECT id, submitted_by, status FROM reimbursement_requests WHERE id = $1`, [id]);
    const row = existing.rows[0];
    if (!row) {
      res.status(404).json({ error: 'Reimbursement not found' });
      return;
    }
    if (!canEditRequest(user, row.submitted_by) || row.status !== 'draft') {
      res.status(403).json({ error: 'Forbidden or request is not draft' });
      return;
    }
    const ext = file.originalname?.split('.').pop() || 'bin';
    const filename = `${randomUUID()}.${ext}`;
    const filePath = join(UPLOAD_DIR, filename);
    writeFileSync(filePath, file.buffer);
    const fileUrl = `/uploads/${filename}`;
    const docResult = await query(
      `INSERT INTO reimbursement_documents (reimbursement_id, document_type, file_name, file_url, file_size_bytes, mime_type)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, reimbursement_id, document_type, file_name, file_url, file_size_bytes, mime_type, ocr_processed, ocr_vendor_name, ocr_amount, ocr_currency, ocr_date, uploaded_at`,
      [id, document_type, file.originalname || filename, fileUrl, file.size, file.mimetype || null]
    );
    await query(
      `INSERT INTO reimbursement_activity_log (reimbursement_id, user_id, action, action_details) VALUES ($1, $2, 'document_uploaded', $3)`,
      [id, user.id, JSON.stringify({ document_type, file_name: file.originalname })]
    );
    console.log(`[upload] Success: doc ${docResult.rows[0]?.id} for reimbursement ${id}`);
    res.status(201).json(docResult.rows[0]);
  } catch (e) {
    console.error('[upload] Error:', e);
    res.status(500).json({ error: 'Failed to upload document' });
  }
});

router.delete('/:id/documents/:docId', async (req: ReimbursementRequest, res) => {
  const user = req.reimbursementUser!;
  const { id, docId } = req.params;
  try {
    const existing = await query(`SELECT id, submitted_by, status FROM reimbursement_requests WHERE id = $1`, [id]);
    const row = existing.rows[0];
    if (!row) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    if (!canEditRequest(user, row.submitted_by) || row.status !== 'draft') {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    const doc = await query(`SELECT id, file_url FROM reimbursement_documents WHERE id = $1 AND reimbursement_id = $2`, [docId, id]);
    if (!doc.rows[0]) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }
    const filePath = join(UPLOAD_DIR, doc.rows[0].file_url.replace('/uploads/', ''));
    if (existsSync(filePath)) unlinkSync(filePath);
    await query(`DELETE FROM reimbursement_documents WHERE id = $1`, [docId]);
    res.status(204).send();
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to delete document' });
  }
});

router.post('/:id/documents/:docId/ocr', async (req: ReimbursementRequest, res) => {
  const user = req.reimbursementUser!;
  const orgId = req.organizationId ?? 'system';
  const { id, docId } = req.params;
  try {
    const existing = await query(`SELECT id, submitted_by, status FROM reimbursement_requests WHERE id = $1`, [id]);
    const row = existing.rows[0];
    if (!row) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    if (!canEditRequest(user, row.submitted_by) || row.status !== 'draft') {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    const doc = await query(
      `SELECT id, file_url, mime_type FROM reimbursement_documents WHERE id = $1 AND reimbursement_id = $2`,
      [docId, id]
    );
    if (!doc.rows[0]) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }
    const fileUrl = doc.rows[0].file_url;
    const mimeType = doc.rows[0].mime_type || 'image/jpeg';
    const filename = fileUrl.replace(/^\/uploads\//, '');
    const filePath = join(UPLOAD_DIR, filename);
    if (!existsSync(filePath)) {
      res.status(404).json({ error: 'File not found on disk' });
      return;
    }
    const buffer = readFileSync(filePath);
    const base64 = buffer.toString('base64');
    const mediaType = mimeType.startsWith('image/') ? mimeType : 'image/jpeg';
    const extraction = await extractReceiptData(base64, mediaType, { tenantId: orgId });
    await query(
      `UPDATE reimbursement_documents SET
       ocr_processed = TRUE, ocr_vendor_name = $1, ocr_amount = $2, ocr_currency = $3, ocr_date = $4,
       ocr_confidence_score = $5, ocr_raw_response = $6
       WHERE id = $7`,
      [
        extraction.vendor_name ?? null,
        extraction.amount ?? null,
        extraction.currency ?? null,
        extraction.date ?? null,
        extraction.confidence,
        JSON.stringify(extraction.raw_extraction),
        docId,
      ]
    );
    await applyExtractionToReimbursement(id, extraction);

    if (extraction.confidence >= 0.85) {
      try {
        const submitter = await query<{ manager_id: string; full_name: string; auth_user_id: string }>(
          `SELECT ru.manager_id, ru.full_name, m.auth_user_id
           FROM reimbursement_users ru
           LEFT JOIN reimbursement_users m ON m.id = ru.manager_id
           WHERE ru.id = $1`,
          [user.id],
        );
        const managerAuthId = submitter.rows[0]?.auth_user_id;
        if (managerAuthId) {
          emitToUser(managerAuthId, 'dora_notification', {
            type: 'receipt_extraction',
            title: 'Receipt Ready for Review',
            message: `Dora AI extracted a high-confidence receipt from ${user.fullName}: ${extraction.vendor_name || 'Unknown vendor'} — ${extraction.currency || ''} ${extraction.amount ?? 'N/A'} (${(extraction.confidence * 100).toFixed(0)}% confidence)`,
            reimbursementId: id,
            confidence: extraction.confidence,
          });
        }
      } catch (notifyErr) {
        console.error('[OCR] Failed to notify manager:', notifyErr);
      }
    }

    const updated = await query(
      `SELECT id, reimbursement_id, document_type, file_name, file_url, ocr_processed, ocr_vendor_name, ocr_amount, ocr_currency, ocr_date, ocr_confidence_score, uploaded_at
       FROM reimbursement_documents WHERE id = $1`,
      [docId]
    );
    res.json({ ...updated.rows[0], ai_extraction: extraction });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'OCR failed' });
  }
});

router.get('/:id/comments', async (req: ReimbursementRequest, res) => {
  const user = req.reimbursementUser!;
  const { id } = req.params;
  try {
    const reqRow = await query(`SELECT id, submitted_by FROM reimbursement_requests WHERE id = $1`, [id]);
    if (!reqRow.rows[0]) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    if (!canViewRequest(user, reqRow.rows[0].submitted_by)) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    const showInternal = user.role === 'finance' || user.role === 'admin';
    const sql = showInternal
      ? `SELECT c.*, u.full_name AS author_name FROM reimbursement_comments c JOIN reimbursement_users u ON u.id = c.user_id WHERE c.reimbursement_id = $1 ORDER BY c.created_at`
      : `SELECT c.*, u.full_name AS author_name FROM reimbursement_comments c JOIN reimbursement_users u ON u.id = c.user_id WHERE c.reimbursement_id = $1 AND c.is_internal = FALSE ORDER BY c.created_at`;
    const result = await query(sql, [id]);
    res.json(result.rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to list comments' });
  }
});

router.post('/:id/comments', async (req: ReimbursementRequest, res) => {
  const user = req.reimbursementUser!;
  const { id } = req.params;
  const { comment_text, is_internal } = req.body;
  if (!comment_text || typeof comment_text !== 'string') {
    res.status(400).json({ error: 'comment_text required' });
    return;
  }
  const internal = user.role === 'finance' || user.role === 'admin' ? (is_internal === true) : false;
  try {
    const reqRow = await query(`SELECT id, submitted_by FROM reimbursement_requests WHERE id = $1`, [id]);
    if (!reqRow.rows[0]) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    if (!canViewRequest(user, reqRow.rows[0].submitted_by)) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    const result = await query(
      `INSERT INTO reimbursement_comments (reimbursement_id, user_id, comment_text, is_internal)
       VALUES ($1, $2, $3, $4)
       RETURNING id, reimbursement_id, user_id, comment_text, is_internal, created_at, updated_at`,
      [id, user.id, comment_text.trim(), internal]
    );
    await query(
      `INSERT INTO reimbursement_activity_log (reimbursement_id, user_id, action) VALUES ($1, $2, 'commented')`,
      [id, user.id]
    );
    res.status(201).json(result.rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to add comment' });
  }
});

export const reimbursementsRouter = router;
