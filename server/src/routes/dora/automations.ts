import { Router } from 'express';
import type { Response } from 'express';
import { query } from '../../db/index.js';
import { reimbursementAuth, type ReimbursementRequest } from '../../middleware/reimbursementAuth.js';

const router = Router();
router.use(reimbursementAuth);

function isAdmin(role: string): boolean {
  return ['admin', 'finance', 'finance_admin', 'system_admin', 'cpo'].includes(role);
}

function isManager(role: string): boolean {
  return isAdmin(role) || ['manager', 'dept_head', 'hr'].includes(role);
}

function policyScopeClause(req: ReimbursementRequest, startIdx: number): { clause: string; params: unknown[] } {
  const user = req.reimbursementUser!;
  if (isAdmin(user.role)) return { clause: '1=1', params: [] };
  if (isManager(user.role)) {
    return {
      clause: `(created_by = $${startIdx}::uuid OR scope IN ('team', 'department', 'organization'))`,
      params: [user.id],
    };
  }
  return { clause: `created_by = $${startIdx}::uuid`, params: [user.id] };
}

router.get('/policies', async (req: ReimbursementRequest, res: Response) => {
  try {
    const params: unknown[] = [req.organizationId];
    const scope = policyScopeClause(req, 2);
    const result = await query(
      `SELECT
         id::text AS id,
         organization_id::text AS organization_id,
         created_by::text AS created_by,
         name,
         description,
         is_active,
         trigger_event,
         conditions,
         action_type,
         action_params,
         risk_level,
         scope,
         scope_department,
         scope_team_id::text AS scope_team_id,
         execution_count,
         last_executed_at::text AS last_executed_at,
         last_execution_result,
         created_at::text AS created_at,
         updated_at::text AS updated_at
       FROM dora_automation_policies
       WHERE organization_id = $1::uuid
         AND ${scope.clause}
       ORDER BY created_at DESC`,
      [...params, ...scope.params],
    );
    res.json({ policies: result.rows });
  } catch (err) {
    console.error('[dora/automations/policies GET]', err);
    res.status(500).json({ error: 'Failed to list policies' });
  }
});

