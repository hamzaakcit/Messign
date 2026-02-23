import { Router, Request, Response } from 'express';
import multer from 'multer';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const UPLOAD_BASE = process.env.UPLOAD_DIR || join(process.cwd(), 'uploads');
const KNOWLEDGE_DIR = join(UPLOAD_BASE, 'knowledge');
const IMAGES_DIR = join(KNOWLEDGE_DIR, 'images');
const FILES_DIR = join(KNOWLEDGE_DIR, 'files');
const COVERS_DIR = join(KNOWLEDGE_DIR, 'covers');

for (const dir of [KNOWLEDGE_DIR, IMAGES_DIR, FILES_DIR, COVERS_DIR]) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

const imageStorage = multer.diskStorage({
  destination: IMAGES_DIR,
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});

const fileStorage = multer.diskStorage({
  destination: FILES_DIR,
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});

const coverStorage = multer.diskStorage({
  destination: COVERS_DIR,
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});

const uploadImage = multer({ storage: imageStorage, limits: { fileSize: 10 * 1024 * 1024 } });
const uploadFile = multer({ storage: fileStorage, limits: { fileSize: 50 * 1024 * 1024 } });
const uploadCover = multer({ storage: coverStorage, limits: { fileSize: 5 * 1024 * 1024 } });

export const uploadRouter = Router();

uploadRouter.post('/image', uploadImage.single('file'), (req: Request, res: Response) => {
  if (!req.file) { res.status(400).json({ error: 'No file uploaded' }); return; }
  const url = `/uploads/knowledge/images/${req.file.filename}`;
  res.json({ url });
});

uploadRouter.post('/file', uploadFile.single('file'), (req: Request, res: Response) => {
  if (!req.file) { res.status(400).json({ error: 'No file uploaded' }); return; }
  const url = `/uploads/knowledge/files/${req.file.filename}`;
  res.json({ id: req.file.filename, url, fileName: req.file.originalname, fileType: req.file.mimetype, fileSize: req.file.size });
});

uploadRouter.post('/cover', uploadCover.single('file'), (req: Request, res: Response) => {
  if (!req.file) { res.status(400).json({ error: 'No file uploaded' }); return; }
  const url = `/uploads/knowledge/covers/${req.file.filename}`;
  res.json({ url });
});
