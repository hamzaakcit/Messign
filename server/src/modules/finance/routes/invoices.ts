import { Router } from 'express';
import multer from 'multer';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import type { Response } from 'express';
import { query } from '../../../db/index.js';
import { type ReimbursementRequest } from '../../../middleware/reimbursementAuth.js';
import { requireFinanceRole } from '../../../middleware/financeRbac.js';
import { invoiceService, type CreateInvoiceInput } from '../../../services/finance/invoiceService.js';
import { auditService } from '../../../services/finance/auditService.js';
import { extractInvoiceData } from '../../../services/ai/invoiceExtractor.js';
import { generateFinanceInvoicePdf } from '../../../services/finance/financePdfService.js';

const router = Router();

const INVOICE_DOC_DIR = path.join(process.cwd(), 'uploads', 'finance', 'invoices');
await mkdir(INVOICE_DOC_DIR, { recursive: true });

const receiptUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];
    cb(null, allowed.includes(file.mimetype));
  },
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

router.get('/invoices-stats', async (req: ReimbursementRequest, res: Response) => {
  try {
    const stats = await invoiceService.getStats(req.organizationId!);
    res.json(stats);
  } catch (err) {
    console.error('[finance/invoices-stats]', err);
    res.status(500).json({ error: 'Failed to get invoice stats' });
  }
});

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

router.post('/invoices/scan', receiptUpload.single('document'), async (req: ReimbursementRequest, res: Response) => {
  try {
    const orgId = req.organizationId!;
    const userId = req.reimbursementUser!.id;
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'No document file provided' });

    const ext = path.extname(file.originalname) || '.jpg';
    const fileName = `invoice_scan_${Date.now()}${ext}`;
    const filePath = path.join(INVOICE_DOC_DIR, fileName);
    await writeFile(filePath, file.buffer);

    const base64 = file.buffer.toString('base64');
    const mediaType = file.mimetype || 'image/jpeg';

    let extraction;
    try {
      extraction = await extractInvoiceData(base64, mediaType, { tenantId: orgId });
    } catch (aiErr) {
      const errMsg = aiErr instanceof Error ? aiErr.message : 'AI extraction failed';
      console.error('[finance/invoices/scan] AI error:', errMsg);
      return res.status(503).json({ error: errMsg });
    }

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
    }).catch((err) => console.error('[invoices] Background task failed', { error: err instanceof Error ? err.message : String(err) }));

    res.json({ extraction });
  } catch (err) {
    console.error('[finance/invoices/scan]', err);
    res.status(500).json({ error: 'Failed to scan invoice document' });
  }
});

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
    const newInvoice = await invoiceService.create(cloneData as unknown as CreateInvoiceInput, user.id, orgId);
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

export default router;
