import { Router } from 'express';
import type { Response } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type { ReimbursementRequest } from '../../middleware/reimbursementAuth.js';
import * as contractsDal from '../../dal/contracts/contracts.js';
import { extractTextFromFile } from '../../services/pdfTextExtractor.js';
import { buildCtx, parsePositiveInt, parseSort } from './common.js';

const router = Router();
const CONTRACT_DIR = path.join(process.cwd(), 'uploads', 'contracts');
if (!fs.existsSync(CONTRACT_DIR)) {
  fs.mkdirSync(CONTRACT_DIR, { recursive: true });
}

const contractUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
      'text/plain',
    ];
    cb(null, allowed.includes(file.mimetype));
  },
});

router.post('/', async (req: ReimbursementRequest, res: Response) => {
  try {
    if (!req.body?.title || !req.body?.type || !req.body?.counterparty_name) {
      res.status(400).json({ error: 'title, type and counterparty_name are required' });
      return;
    }
    const contract = await contractsDal.createContract(buildCtx(req), req.body);
    res.status(201).json(contract);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to create contract' });
  }
});

router.get('/', async (req: ReimbursementRequest, res: Response) => {
  try {
    const result = await contractsDal.listContracts(
      buildCtx(req),
      {
        status: req.query.status as string | undefined,
        type: req.query.type as string | undefined,
        counterpartyName: req.query.counterpartyName as string | undefined,
        renewalStatus: req.query.renewalStatus as string | undefined,
        dateRange: {
          from: req.query.from as string | undefined,
          to: req.query.to as string | undefined,
        },
        search: req.query.search as string | undefined,
      },
      parseSort(req.query.sortBy, req.query.sortDir, {
        title: 'title',
        type: 'type',
        status: 'status',
        endDate: 'end_date',
        value: 'total_value',
        createdAt: 'created_at',
      }),
      parsePositiveInt(req.query.page, 1),
      parsePositiveInt(req.query.pageSize, 20),
    );
    res.json(result);
  } catch {
    res.status(500).json({ error: 'Failed to list contracts' });
  }
});

router.get('/expiring', async (req: ReimbursementRequest, res: Response) => {
  try {
    const withinDays = req.query.withinDays ? Number(req.query.withinDays) : 90;
    const result = await contractsDal.getExpiringContracts(buildCtx(req), withinDays);
    res.json(result);
  } catch {
    res.status(500).json({ error: 'Failed to get expiring contracts' });
  }
});

router.get('/metrics', async (req: ReimbursementRequest, res: Response) => {
  try {
    const result = await contractsDal.getContractMetrics(buildCtx(req));
    res.json(result);
  } catch {
    res.status(500).json({ error: 'Failed to load contract metrics' });
  }
});

router.get('/:id', async (req: ReimbursementRequest, res: Response) => {
  try {
    const contract = await contractsDal.getContractById(buildCtx(req), req.params.id);
    if (!contract) {
      res.status(404).json({ error: 'Contract not found' });
      return;
    }
    res.json(contract);
  } catch {
    res.status(500).json({ error: 'Failed to load contract' });
  }
});

router.put('/:id', async (req: ReimbursementRequest, res: Response) => {
  try {
    const contract = await contractsDal.updateContract(buildCtx(req), req.params.id, req.body);
    res.json(contract);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to update contract' });
  }
});

router.post('/:id/activate', async (req: ReimbursementRequest, res: Response) => {
  try {
    const contract = await contractsDal.activateContract(buildCtx(req), req.params.id);
    res.json(contract);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to activate contract' });
  }
});

router.post('/:id/terminate', async (req: ReimbursementRequest, res: Response) => {
  try {
    const reason = req.body?.reason ?? 'Terminated';
    const effectiveDate = req.body?.effectiveDate ?? new Date().toISOString().slice(0, 10);
    const contract = await contractsDal.terminateContract(buildCtx(req), req.params.id, reason, effectiveDate);
    res.json(contract);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to terminate contract' });
  }
});

router.post('/:id/renew', async (req: ReimbursementRequest, res: Response) => {
  try {
    if (!req.body?.newEndDate) {
      res.status(400).json({ error: 'newEndDate is required' });
      return;
    }
    const contract = await contractsDal.renewContract(buildCtx(req), req.params.id, req.body.newEndDate, req.body.newValue);
    res.json(contract);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to renew contract' });
  }
});

router.post('/:id/extract-terms', async (req: ReimbursementRequest, res: Response) => {
  try {
    const contract = await contractsDal.extractTermsWithAI(buildCtx(req), req.params.id);
    res.json(contract);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to extract terms' });
  }
});

router.post('/:id/upload-document', contractUpload.single('document'), async (req: ReimbursementRequest, res: Response) => {
  try {
    const file = (req as ReimbursementRequest & { file?: Express.Multer.File }).file;
    if (!file) {
      res.status(400).json({ error: 'No document uploaded' });
      return;
    }
    const ext = path.extname(file.originalname) || '.pdf';
    const digest = crypto.createHash('sha1').update(file.buffer).digest('hex').slice(0, 12);
    const fileName = `${req.params.id}_${Date.now()}_${digest}${ext}`;
    const filePath = path.join(CONTRACT_DIR, fileName);
    fs.writeFileSync(filePath, file.buffer);
    const documentUrl = `/uploads/contracts/${fileName}`;
    const extractedText = await extractTextFromFile(filePath);
    const contract = await contractsDal.updateContract(buildCtx(req), req.params.id, {
      document_url: documentUrl,
      document_text: extractedText,
    });
    res.status(201).json(contract);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to upload contract document' });
  }
});

export default router;
