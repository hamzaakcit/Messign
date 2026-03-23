import { Router, type Request } from 'express';
import { requireAdmin } from '../../middleware/adminAuth.js';
import { getByAuthUserId, getAllWithAuth, updateAccountStatus, clearLock, updateMustChangePassword } from '../../db/employeeAuthDb.js';
import { getPasswordPolicy, updatePasswordPolicy } from '../../db/settingsDb.js';
import { getLogs as getAuthAuditLogs, insert as insertAuthAudit } from '../../db/authAuditDb.js';
import * as passwordService from '../../services/passwordService.js';
import * as sessionService from '../../services/sessionService.js';
import { getEmployeeByIdAsUser } from '../../db/employeesDb.js';
import type { AccountStatus, PasswordPolicy } from '../../types/auth.js';

const router = Router();
router.use(requireAdmin);

function getAdminId(req: Request): string {
  return (req as Request & { adminUserId?: string }).adminUserId ?? 'unknown';
}

function getClientIp(req: Request): string | null {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return (typeof forwarded === 'string' ? forwarded : forwarded[0])?.trim().split(',')[0] ?? null;
  return req.ip ?? null;
}

// GET /api/admin/auth/policy
router.get('/policy', async (_req, res) => {
  try {
    const policy = await getPasswordPolicy();
    return res.json({ success: true, data: policy });
  } catch (e) {
    console.error('[admin/auth] policy get:', e);
    return res.status(500).json({ error: 'Failed to get policy' });
  }
});

// PUT /api/admin/auth/policy
router.put('/policy', async (req, res) => {
  try {
    const policy = await updatePasswordPolicy(req.body as Partial<PasswordPolicy>);
    return res.json({ success: true, data: policy });
  } catch (e) {
    console.error('[admin/auth] policy update:', e);
    return res.status(500).json({ error: 'Failed to update policy' });
  }
});

function stripSensitiveFields<T extends Record<string, unknown>>(obj: T): Omit<T, 'password_hash' | 'password_history' | 'temporary_password'> {
  const { password_hash: _ph, password_history: _phist, temporary_password: _tp, ...safe } = obj;
  return safe as Omit<T, 'password_hash' | 'password_history' | 'temporary_password'>;
}

// GET /api/admin/auth/employees
router.get('/employees', async (_req, res) => {
  try {
    const list = await getAllWithAuth();
    const sanitized = list.map((emp) => stripSensitiveFields(emp as unknown as Record<string, unknown>));
    return res.json({ success: true, data: sanitized });
  } catch (e) {
    console.error('[admin/auth] employees list:', e);
    return res.status(500).json({ error: 'Failed to list employees' });
  }
});

// GET /api/admin/auth/employees/:oddrooId
router.get('/employees/:oddrooId', async (req, res) => {
  const { oddrooId } = req.params;
  try {
    const auth = await getByAuthUserId(oddrooId);
    if (!auth) return res.status(404).json({ error: 'Employee auth not found' });
    const user = await getEmployeeByIdAsUser(oddrooId);
    return res.json({ success: true, data: { auth: stripSensitiveFields(auth as unknown as Record<string, unknown>), user } });
  } catch (e) {
    console.error('[admin/auth] employee get:', e);
    return res.status(500).json({ error: 'Failed to get employee' });
  }
});

// PUT /api/admin/auth/employees/:oddrooId/password
router.put('/employees/:oddrooId/password', async (req, res) => {
  const { oddrooId } = req.params;
  const { newPassword, forceChangeOnLogin } = req.body as { newPassword?: string; forceChangeOnLogin?: boolean };
  if (!newPassword || typeof newPassword !== 'string') {
    return res.status(400).json({ error: 'newPassword is required' });
  }
  try {
    await passwordService.setPasswordByAdmin(oddrooId, newPassword, forceChangeOnLogin ?? false, getAdminId(req), {
      ipAddress: getClientIp(req) ?? undefined,
      userAgent: req.headers['user-agent'] ?? undefined,
    });
    return res.json({ success: true, message: 'Password set' });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to set password';
    return res.status(400).json({ error: message });
  }
});

