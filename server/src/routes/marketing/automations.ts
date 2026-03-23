import { Router } from 'express';
import type { Response } from 'express';
import type { ReimbursementRequest } from '../../middleware/reimbursementAuth.js';
import { requireRole } from '../../middleware/reimbursementAuth.js';
import { buildCtx } from './common.js';
import * as automationDal from '../../dal/marketing/automations.js';
import type { CreateAutomationInput } from '../../dal/marketing/automations.js';
import { executeAutomation, type AutomationActor } from '../../services/ai/marketing/automationExecutor.js';

const router = Router();

function actorFromRequest(req: ReimbursementRequest): AutomationActor {
  const u = req.reimbursementUser!;
  return {
    organizationId: req.organizationId!,
    reimbursementUserId: u.id,
    authUserId: u.authUserId || u.id,
    userName: u.fullName,
    role: u.role,
  };
}

router.get('/', requireRole('manager', 'admin'), async (req: ReimbursementRequest, res: Response) => {
  try {
    const trigger_type =
      typeof req.query.trigger_type === 'string' ? req.query.trigger_type : undefined;
    const enabled =
      req.query.enabled === 'true' ? true : req.query.enabled === 'false' ? false : undefined;
    const rows = await automationDal.listAutomations(buildCtx(req), {
      trigger_type,
      enabled,
    });
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('[marketing/automations GET]', err);
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : 'list_automations failed',
    });
  }
});

router.post('/', requireRole('manager', 'admin'), async (req: ReimbursementRequest, res: Response) => {
  try {
    const body = req.body as Partial<CreateAutomationInput>;
    if (!body.name || !body.trigger_type) {
      res.status(400).json({ success: false, error: 'name and trigger_type are required' });
      return;
    }
    const id = await automationDal.createAutomation(buildCtx(req), {
      name: body.name,
      description: body.description,
      trigger_type: body.trigger_type,
      trigger_config: body.trigger_config,
      condition: body.condition,
      actions: body.actions,
      hitl_mode: body.hitl_mode,
      enabled: body.enabled,
    });
    res.status(201).json({ success: true, data: { id } });
  } catch (err) {
    console.error('[marketing/automations POST]', err);
    res.status(400).json({
      success: false,
      error: err instanceof Error ? err.message : 'create_automation failed',
    });
  }
});

router.get('/:id', requireRole('manager', 'admin'), async (req: ReimbursementRequest, res: Response) => {
  try {
    const row = await automationDal.getAutomationById(buildCtx(req), req.params.id);
    if (!row) {
      res.status(404).json({ success: false, error: 'Not found' });
      return;
    }
    res.json({ success: true, data: row });
  } catch (err) {
    console.error('[marketing/automations GET :id]', err);
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : 'get_automation failed',
    });
  }
});

router.patch('/:id', requireRole('manager', 'admin'), async (req: ReimbursementRequest, res: Response) => {
  try {
    const ok = await automationDal.updateAutomation(buildCtx(req), req.params.id, req.body ?? {});
    if (!ok) {
      res.status(404).json({ success: false, error: 'Not found' });
      return;
    }
    const row = await automationDal.getAutomationById(buildCtx(req), req.params.id);
    res.json({ success: true, data: row });
  } catch (err) {
    console.error('[marketing/automations PATCH]', err);
    res.status(400).json({
      success: false,
      error: err instanceof Error ? err.message : 'update_automation failed',
    });
  }
});

router.delete('/:id', requireRole('manager', 'admin'), async (req: ReimbursementRequest, res: Response) => {
  try {
    const ok = await automationDal.deleteAutomation(buildCtx(req), req.params.id);
    if (!ok) {
      res.status(404).json({ success: false, error: 'Not found' });
      return;
    }
    res.json({ success: true });
  } catch (err) {
    console.error('[marketing/automations DELETE]', err);
    res.status(400).json({
      success: false,
      error: err instanceof Error ? err.message : 'delete_automation failed',
    });
  }
});

router.post('/:id/trigger', requireRole('manager', 'admin'), async (req: ReimbursementRequest, res: Response) => {
  try {
    const actor = actorFromRequest(req);
    const result = await executeAutomation({
      automationId: req.params.id,
      orgId: req.organizationId!,
      actor,
      triggerType: 'manual',
      triggerData: { manual: true, ...(typeof req.body === 'object' && req.body ? req.body : {}) },
      respectEnabled: false,
    });
    res.json({ success: true, data: result });
  } catch (err) {
    console.error('[marketing/automations trigger]', err);
    res.status(400).json({
      success: false,
      error: err instanceof Error ? err.message : 'trigger failed',
    });
  }
});

router.get('/:id/runs', requireRole('manager', 'admin'), async (req: ReimbursementRequest, res: Response) => {
  try {
    const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 20;
    const rows = await automationDal.listRuns(req.params.id, buildCtx(req), Number.isFinite(limit) ? limit : 20);
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('[marketing/automations runs]', err);
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : 'list_runs failed',
    });
  }
});

export default router;
