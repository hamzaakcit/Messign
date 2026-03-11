import { Router, Request, Response } from 'express';
import { validateAndConsume, cancelAction, expireStaleActions } from './actionStore.js';
import { executeConfirmedAction } from './actionExecutor.js';
import type { ConfirmActionRequest } from './types.js';
import { query } from '../../../db/index.js';

const router = Router();
type AuthReq = Request & { userId: string; role?: string };

router.post('/confirm', async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthReq).userId;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Authentication required.' });
      return;
    }

    const { actionToken, payload } = req.body as ConfirmActionRequest;

    if (!actionToken || typeof actionToken !== 'string') {
      res.status(400).json({ success: false, message: 'Missing or invalid actionToken.' });
      return;
    }
    if (!payload || typeof payload !== 'object') {
      res.status(400).json({ success: false, message: 'Missing or invalid payload.' });
      return;
    }

    const validation = await validateAndConsume(actionToken, userId, payload);

    if (!validation.valid || !validation.action) {
      const statusCode = validation.error?.includes('expired') ? 410 : 403;
      res.status(statusCode).json({
        success: false,
        message: validation.error || 'Action could not be validated.',
      });
      return;
    }

    const actorLookup = await query<{ id: string; organization_id: string }>(
      `SELECT id::text, organization_id::text
       FROM reimbursement_users
       WHERE auth_user_id = $1
       LIMIT 1`,
      [userId],
    );
    const actor = actorLookup.rows[0];
    if (!actor?.organization_id) {
      res.status(403).json({ success: false, message: 'Unable to resolve actor organization context.' });
      return;
    }

    const result = await executeConfirmedAction(validation.action, {
      authUserId: userId,
      role: (req as AuthReq).role ?? 'employee',
      organizationId: actor.organization_id,
      actorReimbursementUserId: actor.id,
    });

    if (result.success) {
      console.log(`[ActionRoutes] Executed ${result.actionType} for user ${userId}: ${result.message}`);
      res.json({
        success: true,
        actionType: result.actionType,
        message: result.message,
        result: result.result,
      });
    } else {
      console.error(`[ActionRoutes] Failed ${result.actionType} for user ${userId}: ${result.error}`);
      res.status(500).json({
        success: false,
        actionType: result.actionType,
        message: result.message,
        error: result.error,
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[ActionRoutes] /confirm error:', message);
    res.status(500).json({
      success: false,
      message: 'An unexpected error occurred while executing the action.',
    });
  }
});

router.post('/cancel', async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthReq).userId;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Authentication required.' });
      return;
    }

    const { actionToken } = req.body;

    if (!actionToken || typeof actionToken !== 'string') {
      res.status(400).json({ success: false, message: 'Missing actionToken.' });
      return;
    }

    const cancelled = await cancelAction(actionToken, userId);

    res.json({
      success: true,
      cancelled,
      message: cancelled ? 'Action cancelled.' : 'Action was already processed or not found.',
    });
  } catch (error) {
    console.error('[ActionRoutes] /cancel error:', error);
    res.json({ success: true, cancelled: false, message: 'Cancellation noted.' });
  }
});

router.post('/cleanup', async (_req: Request, res: Response) => {
  try {
    const expired = await expireStaleActions();
    res.json({ success: true, expiredCount: expired });
  } catch (error) {
    console.error('[ActionRoutes] /cleanup error:', error);
    res.status(500).json({ success: false, error: 'Cleanup failed.' });
  }
});

export { router as actionRoutes };