// POST /api/admin/auth/employees/:oddrooId/reset
router.post('/employees/:oddrooId/reset', async (req, res) => {
  const { oddrooId } = req.params;
  try {
    await passwordService.resetToDefaultPassword(oddrooId, getAdminId(req), {
      ipAddress: getClientIp(req) ?? undefined,
      userAgent: req.headers['user-agent'] ?? undefined,
    });
    return res.json({ success: true, message: 'Password reset to default' });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to reset password';
    return res.status(400).json({ error: message });
  }
});

// GET /api/admin/auth/employees/:oddrooId/password
router.get('/employees/:oddrooId/password', async (req, res) => {
  const { oddrooId } = req.params;
  try {
    const result = await passwordService.viewPassword(oddrooId, getAdminId(req), {
      ipAddress: getClientIp(req) ?? undefined,
      userAgent: req.headers['user-agent'] ?? undefined,
    });
    return res.json({
      success: true,
      data: {
        temporaryPassword: result.password,
        passwordSetAt: result.passwordSetAt,
        passwordSetBy: result.passwordSetBy,
        mustChangePassword: result.mustChangePassword,
        message: result.message,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to view password';
    return res.status(400).json({ error: message });
  }
});

// PUT /api/admin/auth/employees/:oddrooId/status
router.put('/employees/:oddrooId/status', async (req, res) => {
  const { oddrooId } = req.params;
  const { status } = req.body as { status?: string };
  if (!status || !['active', 'inactive', 'locked', 'pending'].includes(status)) {
    return res.status(400).json({ error: 'status must be active, inactive, locked, or pending' });
  }
  try {
    await updateAccountStatus(oddrooId, status as AccountStatus, getAdminId(req));
    await insertAuthAudit({
      auth_user_id: getAdminId(req),
      target_auth_user_id: oddrooId,
      action: 'account_status_changed',
      details: { status },
      ip_address: getClientIp(req) ?? null,
      user_agent: req.headers['user-agent'] ?? null,
      status: 'success',
      performed_by: getAdminId(req),
    });
    return res.json({ success: true, message: 'Status updated' });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to update status';
    return res.status(400).json({ error: message });
  }
});

// POST /api/admin/auth/employees/:oddrooId/unlock
router.post('/employees/:oddrooId/unlock', async (req, res) => {
  const { oddrooId } = req.params;
  try {
    await clearLock(oddrooId);
    await insertAuthAudit({
      auth_user_id: getAdminId(req),
      target_auth_user_id: oddrooId,
      action: 'account_unlocked',
      details: {},
      ip_address: getClientIp(req) ?? null,
      user_agent: req.headers['user-agent'] ?? null,
      status: 'success',
      performed_by: getAdminId(req),
    });
    return res.json({ success: true, message: 'Account unlocked' });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to unlock';
    return res.status(400).json({ error: message });
  }
});

// PUT /api/admin/auth/employees/:oddrooId/force-change
router.put('/employees/:oddrooId/force-change', async (req, res) => {
  const { oddrooId } = req.params;
  const { forceChange } = req.body as { forceChange?: boolean };
  try {
    const auth = await getByAuthUserId(oddrooId);
    if (!auth) return res.status(404).json({ error: 'Employee auth not found' });
    await updateMustChangePassword(oddrooId, forceChange ?? false, getAdminId(req));
    const action = forceChange ? 'force_password_change_enabled' : 'force_password_change_disabled';
    await insertAuthAudit({
      auth_user_id: getAdminId(req),
      target_auth_user_id: oddrooId,
      action,
      details: { forceChange: forceChange ?? false },
      ip_address: getClientIp(req) ?? null,
      user_agent: req.headers['user-agent'] ?? null,
      status: 'success',
      performed_by: getAdminId(req),
    });
    return res.json({ success: true, message: forceChange ? 'Force password change enabled' : 'Force password change disabled' });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to update';
    return res.status(400).json({ error: message });
  }
});

// DELETE /api/admin/auth/employees/:oddrooId/sessions
router.delete('/employees/:oddrooId/sessions', async (req, res) => {
  const { oddrooId } = req.params;
  try {
    await sessionService.revokeAllForUser(oddrooId);
    await insertAuthAudit({
      auth_user_id: getAdminId(req),
      target_auth_user_id: oddrooId,
      action: 'session_revoked',
      details: { all: true },
      ip_address: getClientIp(req) ?? null,
      user_agent: req.headers['user-agent'] ?? null,
      status: 'success',
      performed_by: getAdminId(req),
    });
    return res.json({ success: true, message: 'All sessions revoked' });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to revoke sessions';
    return res.status(400).json({ error: message });
  }
});

// GET /api/admin/auth/employees/:oddrooId/sessions
router.get('/employees/:oddrooId/sessions', async (req, res) => {
  const { oddrooId } = req.params;
  try {
    const sessions = await sessionService.getSessionsForUser(oddrooId);
    return res.json({ success: true, data: sessions });
  } catch (e) {
    console.error('[admin/auth] sessions get:', e);
    return res.status(500).json({ error: 'Failed to get sessions' });
  }
});

// GET /api/admin/auth/employees/:oddrooId/audit
router.get('/employees/:oddrooId/audit', async (req, res) => {
  const { oddrooId } = req.params;
  const limit = Math.min(parseInt(req.query.limit as string, 10) || 50, 200);
  const offset = parseInt(req.query.offset as string, 10) || 0;
  try {
    const logs = await getAuthAuditLogs({ target_auth_user_id: oddrooId, limit, offset });
    return res.json({ success: true, data: logs });
  } catch (e) {
    console.error('[admin/auth] audit get:', e);
    return res.status(500).json({ error: 'Failed to get audit log' });
  }
});

// GET /api/admin/auth/audit
router.get('/audit', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit as string, 10) || 50, 200);
  const offset = parseInt(req.query.offset as string, 10) || 0;
  const action = req.query.action as string | undefined;
  const targetAuthUserId = req.query.targetAuthUserId as string | undefined;
  try {
    const logs = await getAuthAuditLogs({ action, target_auth_user_id: targetAuthUserId, limit, offset });
    return res.json({ success: true, data: logs });
  } catch (e) {
    console.error('[admin/auth] audit list:', e);
    return res.status(500).json({ error: 'Failed to get audit logs' });
  }
});

