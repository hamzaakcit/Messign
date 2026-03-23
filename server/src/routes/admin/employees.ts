import { Router, type Request } from 'express';
import type { Server } from 'socket.io';
import type { User, UserStatus } from '../../types/index.js';
import { query } from '../../db/index.js';
import {
  getEmployeesAsUsers,
  getEmployeeByIdAsUser,
  getEmployeeById,
  getLevelFromXp,
} from '../../db/employeesDb.js';
import { getBadgesForUser, getBadgesForUsers } from '../../db/badgesDb.js';
import { addAuditLog } from '../../db/auditDb.js';
import { requireAdmin } from '../../middleware/adminAuth.js';

function getIo(req: Request): Server | undefined {
  return req.app.get('io') as Server | undefined;
}

const router = Router();
router.use(requireAdmin);

async function getDeptNameToId(): Promise<Record<string, string>> {
  const result = await query<{ id: string; name: string }>(
    `SELECT id::text AS id, team_name AS name FROM performance_teams WHERE is_active = TRUE`
  );
  const map: Record<string, string> = {};
  for (const row of result.rows) {
    map[row.name] = row.id;
  }
  return map;
}

async function toEmployee(u: User, deptNameToId: Record<string, string>, badges?: import('../../types/index.js').Badge[]) {
  const resolvedBadges = badges ?? await getBadgesForUser(u.id);
  return {
    ...u,
    badges: resolvedBadges,
    departmentId: deptNameToId[u.department] ?? u.department,
    employeeId: u.id.startsWith('user-') ? u.id.replace('user-', 'EMP') : u.id,
    joinDate: u.joinedAt,
    phone: u.phone,
    location: u.location,
  };
}

