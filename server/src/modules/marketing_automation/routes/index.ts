import { Router } from 'express';

const router = Router();

router.get('/health', (_req, res) => {
  res.json({ module: 'marketing_automation', status: 'ok', sprint: 1 });
});

export default router;