router.get('/policies/:id', async (req: ReimbursementRequest, res: Response) => {
  try {
    const scope = policyScopeClause(req, 3);
    const result = await query(
      `SELECT
         p.id::text AS id,
         p.organization_id::text AS organization_id,
         p.created_by::text AS created_by,
         p.name,
         p.description,
         p.is_active,
         p.trigger_event,
         p.conditions,
         p.action_type,
         p.action_params,
         p.risk_level,
         p.scope,
         p.scope_department,
         p.scope_team_id::text AS scope_team_id,
         p.execution_count,
         p.last_executed_at::text AS last_executed_at,
         p.last_execution_result,
         p.created_at::text AS created_at,
         p.updated_at::text AS updated_at,
         COALESCE(stats.total_runs, 0) AS total_runs,
         COALESCE(stats.success_runs, 0) AS success_runs,
         COALESCE(stats.failed_runs, 0) AS failed_runs
       FROM dora_automation_policies p
       LEFT JOIN (
         SELECT
           policy_id,
           COUNT(*) AS total_runs,
           COUNT(*) FILTER (WHERE execution_status IN ('auto_executed', 'executed_with_notification')) AS success_runs,
           COUNT(*) FILTER (WHERE execution_status = 'failed') AS failed_runs
         FROM dora_automation_log
         GROUP BY policy_id
       ) stats ON stats.policy_id = p.id
       WHERE p.organization_id = $1::uuid
         AND p.id = $2::uuid
         AND ${scope.clause}
       LIMIT 1`,
      [req.organizationId, req.params.id, ...scope.params],
    );
    if (!result.rows[0]) {
      res.status(404).json({ error: 'Policy not found' });
      return;
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('[dora/automations/policies/:id GET]', err);
    res.status(500).json({ error: 'Failed to load policy' });
  }
});

router.post('/policies', async (req: ReimbursementRequest, res: Response) => {
  try {
    const user = req.reimbursementUser!;
    const body = req.body as Record<string, unknown>;
    if (!body.name || !body.triggerEvent || !body.actionType) {
      res.status(400).json({ error: 'name, triggerEvent, actionType are required' });
      return;
    }
    const result = await query(
      `INSERT INTO dora_automation_policies (
         organization_id, created_by, name, description, is_active,
         trigger_event, conditions, action_type, action_params,
         risk_level, scope, scope_department, scope_team_id
       )
       VALUES (
         $1::uuid, $2::uuid, $3, $4, COALESCE($5, true),
         $6, COALESCE($7::jsonb, '[]'::jsonb), $8, COALESCE($9::jsonb, '{}'::jsonb),
         COALESCE($10, 'medium'), COALESCE($11, 'team'), $12, $13::uuid
       )
       RETURNING id::text AS id`,
      [
        req.organizationId,
        user.id,
        String(body.name),
        (body.description as string | undefined) ?? null,
        body.isActive,
        String((body.triggerEvent as string | undefined) ?? body.trigger_event),
        body.conditions ? JSON.stringify(body.conditions) : null,
        String((body.actionType as string | undefined) ?? body.action_type),
        body.actionParams ? JSON.stringify(body.actionParams) : null,
        (body.riskLevel as string | undefined) ?? body.risk_level ?? null,
        body.scope ?? null,
        (body.scopeDepartment as string | undefined) ?? (body.scope_department as string | undefined) ?? null,
        (body.scopeTeamId as string | undefined) ?? (body.scope_team_id as string | undefined) ?? null,
      ],
    );
    res.status(201).json({ id: result.rows[0].id });
  } catch (err) {
    console.error('[dora/automations/policies POST]', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to create policy' });
  }
});

router.put('/policies/:id', async (req: ReimbursementRequest, res: Response) => {
  try {
    const user = req.reimbursementUser!;
    const body = req.body as Record<string, unknown>;
    const admin = isAdmin(user.role);

    const owner = await query<{ created_by: string }>(
      `SELECT created_by::text AS created_by
       FROM dora_automation_policies
       WHERE id = $1::uuid
         AND organization_id = $2::uuid
       LIMIT 1`,
      [req.params.id, req.organizationId],
    );
    if (!owner.rows[0]) {
      res.status(404).json({ error: 'Policy not found' });
      return;
    }
    if (!admin && owner.rows[0].created_by !== user.id) {
      res.status(403).json({ error: 'Only creator or admin can update this policy' });
      return;
    }

    await query(
      `UPDATE dora_automation_policies
       SET name = COALESCE($3, name),
           description = COALESCE($4, description),
           trigger_event = COALESCE($5, trigger_event),
           conditions = COALESCE($6::jsonb, conditions),
           action_type = COALESCE($7, action_type),
           action_params = COALESCE($8::jsonb, action_params),
           risk_level = COALESCE($9, risk_level),
           scope = COALESCE($10, scope),
           scope_department = COALESCE($11, scope_department),
           scope_team_id = COALESCE($12::uuid, scope_team_id),
           updated_at = NOW()
       WHERE id = $1::uuid
         AND organization_id = $2::uuid`,
      [
        req.params.id,
        req.organizationId,
        (body.name as string | undefined) ?? null,
        (body.description as string | undefined) ?? null,
        (body.triggerEvent as string | undefined) ?? (body.trigger_event as string | undefined) ?? null,
        body.conditions ? JSON.stringify(body.conditions) : null,
        (body.actionType as string | undefined) ?? (body.action_type as string | undefined) ?? null,
        body.actionParams ? JSON.stringify(body.actionParams) : null,
        (body.riskLevel as string | undefined) ?? (body.risk_level as string | undefined) ?? null,
        (body.scope as string | undefined) ?? null,
        (body.scopeDepartment as string | undefined) ?? (body.scope_department as string | undefined) ?? null,
        (body.scopeTeamId as string | undefined) ?? (body.scope_team_id as string | undefined) ?? null,
      ],
    );
    res.json({ success: true });
  } catch (err) {
    console.error('[dora/automations/policies/:id PUT]', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to update policy' });
  }
});

router.put('/policies/:id/toggle', async (req: ReimbursementRequest, res: Response) => {
  try {
    const user = req.reimbursementUser!;
    const admin = isAdmin(user.role);
    const body = req.body as Record<string, unknown>;
    const nextState = Boolean((body.isActive as boolean | undefined) ?? body.is_active);

    const owner = await query<{ created_by: string }>(
      `SELECT created_by::text AS created_by
       FROM dora_automation_policies
       WHERE id = $1::uuid
         AND organization_id = $2::uuid
       LIMIT 1`,
      [req.params.id, req.organizationId],
    );
    if (!owner.rows[0]) {
      res.status(404).json({ error: 'Policy not found' });
      return;
    }
    if (!admin && owner.rows[0].created_by !== user.id) {
      res.status(403).json({ error: 'Only creator or admin can toggle this policy' });
      return;
    }

    await query(
      `UPDATE dora_automation_policies
       SET is_active = $3, updated_at = NOW()
       WHERE id = $1::uuid
         AND organization_id = $2::uuid`,
      [req.params.id, req.organizationId, nextState],
    );
    res.json({ success: true, isActive: nextState });
  } catch (err) {
    console.error('[dora/automations/policies/:id/toggle PUT]', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to toggle policy' });
  }
});

router.delete('/policies/:id', async (req: ReimbursementRequest, res: Response) => {
  try {
    const user = req.reimbursementUser!;
    const admin = isAdmin(user.role);
    const owner = await query<{ created_by: string }>(
      `SELECT created_by::text AS created_by
       FROM dora_automation_policies
       WHERE id = $1::uuid
         AND organization_id = $2::uuid
       LIMIT 1`,
      [req.params.id, req.organizationId],
    );
    if (!owner.rows[0]) {
      res.status(404).json({ error: 'Policy not found' });
      return;
    }
    if (!admin && owner.rows[0].created_by !== user.id) {
      res.status(403).json({ error: 'Only creator or admin can delete this policy' });
      return;
    }
    await query(
      `DELETE FROM dora_automation_policies
       WHERE id = $1::uuid
         AND organization_id = $2::uuid`,
      [req.params.id, req.organizationId],
    );
    res.json({ success: true });
  } catch (err) {
    console.error('[dora/automations/policies/:id DELETE]', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to delete policy' });
  }
});

router.get('/log', async (req: ReimbursementRequest, res: Response) => {
  try {
    const page = Math.max(1, Number(req.query.page ?? 1));
    const pageSize = 30;
    const offset = (page - 1) * pageSize;
    const params: unknown[] = [req.organizationId];
    const where = ['p.organization_id = $1::uuid'];
    let idx = 2;

    if (req.query.policyId) {
      where.push(`l.policy_id = $${idx++}::uuid`);
      params.push(req.query.policyId);
    }
    if (req.query.status) {
      where.push(`l.execution_status = $${idx++}`);
      params.push(req.query.status);
    }
    if (req.query.from) {
      where.push(`l.created_at >= $${idx++}::timestamptz`);
      params.push(req.query.from);
    }
    if (req.query.to) {
      where.push(`l.created_at <= $${idx++}::timestamptz`);
      params.push(req.query.to);
    }

    const count = await query<{ total: string }>(
      `SELECT COUNT(*)::int AS total
       FROM dora_automation_log l
       JOIN dora_automation_policies p ON p.id = l.policy_id
       WHERE ${where.join(' AND ')}`,
      params,
    );
    const total = Number(count.rows[0]?.total ?? 0);

    const logs = await query(
      `SELECT
         l.id::text AS id,
         l.policy_id::text AS policy_id,
         p.name AS policy_name,
         l.trigger_event,
         l.action_type,
         l.risk_level,
         l.execution_status,
         l.can_undo,
         l.undo_deadline::text AS undo_deadline,
         l.undone_at::text AS undone_at,
         l.created_at::text AS created_at
       FROM dora_automation_log l
       JOIN dora_automation_policies p ON p.id = l.policy_id
       WHERE ${where.join(' AND ')}
       ORDER BY l.created_at DESC
       LIMIT $${idx++} OFFSET $${idx++}`,
      [...params, pageSize, offset],
    );

    res.json({
      data: logs.rows,
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    });
  } catch (err) {
    console.error('[dora/automations/log GET]', err);
    res.status(500).json({ error: 'Failed to load automation log' });
  }
});

router.get('/log/:id', async (req: ReimbursementRequest, res: Response) => {
  try {
    const result = await query(
      `SELECT
         l.id::text AS id,
         l.policy_id::text AS policy_id,
         p.name AS policy_name,
         l.trigger_event,
         l.trigger_payload,
         l.conditions_evaluated,
         l.action_type,
         l.action_params,
         l.risk_level,
         l.execution_status,
         l.result,
         l.error_message,
         l.can_undo,
         l.undo_deadline::text AS undo_deadline,
         l.undone_at::text AS undone_at,
         l.undone_by::text AS undone_by,
         l.created_at::text AS created_at
       FROM dora_automation_log l
       JOIN dora_automation_policies p ON p.id = l.policy_id
       WHERE l.id = $1::uuid
         AND p.organization_id = $2::uuid
       LIMIT 1`,
      [req.params.id, req.organizationId],
    );
    if (!result.rows[0]) {
      res.status(404).json({ error: 'Log entry not found' });
      return;
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('[dora/automations/log/:id GET]', err);
    res.status(500).json({ error: 'Failed to load log entry' });
  }
});

router.post('/log/:id/undo', async (req: ReimbursementRequest, res: Response) => {
  try {
    const user = req.reimbursementUser!;
    const result = await query<{
      id: string;
      can_undo: boolean;
      undo_deadline: string | null;
      undone_at: string | null;
    }>(
      `SELECT
         l.id::text AS id,
         l.can_undo,
         l.undo_deadline::text AS undo_deadline,
         l.undone_at::text AS undone_at
       FROM dora_automation_log l
       JOIN dora_automation_policies p ON p.id = l.policy_id
       WHERE l.id = $1::uuid
         AND p.organization_id = $2::uuid
       LIMIT 1`,
      [req.params.id, req.organizationId],
    );
    const row = result.rows[0];
    if (!row) {
      res.status(404).json({ error: 'Log entry not found' });
      return;
    }
    if (!row.can_undo) {
      res.status(400).json({ error: 'This action cannot be undone' });
      return;
    }
    if (row.undone_at) {
      res.status(400).json({ error: 'Action already undone' });
      return;
    }
    if (!row.undo_deadline || new Date(row.undo_deadline).getTime() < Date.now()) {
      res.status(400).json({ error: 'Undo window expired' });
      return;
    }

    await query(
      `UPDATE dora_automation_log
       SET undone_at = NOW(),
           undone_by = $2::uuid
       WHERE id = $1::uuid`,
      [req.params.id, user.id],
    );
    res.json({ success: true });
  } catch (err) {
    console.error('[dora/automations/log/:id/undo POST]', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to undo action' });
  }
});

router.get('/stats', async (req: ReimbursementRequest, res: Response) => {
  try {
    const stats = await query<{
      total_policies: string;
      active_policies: string;
      executions_this_week: string;
      auto_approved_count: string;
    }>(
      `SELECT
         COUNT(*)::int::text AS total_policies,
         COUNT(*) FILTER (WHERE p.is_active)::int::text AS active_policies,
         (
           SELECT COUNT(*)::int::text
           FROM dora_automation_log l
           JOIN dora_automation_policies p2 ON p2.id = l.policy_id
           WHERE p2.organization_id = $1::uuid
             AND l.created_at >= DATE_TRUNC('week', NOW())
         ) AS executions_this_week,
         (
           SELECT COUNT(*)::int::text
           FROM dora_automation_log l
           JOIN dora_automation_policies p2 ON p2.id = l.policy_id
           WHERE p2.organization_id = $1::uuid
             AND l.execution_status IN ('auto_executed', 'executed_with_notification')
         ) AS auto_approved_count
       FROM dora_automation_policies p
       WHERE p.organization_id = $1::uuid`,
      [req.organizationId],
    );

    const row = stats.rows[0];
    const executions = Number(row?.executions_this_week ?? 0);
    res.json({
      totalPolicies: Number(row?.total_policies ?? 0),
      activePolicies: Number(row?.active_policies ?? 0),
      executionsThisWeek: executions,
      autoApprovedCount: Number(row?.auto_approved_count ?? 0),
      estimatedTimeSavedMinutes: executions * 4,
    });
  } catch (err) {
    console.error('[dora/automations/stats GET]', err);
    res.status(500).json({ error: 'Failed to load automation stats' });
  }
});

export default router;
