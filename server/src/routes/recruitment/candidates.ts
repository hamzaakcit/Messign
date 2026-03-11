import { Router } from 'express';
import type { Response } from 'express';
import multer from 'multer';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type { ReimbursementRequest } from '../../middleware/reimbursementAuth.js';
import * as candidatesDal from '../../dal/recruitment/candidates.js';
import { extractTextFromFile } from '../../services/pdfTextExtractor.js';
import { buildCtx, parsePositiveInt, parseSort } from './common.js';

const router = Router();
const RESUME_DIR = path.join(process.cwd(), 'uploads', 'recruitment', 'resumes');

if (!fs.existsSync(RESUME_DIR)) {
  fs.mkdirSync(RESUME_DIR, { recursive: true });
}

const resumeUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
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
    if (!req.body?.first_name || !req.body?.email) {
      res.status(400).json({ error: 'First name and email are required' });
      return;
    }
    const candidate = await candidatesDal.createCandidate(buildCtx(req), req.body);
    res.status(201).json(candidate);
  } catch (error) {
    console.error('[recruitment/candidates POST]', error);
    res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to create candidate' });
  }
});

router.get('/', async (req: ReimbursementRequest, res: Response) => {
  try {
    const result = await candidatesDal.listCandidates(
      buildCtx(req),
      {
        source: req.query.source as string | undefined,
        search: req.query.search as string | undefined,
      },
      parseSort(req.query.sortBy, req.query.sortDir, {
        name: 'name',
        email: 'email',
        source: 'source',
        createdAt: 'created_at',
      }),
      parsePositiveInt(req.query.page, 1),
      parsePositiveInt(req.query.pageSize, 20),
    );
    res.json(result);
  } catch (error) {
    console.error('[recruitment/candidates GET]', error);
    res.status(500).json({ error: 'Failed to list candidates' });
  }
});

router.get('/search', async (req: ReimbursementRequest, res: Response) => {
  try {
    const search = (req.query.q as string | undefined) ?? '';
    const candidates = await candidatesDal.searchCandidates(buildCtx(req), search, parsePositiveInt(req.query.limit, 20));
    res.json(candidates);
  } catch (error) {
    console.error('[recruitment/candidates/search GET]', error);
    res.status(500).json({ error: 'Failed to search candidates' });
  }
});

router.get('/:id', async (req: ReimbursementRequest, res: Response) => {
  try {
    const candidate = await candidatesDal.getCandidateById(buildCtx(req), req.params.id);
    if (!candidate) {
      res.status(404).json({ error: 'Candidate not found' });
      return;
    }
    res.json(candidate);
  } catch (error) {
    console.error('[recruitment/candidates/:id GET]', error);
    res.status(500).json({ error: 'Failed to load candidate' });
  }
});

router.put('/:id', async (req: ReimbursementRequest, res: Response) => {
  try {
    const candidate = await candidatesDal.updateCandidate(buildCtx(req), req.params.id, req.body);
    res.json(candidate);
  } catch (error) {
    console.error('[recruitment/candidates/:id PUT]', error);
    res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to update candidate' });
  }
});

router.post('/:id/resume', resumeUpload.single('resume'), async (req: ReimbursementRequest, res: Response) => {
  try {
    const file = (req as ReimbursementRequest & { file?: Express.Multer.File }).file;
    if (!file) {
      res.status(400).json({ error: 'No resume uploaded' });
      return;
    }
    const candidate = await candidatesDal.getCandidateById(buildCtx(req), req.params.id);
    if (!candidate) {
      res.status(404).json({ error: 'Candidate not found' });
      return;
    }
    const ext = path.extname(file.originalname) || '.pdf';
    const digest = crypto.createHash('sha1').update(file.buffer).digest('hex').slice(0, 12);
    const fileName = `${candidate.id}_${Date.now()}_${digest}${ext}`;
    const filePath = path.join(RESUME_DIR, fileName);
    fs.writeFileSync(filePath, file.buffer);
    const resumeUrl = `/uploads/recruitment/resumes/${fileName}`;
    const extractedText = await extractTextFromFile(filePath);
    const updated = await candidatesDal.persistParsedResume(buildCtx(req), candidate.id, {
      resume_url: resumeUrl,
      resume_file_name: file.originalname,
      resume_text: extractedText,
    });
    res.status(201).json(updated);
  } catch (error) {
    console.error('[recruitment/candidates/:id/resume POST]', error);
    res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to upload resume' });
  }
});

export default router;
