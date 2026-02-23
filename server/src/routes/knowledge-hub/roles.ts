import { Router, Request, Response } from 'express';
import * as db from '../../db/knowledgeV2Db.js';

export const rolesRouter = Router();
type AuthReq = Request & { userId: string };

rolesRouter.get('/', async (_req: Request, res: Response) => {
  try {
    const roles = await db.listUserRoles();
    res.json(roles);
  } catch (e) {
    console.error('[kh-roles] list:', e);
    res.status(500).json({ error: 'Failed to list roles' });
  }
});

rolesRouter.put('/:userId', async (req: Request, res: Response) => {
  try {
    const { role } = req.body;
    if (!role) { res.status(400).json({ error: 'Role is required' }); return; }
    await db.setUserRole(req.params.userId, role);
    await db.logAudit({
      userId: (req as AuthReq).userId,
      action: 'set_role',
      entityType: 'knowledge_user_role',
      entityId: req.params.userId,
      details: { role },
    });
    res.json({ ok: true });
  } catch (e) {
    console.error('[kh-roles] set:', e);
    res.status(500).json({ error: 'Failed to set role' });
  }
});
