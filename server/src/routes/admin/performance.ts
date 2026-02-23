import { Router, type Request, type Response } from 'express';
import { query } from '../../db/index.js';
import { requireAdmin } from '../../middleware/adminAuth.js';

const router = Router();
router.use(requireAdmin);

type ReqWithAdmin = Request & { adminUserId?: string };

function rowToTeam(row: Record<string, unknown>): Record<string, unknown> {
  return {
    id: row.id,
    teamCode: row.team_code,
    teamName: row.team_name,
    description: row.description ?? undefined,
    teamType: row.team_type,
    teamLeadId: row.team_lead_id ?? undefined,
    metricsConfig: typeof row.metrics_config === 'object' ? row.metrics_config : { revenue: true, sms: true, email: true },
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToMember(row: Record<string, unknown>): Record<string, unknown> {
  return {
    id: row.id,
    teamId: row.team_id,
    employeeId: row.employee_id,
    roleInTeam: row.role_in_team,
    startDate: row.start_date,
    endDate: row.end_date ?? undefined,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToTarget(row: Record<string, unknown>): Record<string, unknown> {
  return {
    id: row.id,
    entityType: row.entity_type,
    entityId: row.entity_id ?? undefined,
    periodType: row.period_type,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    revenueTarget: row.revenue_target != null ? parseFloat(String(row.revenue_target)) : undefined,
    smsTarget: row.sms_target != null ? parseInt(String(row.sms_target), 10) : undefined,
    emailTarget: row.email_target != null ? parseInt(String(row.email_target), 10) : undefined,
    customTargets: row.custom_targets ?? undefined,
    createdBy: row.created_by ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function addPerformanceAudit(
  userId: string,
  action: string,
  entityType: string,
  entityId: string | null,
  beforeValue: Record<string, unknown> | null,
  afterValue: Record<string, unknown> | null
): Promise<void> {
  await query(
    `INSERT INTO performance_audit_log (user_id, action, entity_type, entity_id, before_value, after_value)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [userId, action, entityType, entityId, beforeValue ? JSON.stringify(beforeValue) : null, afterValue ? JSON.stringify(afterValue) : null]
  );
}

// In-memory only (no schema table): metrics config and alerts
let metricsConfig: Record<string, boolean> = {
  revenue: true,
  sms: true,
  mail: true,
  conversionRate: true,
  costPerSms: true,
  responseRate: true,
};
let alertsConfig: { thresholds?: Record<string, unknown>; notifications?: unknown } = {};

// Teams
router.get('/teams', async (_req: Request, res: Response) => {
  try {
    const result = await query(
      `SELECT id, team_code, team_name, description, team_type, team_lead_id, metrics_config, is_active, created_at, updated_at FROM performance_teams ORDER BY team_code`
    );
    res.json(result.rows.map((r) => rowToTeam(r as Record<string, unknown>)));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to list teams' });
  }
});

router.get('/teams/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await query(
      `SELECT id, team_code, team_name, description, team_type, team_lead_id, metrics_config, is_active, created_at, updated_at
       FROM performance_teams WHERE id = $1 OR team_code = $1 LIMIT 1`,
      [id]
    );
    const row = result.rows[0];
    if (!row) {
      res.status(404).json({ error: 'Team not found' });
      return;
    }
    res.json(rowToTeam(row as Record<string, unknown>));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to get team' });
  }
});

router.post('/teams', async (req: ReqWithAdmin, res: Response) => {
  try {
    const body = req.body as Record<string, unknown>;
    const teamCode = (body.teamCode as string) ?? (body.team_code as string) ?? `team-${Date.now()}`;
    const teamName = (body.teamName as string) ?? (body.team_name as string) ?? 'New Team';
    const description = (body.description as string) ?? null;
    const teamType = (body.teamType as string) ?? (body.team_type as string) ?? 'sales';
    const teamLeadId = (body.teamLeadId as string) ?? (body.team_lead_id as string) ?? null;
    const metricsConfigBody = (body.metricsConfig ?? body.metrics_config) as Record<string, boolean> | undefined;
    const metricsConfigJson = JSON.stringify(metricsConfigBody ?? { revenue: true, sms: true, email: true });
    const isActive = (body.isActive ?? body.is_active ?? true) as boolean;

    const result = await query(
      `INSERT INTO performance_teams (team_code, team_name, description, team_type, team_lead_id, metrics_config, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, team_code, team_name, description, team_type, team_lead_id, metrics_config, is_active, created_at, updated_at`,
      [teamCode, teamName, description, teamType, teamLeadId, metricsConfigJson, isActive]
    );
    const row = result.rows[0];
    if (!row) {
      res.status(500).json({ error: 'Insert failed' });
      return;
    }
    const team = rowToTeam(row as Record<string, unknown>);
    await addPerformanceAudit(req.adminUserId ?? 'unknown', 'performance.team.created', 'performance_team', String(row.id), null, team as Record<string, unknown>);
    res.status(201).json(team);
  } catch (e) {
    console.error(e);
    const err = e as { code?: string };
    if (err.code === '23505') {
      res.status(400).json({ error: 'Team code already exists' });
      return;
    }
    res.status(500).json({ error: 'Failed to create team' });
  }
});

router.put('/teams/:id', async (req: ReqWithAdmin, res: Response) => {
  try {
    const { id } = req.params;
    const body = req.body as Record<string, unknown>;
    const existing = await query(
      `SELECT id, team_code, team_name, description, team_type, team_lead_id, metrics_config, is_active FROM performance_teams WHERE id = $1 OR team_code = $1 LIMIT 1`,
      [id]
    );
    const oldRow = existing.rows[0];
    if (!oldRow) {
      res.status(404).json({ error: 'Team not found' });
      return;
    }
    const teamId = oldRow.id;
    const updates: string[] = [];
    const params: unknown[] = [];
    let idx = 1;
    if (body.teamName !== undefined) {
      updates.push(`team_name = $${idx}`);
      params.push(body.teamName);
      idx++;
    }
    if (body.team_name !== undefined) {
      updates.push(`team_name = $${idx}`);
      params.push(body.team_name);
      idx++;
    }
    if (body.description !== undefined) {
      updates.push(`description = $${idx}`);
      params.push(body.description);
      idx++;
    }
    if (body.teamType !== undefined) {
      updates.push(`team_type = $${idx}`);
      params.push(body.teamType);
      idx++;
    }
    if (body.team_type !== undefined) {
      updates.push(`team_type = $${idx}`);
      params.push(body.team_type);
      idx++;
    }
    if (body.teamLeadId !== undefined) {
      updates.push(`team_lead_id = $${idx}`);
      params.push(body.teamLeadId);
      idx++;
    }
    if (body.team_lead_id !== undefined) {
      updates.push(`team_lead_id = $${idx}`);
      params.push(body.team_lead_id);
      idx++;
    }
    if (body.metricsConfig !== undefined) {
      updates.push(`metrics_config = $${idx}`);
      params.push(JSON.stringify(body.metricsConfig));
      idx++;
    }
    if (body.metrics_config !== undefined) {
      updates.push(`metrics_config = $${idx}`);
      params.push(JSON.stringify(body.metrics_config));
      idx++;
    }
    if (body.isActive !== undefined) {
      updates.push(`is_active = $${idx}`);
      params.push(!!body.isActive);
      idx++;
    }
    if (body.is_active !== undefined) {
      updates.push(`is_active = $${idx}`);
      params.push(!!body.is_active);
      idx++;
    }
    if (updates.length === 0) {
      const getResult = await query(
        `SELECT id, team_code, team_name, description, team_type, team_lead_id, metrics_config, is_active, created_at, updated_at FROM performance_teams WHERE id = $1`,
        [teamId]
      );
      return res.json(rowToTeam(getResult.rows[0] as Record<string, unknown>));
    }
    updates.push(`updated_at = NOW()`);
    params.push(teamId);
    const result = await query(
      `UPDATE performance_teams SET ${updates.join(', ')} WHERE id = $${idx} RETURNING id, team_code, team_name, description, team_type, team_lead_id, metrics_config, is_active, created_at, updated_at`,
      params
    );
    const row = result.rows[0];
    await addPerformanceAudit(req.adminUserId ?? 'unknown', 'performance.team.updated', 'performance_team', teamId, oldRow as Record<string, unknown>, row as Record<string, unknown>);
    res.json(rowToTeam(row as Record<string, unknown>));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to update team' });
  }
});

router.delete('/teams/:id', async (req: ReqWithAdmin, res: Response) => {
  try {
    const { id } = req.params;
    const existing = await query(
      `SELECT id, team_code, team_name FROM performance_teams WHERE id = $1 OR team_code = $1 LIMIT 1`,
      [id]
    );
    const row = existing.rows[0];
    if (!row) {
      res.status(404).json({ error: 'Team not found' });
      return;
    }
    await query(`DELETE FROM performance_teams WHERE id = $1`, [row.id]);
    await addPerformanceAudit(req.adminUserId ?? 'unknown', 'performance.team.deleted', 'performance_team', String(row.id), row as Record<string, unknown>, null);
    res.status(204).send();
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to delete team' });
  }
});

// Team members
router.get('/teams/:teamId/members', async (req: Request, res: Response) => {
  try {
    const { teamId } = req.params;
    const teamResult = await query(`SELECT id FROM performance_teams WHERE id = $1 OR team_code = $1 LIMIT 1`, [teamId]);
    const team = teamResult.rows[0];
    if (!team) {
      res.status(404).json({ error: 'Team not found' });
      return;
    }
    const result = await query(
      `SELECT id, team_id, employee_id, role_in_team, start_date, end_date, is_active, created_at, updated_at
       FROM performance_team_members WHERE team_id = $1 ORDER BY start_date, employee_id`,
      [team.id]
    );
    res.json(result.rows.map((r) => rowToMember(r as Record<string, unknown>)));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to list members' });
  }
});

router.post('/teams/:teamId/members', async (req: ReqWithAdmin, res: Response) => {
  try {
    const { teamId } = req.params;
    const body = req.body as Record<string, unknown>;
    const teamResult = await query(`SELECT id, team_name FROM performance_teams WHERE id = $1 OR team_code = $1 LIMIT 1`, [teamId]);
    const team = teamResult.rows[0];
    if (!team) {
      res.status(404).json({ error: 'Team not found' });
      return;
    }
    const employeeId = (body.employeeId as string) ?? (body.employee_id as string) ?? '';
    const roleInTeam = (body.roleInTeam as string) ?? (body.role_in_team as string) ?? 'member';
    const startDate = (body.startDate as string) ?? (body.start_date as string) ?? new Date().toISOString().slice(0, 10);
    const endDate = (body.endDate as string) ?? (body.end_date as string) ?? null;
    const isActive = (body.isActive ?? body.is_active ?? true) as boolean;

    const result = await query(
      `INSERT INTO performance_team_members (team_id, employee_id, role_in_team, start_date, end_date, is_active)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (team_id, employee_id) DO UPDATE SET role_in_team = EXCLUDED.role_in_team, start_date = EXCLUDED.start_date, end_date = EXCLUDED.end_date, is_active = EXCLUDED.is_active, updated_at = NOW()
       RETURNING id, team_id, employee_id, role_in_team, start_date, end_date, is_active, created_at, updated_at`,
      [team.id, employeeId, roleInTeam, startDate, endDate, isActive]
    );
    const row = result.rows[0];
    const member = rowToMember(row as Record<string, unknown>);
    await addPerformanceAudit(req.adminUserId ?? 'unknown', 'performance.member.added', 'performance_team_member', String(row?.id), null, member as Record<string, unknown>);
    res.status(201).json(member);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to add member' });
  }
});

router.put('/teams/:teamId/members/:memberId', async (req: ReqWithAdmin, res: Response) => {
  try {
    const { teamId, memberId } = req.params;
    const body = req.body as Record<string, unknown>;
    const teamResult = await query(`SELECT id FROM performance_teams WHERE id = $1 OR team_code = $1 LIMIT 1`, [teamId]);
    const team = teamResult.rows[0];
    if (!team) {
      res.status(404).json({ error: 'Team not found' });
      return;
    }
    const existing = await query(
      `SELECT id, team_id, employee_id, role_in_team, start_date, end_date, is_active FROM performance_team_members WHERE id = $1 AND team_id = $2 LIMIT 1`,
      [memberId, team.id]
    );
    const oldRow = existing.rows[0];
    if (!oldRow) {
      res.status(404).json({ error: 'Member not found' });
      return;
    }
    const updates: string[] = [];
    const params: unknown[] = [];
    let idx = 1;
    if (body.roleInTeam !== undefined) {
      updates.push(`role_in_team = $${idx}`);
      params.push(body.roleInTeam);
      idx++;
    }
    if (body.role_in_team !== undefined) {
      updates.push(`role_in_team = $${idx}`);
      params.push(body.role_in_team);
      idx++;
    }
    if (body.startDate !== undefined) {
      updates.push(`start_date = $${idx}`);
      params.push(body.startDate);
      idx++;
    }
    if (body.start_date !== undefined) {
      updates.push(`start_date = $${idx}`);
      params.push(body.start_date);
      idx++;
    }
    if (body.endDate !== undefined) {
      updates.push(`end_date = $${idx}`);
      params.push(body.endDate);
      idx++;
    }
    if (body.end_date !== undefined) {
      updates.push(`end_date = $${idx}`);
      params.push(body.end_date);
      idx++;
    }
    if (body.isActive !== undefined) {
      updates.push(`is_active = $${idx}`);
      params.push(!!body.isActive);
      idx++;
    }
    if (body.is_active !== undefined) {
      updates.push(`is_active = $${idx}`);
      params.push(!!body.is_active);
      idx++;
    }
    if (updates.length === 0) {
      const getResult = await query(
        `SELECT id, team_id, employee_id, role_in_team, start_date, end_date, is_active, created_at, updated_at FROM performance_team_members WHERE id = $1`,
        [memberId]
      );
      return res.json(rowToMember(getResult.rows[0] as Record<string, unknown>));
    }
    updates.push(`updated_at = NOW()`);
    params.push(memberId, team.id);
    const result = await query(
      `UPDATE performance_team_members SET ${updates.join(', ')} WHERE id = $${idx} AND team_id = $${idx + 1} RETURNING id, team_id, employee_id, role_in_team, start_date, end_date, is_active, created_at, updated_at`,
      params
    );
    const row = result.rows[0];
    await addPerformanceAudit(req.adminUserId ?? 'unknown', 'performance.member.updated', 'performance_team_member', memberId, oldRow as Record<string, unknown>, row as Record<string, unknown>);
    res.json(rowToMember(row as Record<string, unknown>));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to update member' });
  }
});

router.delete('/teams/:teamId/members/:memberId', async (req: ReqWithAdmin, res: Response) => {
  try {
    const { teamId, memberId } = req.params;
    const teamResult = await query(`SELECT id FROM performance_teams WHERE id = $1 OR team_code = $1 LIMIT 1`, [teamId]);
    const team = teamResult.rows[0];
    if (!team) {
      res.status(404).json({ error: 'Team not found' });
      return;
    }
    const existing = await query(
      `SELECT id, employee_id FROM performance_team_members WHERE id = $1 AND team_id = $2 LIMIT 1`,
      [memberId, team.id]
    );
    const row = existing.rows[0];
    if (!row) {
      res.status(404).json({ error: 'Member not found' });
      return;
    }
    await query(`DELETE FROM performance_team_members WHERE id = $1 AND team_id = $2`, [memberId, team.id]);
    await addPerformanceAudit(req.adminUserId ?? 'unknown', 'performance.member.removed', 'performance_team_member', memberId, row as Record<string, unknown>, null);
    res.status(204).send();
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to remove member' });
  }
});

// Targets
router.get('/targets', async (_req: Request, res: Response) => {
  try {
    const result = await query(
      `SELECT id, entity_type, entity_id, period_type, period_start, period_end, revenue_target, sms_target, email_target, custom_targets, created_by, created_at, updated_at FROM performance_targets ORDER BY period_start DESC`
    );
    res.json(result.rows.map((r) => rowToTarget(r as Record<string, unknown>)));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to list targets' });
  }
});

router.post('/targets', async (req: ReqWithAdmin, res: Response) => {
  try {
    const body = req.body as Record<string, unknown>;
    const entityType = (body.entityType as string) ?? (body.entity_type as string) ?? 'company';
    const entityId = (body.entityId as string) ?? (body.entity_id as string) ?? null;
    const periodType = (body.periodType as string) ?? (body.period_type as string) ?? 'quarterly';
    const periodStart = (body.periodStart as string) ?? (body.period_start as string) ?? new Date().toISOString().slice(0, 10);
    const periodEnd = (body.periodEnd as string) ?? (body.period_end as string) ?? new Date().toISOString().slice(0, 10);
    const revenueTarget = (body.revenueTarget as number) ?? (body.revenue_target as number) ?? null;
    const smsTarget = (body.smsTarget as number) ?? (body.sms_target as number) ?? null;
    const emailTarget = (body.emailTarget as number) ?? (body.email_target as number) ?? null;
    const customTargets = (body.customTargets ?? body.custom_targets) as Record<string, unknown> | undefined;
    const customTargetsJson = customTargets ? JSON.stringify(customTargets) : null;

    const result = await query(
      `INSERT INTO performance_targets (entity_type, entity_id, period_type, period_start, period_end, revenue_target, sms_target, email_target, custom_targets, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id, entity_type, entity_id, period_type, period_start, period_end, revenue_target, sms_target, email_target, custom_targets, created_by, created_at, updated_at`,
      [entityType, entityId, periodType, periodStart, periodEnd, revenueTarget, smsTarget, emailTarget, customTargetsJson, req.adminUserId ?? null]
    );
    const row = result.rows[0];
    const target = rowToTarget(row as Record<string, unknown>);
    await addPerformanceAudit(req.adminUserId ?? 'unknown', 'performance.target.created', 'performance_target', String(row?.id), null, target as Record<string, unknown>);
    res.status(201).json(target);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to create target' });
  }
});

router.put('/targets/:id', async (req: ReqWithAdmin, res: Response) => {
  try {
    const { id } = req.params;
    const body = req.body as Record<string, unknown>;
    const existing = await query(
      `SELECT id, entity_type, entity_id, period_type, period_start, period_end, revenue_target, sms_target, email_target FROM performance_targets WHERE id = $1 LIMIT 1`,
      [id]
    );
    const oldRow = existing.rows[0];
    if (!oldRow) {
      res.status(404).json({ error: 'Target not found' });
      return;
    }
    const updates: string[] = [];
    const params: unknown[] = [];
    let idx = 1;
    if (body.revenueTarget !== undefined) {
      updates.push(`revenue_target = $${idx}`);
      params.push(body.revenueTarget);
      idx++;
    }
    if (body.revenue_target !== undefined) {
      updates.push(`revenue_target = $${idx}`);
      params.push(body.revenue_target);
      idx++;
    }
    if (body.smsTarget !== undefined) {
      updates.push(`sms_target = $${idx}`);
      params.push(body.smsTarget);
      idx++;
    }
    if (body.sms_target !== undefined) {
      updates.push(`sms_target = $${idx}`);
      params.push(body.sms_target);
      idx++;
    }
    if (body.emailTarget !== undefined) {
      updates.push(`email_target = $${idx}`);
      params.push(body.emailTarget);
      idx++;
    }
    if (body.email_target !== undefined) {
      updates.push(`email_target = $${idx}`);
      params.push(body.email_target);
      idx++;
    }
    if (updates.length === 0) {
      const getResult = await query(
        `SELECT id, entity_type, entity_id, period_type, period_start, period_end, revenue_target, sms_target, email_target, custom_targets, created_by, created_at, updated_at FROM performance_targets WHERE id = $1`,
        [id]
      );
      return res.json(rowToTarget(getResult.rows[0] as Record<string, unknown>));
    }
    updates.push(`updated_at = NOW()`);
    params.push(id);
    const result = await query(
      `UPDATE performance_targets SET ${updates.join(', ')} WHERE id = $${idx} RETURNING id, entity_type, entity_id, period_type, period_start, period_end, revenue_target, sms_target, email_target, custom_targets, created_by, created_at, updated_at`,
      params
    );
    const row = result.rows[0];
    await addPerformanceAudit(req.adminUserId ?? 'unknown', 'performance.target.updated', 'performance_target', id, oldRow as Record<string, unknown>, row as Record<string, unknown>);
    res.json(rowToTarget(row as Record<string, unknown>));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to update target' });
  }
});

// Metrics config (no table – in-memory)
router.get('/metrics', (_req: Request, res: Response) => {
  res.json(metricsConfig);
});

router.put('/metrics', (req: ReqWithAdmin, res: Response) => {
  const body = req.body as Record<string, boolean>;
  if (typeof body === 'object' && body !== null) {
    Object.assign(metricsConfig, body);
  }
  res.json(metricsConfig);
});

// Alerts (no table – in-memory)
router.get('/alerts', (_req: Request, res: Response) => {
  res.json(alertsConfig);
});

router.put('/alerts', (req: ReqWithAdmin, res: Response) => {
  const body = req.body as typeof alertsConfig;
  if (typeof body === 'object' && body !== null) {
    alertsConfig = { ...alertsConfig, ...body };
  }
  res.json(alertsConfig);
});

// Export
router.get('/export', async (req: Request, res: Response) => {
  try {
    const team = (req.query.team as string) ?? '';
    const format = (req.query.format as string) ?? 'json';
    const teamsResult = await query(
      `SELECT id, team_code, team_name, description, team_type, team_lead_id, metrics_config, is_active FROM performance_teams ORDER BY team_code`
    );
    const targetsResult = await query(
      `SELECT id, entity_type, entity_id, period_type, period_start, period_end, revenue_target, sms_target, email_target FROM performance_targets ORDER BY period_start DESC`
    );
    const teams = teamsResult.rows.map((r) => rowToTeam(r as Record<string, unknown>));
    const targets = targetsResult.rows.map((r) => rowToTarget(r as Record<string, unknown>));
    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="performance-export.csv"');
      const header = 'Team,Period,Revenue,SMS,Email\n';
      const rows = team ? targets.filter((t) => t.entityId === team || t.entityType === team).map((t) => `${team || t.entityType},${t.periodStart},${t.revenueTarget ?? ''},${t.smsTarget ?? ''},${t.emailTarget ?? ''}\n`) : targets.map((t) => `${t.entityType},${t.periodStart},${t.revenueTarget ?? ''},${t.smsTarget ?? ''},${t.emailTarget ?? ''}\n`);
      res.send(header + rows.join(''));
      return;
    }
    res.json({
      success: true,
      team: team || null,
      format,
      data: { teams, targets, metricsConfig },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to export' });
  }
});

// Audit (performance_audit_log)
router.get('/audit', async (req: Request, res: Response) => {
  try {
    const entityType = req.query.entityType as string | undefined;
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const offset = Number(req.query.offset) || 0;
    let sql = `SELECT id, user_id, action, entity_type, entity_id, before_value, after_value, created_at
               FROM performance_audit_log WHERE action LIKE 'performance.%'`;
    const params: unknown[] = [];
    let idx = 1;
    if (entityType) {
      sql += ` AND entity_type = $${idx}`;
      params.push(entityType);
      idx++;
    }
    sql += ` ORDER BY created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`;
    params.push(limit, offset);
    const result = await query(sql, params);
    const logs = result.rows.map((r: Record<string, unknown>) => ({
      id: r.id,
      adminId: r.user_id,
      action: r.action,
      entityType: r.entity_type,
      entityId: r.entity_id,
      timestamp: r.created_at,
      changes: r.before_value || r.after_value ? { before: r.before_value, after: r.after_value } : undefined,
    }));
    res.json(logs);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to get audit logs' });
  }
});

export const adminPerformanceRouter = router;