router.get('/', async (_req, res) => {
  try {
    const [users, deptNameToId] = await Promise.all([
      getEmployeesAsUsers(),
      getDeptNameToId(),
    ]);
    const badgesMap = await getBadgesForUsers(users.map((u) => u.id));
    const list = await Promise.all(users.map((u) => toEmployee(u, deptNameToId, badgesMap.get(u.id) ?? [])));
    res.json(list);
  } catch (e) {
    console.error('[admin/employees]', e);
    res.status(500).json({ error: 'Failed to load employees' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const user = await getEmployeeByIdAsUser(req.params.id);
    if (!user) {
      res.status(404).json({ error: 'Employee not found' });
      return;
    }
    const deptNameToId = await getDeptNameToId();
    res.json(await toEmployee(user, deptNameToId));
  } catch (e) {
    console.error('[admin/employees]', e);
    res.status(500).json({ error: 'Failed to load employee' });
  }
});

router.post('/', async (req, res) => {
  try {
    const body = req.body as Record<string, unknown>;
    const orgResult = await query<{ id: string }>(
      `SELECT id FROM organizations WHERE slug = 'messign' LIMIT 1`
    );
    const orgId = orgResult.rows[0]?.id;
    if (!orgId) {
      res.status(503).json({ error: 'Organization not configured' });
      return;
    }
    const id = `user-${Date.now()}`;
    const fullName = `${body.firstName ?? ''} ${body.lastName ?? ''}`.trim() || 'New User';
    const email = (body.email as string) || `${id}@messign.com`;
    const role = (body.role as string) === 'admin' ? 'admin' : (body.role as string) === 'manager' ? 'manager' : 'employee';
    await query(
      `INSERT INTO reimbursement_users (organization_id, auth_user_id, email, full_name, role, job_title, xp, level, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 1, 'offline')`,
      [orgId, id, email, fullName, role, (body.jobTitle as string) ?? role, (body.xp as number) ?? 0]
    );
    const departmentId = body.departmentId as string | undefined;
    if (departmentId) {
      await query(
        `INSERT INTO performance_team_members (team_id, employee_id, role_in_team, start_date, is_active)
         VALUES ($1, $2, 'member', CURRENT_DATE, TRUE)
         ON CONFLICT (team_id, employee_id) DO NOTHING`,
        [departmentId, id]
      );
    }
    const user = await getEmployeeByIdAsUser(id);
    const deptNameToId = await getDeptNameToId();
    const employee = user ? await toEmployee(user, deptNameToId) : await toEmployee({
      id, email, name: fullName, avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${id}`,
      jobTitle: (body.jobTitle as string) ?? role, department: 'General', level: 1, xp: (body.xp as number) ?? 0,
      xpToNextLevel: 1000, badges: [], stats: { tasksCompleted: 0, messagesSent: 0, hoursLogged: 0, projectsContributed: 0, documentsCreated: 0 },
      status: 'offline' as UserStatus, role: role as 'admin' | 'manager' | 'member', joinedAt: new Date().toISOString(),
    }, deptNameToId);
    addAuditLog({
      adminId: (req as { adminUserId?: string }).adminUserId ?? 'unknown',
      action: 'employee.created',
      entityType: 'employee',
      entityId: id,
      description: `Created employee ${fullName}`,
    });
    getIo(req)?.emit('employee:added', { employee });
    res.status(201).json(employee);
  } catch (e) {
    console.error('[admin/employees] POST', e);
    res.status(500).json({ error: 'Failed to create employee' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const row = await getEmployeeById(req.params.id);
    if (!row) {
      res.status(404).json({ error: 'Employee not found' });
      return;
    }
    const body = req.body as Record<string, unknown>;
    const id = row.auth_user_id ?? row.id;
    const updates: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;
    if (body.email != null) {
      updates.push(`email = $${paramIdx++}`);
      params.push(body.email);
    }
    if (body.name != null) {
      updates.push(`full_name = $${paramIdx++}`);
      params.push(body.name);
    }
    if (body.jobTitle != null) {
      updates.push(`job_title = $${paramIdx++}`);
      params.push(body.jobTitle);
    }
    if (body.role != null) {
      const role = body.role === 'admin' ? 'admin' : body.role === 'manager' ? 'manager' : 'employee';
      updates.push(`role = $${paramIdx++}`);
      params.push(role);
    }
    if (body.xp != null) {
      const xp = body.xp as number;
      updates.push(`xp = $${paramIdx++}`);
      params.push(xp);
      updates.push(`level = $${paramIdx++}`);
      params.push(getLevelFromXp(xp));
    }
    if (body.status != null) {
      updates.push(`status = $${paramIdx++}`);
      params.push(body.status);
    }
    if (updates.length > 0) {
      params.push(row.id);
      await query(
        `UPDATE reimbursement_users SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${paramIdx}`,
        params
      );
    }
    const departmentId = body.departmentId as string | undefined;
    if (departmentId != null && departmentId !== '') {
      await query(
        `DELETE FROM performance_team_members WHERE employee_id = $1`,
        [id]
      );
      await query(
        `INSERT INTO performance_team_members (team_id, employee_id, role_in_team, start_date, is_active)
         VALUES ($1, $2, 'member', CURRENT_DATE, TRUE)
         ON CONFLICT (team_id, employee_id) DO NOTHING`,
        [departmentId, id]
      );
    }
    const user = await getEmployeeByIdAsUser(req.params.id);
    if (!user) {
      res.status(404).json({ error: 'Employee not found' });
      return;
    }
    const deptNameToId = await getDeptNameToId();
    const employee = await toEmployee(user, deptNameToId);
    if (body.xp != null) {
      getIo(req)?.emit('xp:updated', {
        userId: user.id,
        newXP: user.xp,
        xpAmount: (body.xp as number) - (row.xp ?? 0),
      });
    }
    await addAuditLog({
      adminId: (req as { adminUserId?: string }).adminUserId ?? 'unknown',
      action: 'employee.updated',
      entityType: 'employee',
      entityId: user.id,
      description: `Updated employee ${user.name}`,
    });
    getIo(req)?.emit('employee:updated', { employee });
    res.json(employee);
  } catch (e) {
    console.error('[admin/employees] PUT', e);
    res.status(500).json({ error: 'Failed to update employee' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const row = await getEmployeeById(req.params.id);
    if (!row) {
      res.status(404).json({ error: 'Employee not found' });
      return;
    }
    const id = row.auth_user_id ?? row.id;
    await query(`DELETE FROM performance_team_members WHERE employee_id = $1`, [id]);
    await query(`DELETE FROM reimbursement_users WHERE id = $1`, [row.id]);
    await addAuditLog({
      adminId: (req as { adminUserId?: string }).adminUserId ?? 'unknown',
      action: 'employee.deleted',
      entityType: 'employee',
      entityId: id,
      description: `Deleted employee ${row.full_name}`,
    });
    getIo(req)?.emit('employee:deleted', { id });
    res.status(204).send();
  } catch (e) {
    console.error('[admin/employees] DELETE', e);
    res.status(500).json({ error: 'Failed to delete employee' });
  }
});

export const adminEmployeesRouter = router;
