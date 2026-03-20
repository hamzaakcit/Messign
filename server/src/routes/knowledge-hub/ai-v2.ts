import { Router, type Request, type Response } from 'express';
import { query } from '../../db/index.js';
import { aiAnswerRateLimit } from '../../middleware/aiRateLimit.js';
import { validateAIAnswerInput } from '../../middleware/aiInputValidation.js';
import { agentTraceMiddleware } from '../../middleware/agentContext.js';
import { attachFeedback } from '../../services/ai/telemetry/service.js';
import { runPipelineHandler } from '../../services/ai/v2/pipeline.js';

const router = Router();
router.use(agentTraceMiddleware);

type AuthReq = Request & { userId: string; role?: string };

router.post('/answer', validateAIAnswerInput, aiAnswerRateLimit, (req, res) => {
  void runPipelineHandler(req, res);
});

router.post('/confirm-action', (_req: Request, res: Response) => {
  res.status(501).json({
    error: 'Not implemented',
    hint: 'Use POST /api/ai/actions/confirm and /api/ai/actions/cancel for action confirmation.',
  });
});

router.post('/feedback', async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthReq).userId;
    await query(
      `INSERT INTO knowledge_ai_feedback (user_id, query, answer, source_document_ids, is_helpful) VALUES ($1,$2,$3,$4,$5)`,
      [userId, req.body.query, req.body.answer, req.body.sourceDocumentIds ?? [], req.body.isHelpful],
    );

    attachFeedback(
      req.body.telemetryId || null,
      req.body.isHelpful ? 'up' : 'down',
      req.body.comment || null,
      userId,
      req.body.query,
    ).catch((err) =>
      console.error('[ai-v2] attachFeedback failed', { error: err instanceof Error ? err.message : String(err) }),
    );

    res.json({ ok: true });
  } catch (e) {
    console.error('[ai-v2] feedback:', e);
    res.status(500).json({ error: 'Failed to save feedback' });
  }
});

export default router;
