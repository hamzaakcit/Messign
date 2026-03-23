import { Router } from 'express';

const router = Router();

/** Module liveness for deploy checks and future health aggregation */
router.get('/health', (_req, res) => {
  res.json({ module: 'creative', status: 'ok', sprint: 1 });
});

export default router;
