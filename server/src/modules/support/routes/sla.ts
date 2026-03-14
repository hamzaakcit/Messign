import { Router } from 'express';
import type { Response } from 'express';
import * as support from '../dal/index.js';
import { requireRole, type ReimbursementRequest } from '../../../middleware/reimbursementAuth.js';
import { buildCtx } from './common.js';

const router = Router();

router.get('/compliance', async (req: ReimbursementRequest, res: Response) => {
  try {
    const report = await support.sla.checkSLACompliance(buildCtx(req));
    res.json(report);
  } catch (err) {
    console.error('[support/sla/compliance GET]', err);
    res.status(500).json({ error: 'Failed to load SLA compliance report' });
  }
});

router.get('/metrics', async (req: ReimbursementRequest, res: Response) => {
  try {
    const metrics = await support.sla.getSLAMetrics(buildCtx(req), req.query.period as string | undefined);
    res.json(metrics);
  } catch (err) {
    console.error('[support/sla/metrics GET]', err);
    res.status(500).json({ error: 'Failed to load SLA metrics' });
  }
});

router.get('/policies', async (req: ReimbursementRequest, res: Response) => {
  try {
    const policies = await support.admin.listPolicies(buildCtx(req));
    res.json(policies);
  } catch (err) {
    console.error('[support/sla/policies GET]', err);
    res.status(500).json({ error: 'Failed to list SLA policies' });
  }
});

router.post('/policies', requireRole('admin', 'finance', 'manager'), async (req: ReimbursementRequest, res: Response) => {
  try {
    const body = req.body as Record<string, unknown>;
    if (!body.name || !body.priority || body.first_response_hours == null && body.firstResponseHours == null || body.resolution_hours == null && body.resolutionHours == null) {
      res.status(400).json({ error: 'name, priority, firstResponseHours, and resolutionHours are required' });
      return;
    }

    const policy = await support.admin.createPolicy(buildCtx(req), {
      name: String(body.name),
      priority: String(body.priority) as support.admin.CreateSupportSlaPolicyInput['priority'],
      first_response_hours: Number((body.first_response_hours as number | undefined) ?? body.firstResponseHours),
      resolution_hours: Number((body.resolution_hours as number | undefined) ?? body.resolutionHours),
      escalation_after_hours: body.escalation_after_hours == null && body.escalationAfterHours == null
        ? undefined
        : Number((body.escalation_after_hours as number | undefined) ?? body.escalationAfterHours),
      escalate_to_role: (body.escalate_to_role as string | undefined) ?? (body.escalateToRole as string | undefined),
      business_hours_only: body.business_hours_only == null && body.businessHoursOnly == null
        ? undefined
        : Boolean((body.business_hours_only as boolean | undefined) ?? body.businessHoursOnly),
      is_active: body.is_active == null && body.isActive == null
        ? undefined
        : Boolean((body.is_active as boolean | undefined) ?? body.isActive),
    });
    res.status(201).json(policy);
  } catch (err) {
    console.error('[support/sla/policies POST]', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to create SLA policy' });
  }
});

router.put('/policies/:id', requireRole('admin', 'finance', 'manager'), async (req: ReimbursementRequest, res: Response) => {
  try {
    const body = req.body as Record<string, unknown>;
    const policy = await support.admin.updatePolicy(buildCtx(req), req.params.id, {
      name: body.name as string | undefined,
      priority: body.priority as support.admin.UpdateSupportSlaPolicyInput['priority'],
      first_response_hours: body.first_response_hours == null && body.firstResponseHours == null
        ? undefined
        : Number((body.first_response_hours as number | undefined) ?? body.firstResponseHours),
      resolution_hours: body.resolution_hours == null && body.resolutionHours == null
        ? undefined
        : Number((body.resolution_hours as number | undefined) ?? body.resolutionHours),
      escalation_after_hours: body.escalation_after_hours == null && body.escalationAfterHours == null
        ? undefined
        : Number((body.escalation_after_hours as number | undefined) ?? body.escalationAfterHours),
      escalate_to_role: (body.escalate_to_role as string | undefined) ?? (body.escalateToRole as string | undefined),
      business_hours_only: body.business_hours_only == null && body.businessHoursOnly == null
        ? undefined
        : Boolean((body.business_hours_only as boolean | undefined) ?? body.businessHoursOnly),
      is_active: body.is_active == null && body.isActive == null
        ? undefined
        : Boolean((body.is_active as boolean | undefined) ?? body.isActive),
    });
    res.json(policy);
  } catch (err) {
    console.error('[support/sla/policies/:id PUT]', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to update SLA policy' });
  }
});

export default router;