// POST /api/admin/auth/bulk/reset
router.post('/bulk/reset', async (req, res) => {
  const { oddrooIds } = req.body as { oddrooIds?: string[] };
  if (!Array.isArray(oddrooIds) || oddrooIds.length === 0) {
    return res.status(400).json({ error: 'oddrooIds array is required' });
  }
  const adminId = getAdminId(req);
  const ip = getClientIp(req) ?? undefined;
  const userAgent = req.headers['user-agent'] ?? undefined;
  const results: { oddrooId: string; success: boolean; error?: string }[] = [];
  for (const oddrooId of oddrooIds) {
    try {
      await passwordService.resetToDefaultPassword(oddrooId, adminId, { ipAddress: ip, userAgent });
      results.push({ oddrooId, success: true });
    } catch (e) {
      results.push({ oddrooId, success: false, error: e instanceof Error ? e.message : 'Failed' });
    }
  }
  return res.json({ success: true, data: results });
});

// POST /api/admin/auth/bulk/force-change
router.post('/bulk/force-change', async (req, res) => {
  const { oddrooIds, forceChange } = req.body as { oddrooIds?: string[]; forceChange?: boolean };
  if (!Array.isArray(oddrooIds) || oddrooIds.length === 0) {
    return res.status(400).json({ error: 'oddrooIds array is required' });
  }
  const adminId = getAdminId(req);
  const results: { oddrooId: string; success: boolean; error?: string }[] = [];
  for (const oddrooId of oddrooIds) {
    try {
      await updateMustChangePassword(oddrooId, forceChange ?? true, adminId);
      await insertAuthAudit({
        auth_user_id: adminId,
        target_auth_user_id: oddrooId,
        action: forceChange ? 'force_password_change_enabled' : 'force_password_change_disabled',
        details: { forceChange: forceChange ?? true },
        ip_address: getClientIp(req) ?? null,
        user_agent: req.headers['user-agent'] ?? null,
        status: 'success',
        performed_by: adminId,
      });
      results.push({ oddrooId, success: true });
    } catch (e) {
      results.push({ oddrooId, success: false, error: e instanceof Error ? e.message : 'Failed' });
    }
  }
  return res.json({ success: true, data: results });
});

export const adminAuthRouter = router;
