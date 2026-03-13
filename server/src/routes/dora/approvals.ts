import { Router } from 'express';
import { reimbursementAuth, type ReimbursementRequest } from '../../middleware/reimbursementAuth.js';
import { handleApprovalDecision } from '../../services/ai/agents/approvalFlow.js';

const router = Router();

router.use(reimbursementAuth);

router.post('/approvals/:approvalId/decide', async (req: ReimbursementRequest, res) => {
  const { approvalId } = req.params;
  const approved = req.body?.approved === true;
  const authUserId = req.reimbursementUser?.authUserId;

  if (!authUserId) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  if (typeof approvalId !== 'string' || !approvalId) {
    res.status(400).json({ error: 'Missing approval ID' });
    return;
  }

  try {
    const outcome = await handleApprovalDecision(approvalId, approved, authUserId);

    if (!outcome.success) {
      res.status(404).json({ error: 'Approval not found or already processed' });
      return;
    }

    res.json({ success: true, result: outcome.result });
  } catch (err) {
    console.error('[dora/approvals] decide failed', err);
    res.status(500).json({ error: 'Failed to process approval decision' });
  }
});

export default router;
