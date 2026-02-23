import { useState, useEffect } from 'react';
import { RefreshCw, Unlock, LogOut, Eye, Copy, Check } from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStore } from '@/stores/authStore';
import { adminAPI } from '@/lib/api';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Avatar } from '@/components/ui/Avatar';
import { format } from 'date-fns';

interface EmployeeSecurityModalProps {
  oddrooId: string;
  onClose: () => void;
  onUpdated: () => void;
}

export function EmployeeSecurityModal({ oddrooId, onClose, onUpdated }: EmployeeSecurityModalProps) {
  const { user } = useAuthStore();
  const userId = user?.id ?? '';
  const [loading, setLoading] = useState(true);
  const [employee, setEmployee] = useState<{ auth: unknown; user: unknown } | null>(null);
  const [sessions, setSessions] = useState<unknown[]>([]);
  const [auditLogs, setAuditLogs] = useState<unknown[]>([]);
  const [passwordView, setPasswordView] = useState<{ temporaryPassword: string | null; message: string } | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [forceChange, setForceChange] = useState(true);
  const [status, setStatus] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const auth = employee?.auth as {
    account_status: string;
    must_change_password: boolean;
    last_login_at: string | null;
    last_login_device: string | null;
    total_logins: number;
    failed_login_attempts?: number;
    password_changed_at: string | null;
    updated_by: string;
  } | undefined;
  const profile = employee?.user as { name?: string; email?: string; jobTitle?: string; department?: string; role?: string } | undefined;

  const refetchModal = () => {
    if (!userId || !oddrooId) return;
    Promise.all([
      adminAPI.auth.getEmployee(userId, oddrooId) as Promise<{ success: boolean; data: { auth: unknown; user: unknown } }>,
      adminAPI.auth.getSessions(userId, oddrooId) as Promise<{ success: boolean; data: unknown[] }>,
      adminAPI.auth.getEmployeeAudit(userId, oddrooId, { limit: 10 }) as Promise<{ success: boolean; data: unknown[] }>,
    ]).then(([empRes, sessRes, auditRes]) => {
      if (empRes?.data) setEmployee(empRes.data);
      if (empRes?.data?.auth && typeof empRes.data.auth === 'object' && 'account_status' in empRes.data.auth) {
        setStatus((empRes.data.auth as { account_status: string }).account_status);
      }
      setSessions(sessRes?.data ?? []);
      setAuditLogs(auditRes?.data ?? []);
    });
  };

  useEffect(() => {
    if (!userId || !oddrooId) return;
    setLoading(true);
    Promise.all([
      adminAPI.auth.getEmployee(userId, oddrooId) as Promise<{ success: boolean; data: { auth: unknown; user: unknown } }>,
      adminAPI.auth.getSessions(userId, oddrooId) as Promise<{ success: boolean; data: unknown[] }>,
      adminAPI.auth.getEmployeeAudit(userId, oddrooId, { limit: 10 }) as Promise<{ success: boolean; data: unknown[] }>,
    ])
      .then(([empRes, sessRes, auditRes]) => {
        if (empRes?.data) setEmployee(empRes.data);
        if (empRes?.data?.auth && typeof empRes.data.auth === 'object' && 'account_status' in empRes.data.auth) {
          setStatus((empRes.data.auth as { account_status: string }).account_status);
        }
        setSessions(sessRes?.data ?? []);
        setAuditLogs(auditRes?.data ?? []);
      })
      .catch(() => toast.error('Failed to load employee'))
      .finally(() => setLoading(false));
  }, [userId, oddrooId]);

  const handleViewPassword = async () => {
    setActionLoading(true);
    try {
      const res = await adminAPI.auth.viewPassword(userId, oddrooId) as { success: boolean; data: { temporaryPassword: string | null; message: string } };
      setPasswordView({ temporaryPassword: res.data?.temporaryPassword ?? null, message: res.data?.message ?? '' });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to view password');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCopyPassword = () => {
    if (passwordView?.temporaryPassword) {
      navigator.clipboard.writeText(passwordView.temporaryPassword);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success('Copied to clipboard');
    }
  };

  const handleSetPassword = async () => {
    if (!newPassword.trim()) return;
    setActionLoading(true);
    try {
      await adminAPI.auth.setPassword(userId, oddrooId, { newPassword: newPassword.trim(), forceChangeOnLogin: forceChange });
      toast.success('Password set');
      setNewPassword('');
      refetchModal();
      onUpdated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to set password');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReset = async () => {
    setActionLoading(true);
    try {
      await adminAPI.auth.resetPassword(userId, oddrooId);
      toast.success('Password reset to default');
      setPasswordView(null);
      refetchModal();
      onUpdated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to reset');
    } finally {
      setActionLoading(false);
    }
  };

  const handleUnlock = async () => {
    setActionLoading(true);
    try {
      await adminAPI.auth.unlock(userId, oddrooId);
      toast.success('Account unlocked');
      setStatus('active');
      refetchModal();
      onUpdated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to unlock');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRevokeSessions = async () => {
    setActionLoading(true);
    try {
      await adminAPI.auth.revokeSessions(userId, oddrooId);
      toast.success('All sessions revoked');
      setSessions([]);
      refetchModal();
      onUpdated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to revoke sessions');
    } finally {
      setActionLoading(false);
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    setActionLoading(true);
    try {
      await adminAPI.auth.updateStatus(userId, oddrooId, newStatus);
      setStatus(newStatus);
      toast.success('Status updated');
      refetchModal();
      onUpdated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to update status');
    } finally {
      setActionLoading(false);
    }
  };

  const handleForceChangeToggle = async (checked: boolean) => {
    setActionLoading(true);
    try {
      await adminAPI.auth.updateForceChange(userId, oddrooId, checked);
      toast.success(checked ? 'Force password change enabled' : 'Force password change disabled');
      refetchModal();
      onUpdated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to update');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <Modal isOpen onClose={onClose} title="Employee Security" size="xl">
        <div className="py-8 text-center text-[var(--app-text-muted)]">Loading...</div>
      </Modal>
    );
  }

  if (!employee) {
    return (
      <Modal isOpen onClose={onClose} title="Employee Security" size="xl">
        <div className="py-8 text-center text-red-500">Employee not found</div>
      </Modal>
    );
  }

  return (
    <Modal isOpen onClose={onClose} title="Employee Security Settings" size="xl">
      <div className="space-y-6">
        <div className="flex items-start gap-4 p-4 rounded-lg bg-[var(--app-card)] border border-[var(--app-border)]">
          <Avatar name={profile?.name ?? profile?.email} size="lg" />
          <div>
            <p className="font-semibold text-[var(--app-text)]">{profile?.name ?? profile?.email}</p>
            <p className="text-sm text-[var(--app-text-muted)]">{profile?.email}</p>
            <p className="text-xs text-[var(--app-text-muted)] mt-1">
              {profile?.role ?? ''} • {profile?.department ?? '—'}
            </p>
            <p className="text-xs text-[var(--app-text-muted)]">Employee ID: {oddrooId}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 rounded-lg border border-[var(--app-border)]">
            <p className="text-sm font-medium text-[var(--app-text-muted)] mb-2">Account Status</p>
            <select
              value={status}
              onChange={(e) => handleStatusChange(e.target.value)}
              disabled={actionLoading}
              className="w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-card)] px-3 py-2 text-sm text-[var(--app-text)]"
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="locked">Locked</option>
              <option value="pending">Pending</option>
            </select>
            <p className="text-xs text-[var(--app-text-muted)] mt-2">Failed attempts: {auth?.failed_login_attempts ?? 0}</p>
          </div>
          <div className="p-4 rounded-lg border border-[var(--app-border)]">
            <p className="text-sm font-medium text-[var(--app-text-muted)] mb-2">Login Activity</p>
            <p className="text-sm text-[var(--app-text)]">
              Last login: {auth?.last_login_at ? format(new Date(auth.last_login_at), 'PPp') : 'Never'}
            </p>
            <p className="text-xs text-[var(--app-text-muted)]">{auth?.last_login_device ?? '—'}</p>
            <p className="text-sm text-[var(--app-text)] mt-2">Total logins: {auth?.total_logins ?? 0}</p>
            <p className="text-sm text-[var(--app-text)]">Active sessions: {Array.isArray(sessions) ? sessions.length : 0}</p>
          </div>
        </div>

        <div className="p-4 rounded-lg border border-[var(--app-border)] space-y-4">
          <p className="text-sm font-medium text-[var(--app-text)]">Password Management</p>
          <p className="text-xs text-[var(--app-text-muted)]">
            Last changed: {auth?.password_changed_at ? format(new Date(auth.password_changed_at), 'PP') : 'Never'} • By: {auth?.updated_by ?? '—'}
          </p>
          <div className="flex items-center gap-2">
            <span className="text-xs text-[var(--app-text-muted)]">Force change on login:</span>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={auth?.must_change_password ?? false}
                onChange={(e) => handleForceChangeToggle(e.target.checked)}
                disabled={actionLoading}
                className="rounded border-[var(--app-border)]"
              />
              <span className="text-sm text-[var(--app-text)]">{auth?.must_change_password ? 'Yes' : 'No'}</span>
            </label>
          </div>
          <div>
            <Button variant="secondary" size="sm" onClick={handleViewPassword} disabled={actionLoading}>
              <Eye className="w-4 h-4 mr-2" /> View Password
            </Button>
            {passwordView && (
              <div className="mt-2 p-3 rounded bg-[var(--app-bg)] text-sm">
                <p className="text-[var(--app-text-muted)]">{passwordView.message}</p>
                {passwordView.temporaryPassword && (
                  <div className="flex items-center gap-2 mt-2">
                    <code className="px-2 py-1 rounded bg-[var(--app-card)] font-mono text-xs">
                      {passwordView.temporaryPassword}
                    </code>
                    <Button variant="ghost" size="sm" onClick={handleCopyPassword}>
                      {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="flex gap-2 items-end flex-wrap">
            <Input
              type="password"
              placeholder="New password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="max-w-xs"
            />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={forceChange} onChange={(e) => setForceChange(e.target.checked)} />
              Force change on login
            </label>
            <Button onClick={handleSetPassword} disabled={!newPassword.trim() || actionLoading}>
              Set Password
            </Button>
          </div>
        </div>

        <div className="flex gap-2 flex-wrap">
          <Button variant="secondary" size="sm" onClick={handleReset} disabled={actionLoading}>
            <RefreshCw className="w-4 h-4 mr-2" /> Reset to Default
          </Button>
          {status === 'locked' && (
            <Button variant="secondary" size="sm" onClick={handleUnlock} disabled={actionLoading}>
              <Unlock className="w-4 h-4 mr-2" /> Unlock Account
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={handleRevokeSessions} disabled={actionLoading}>
            <LogOut className="w-4 h-4 mr-2" /> Revoke All Sessions
          </Button>
        </div>

        {Array.isArray(sessions) && sessions.length > 0 && (
          <div>
            <p className="text-sm font-medium text-[var(--app-text)] mb-2">Active Sessions ({sessions.length})</p>
            <ul className="space-y-2">
              {(sessions as { id: string; device_name?: string; browser?: string; ip_address?: string; last_activity_at?: string }[]).map((s) => (
                <li key={s.id} className="flex items-center justify-between p-2 rounded bg-[var(--app-card)] text-sm">
                  <span>{s.device_name ?? s.browser ?? 'Unknown'} • {s.ip_address ?? '—'}</span>
                  <span className="text-[var(--app-text-muted)]">
                    {s.last_activity_at ? format(new Date(s.last_activity_at), 'PPp') : '—'}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div>
          <p className="text-sm font-medium text-[var(--app-text)] mb-2">Recent Security Activity</p>
          <ul className="space-y-1 text-sm">
            {(auditLogs as { action: string; status: string; created_at: string }[]).slice(0, 5).map((log, i) => (
              <li key={i} className="flex items-center gap-2 text-[var(--app-text-muted)]">
                <span>{log.status === 'success' ? '✅' : '❌'}</span>
                {log.action} • {format(new Date(log.created_at), 'PPp')}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Modal>
  );
}
