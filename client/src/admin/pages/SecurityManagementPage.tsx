import { useState, useMemo } from 'react';
import { Search, MoreHorizontal, RefreshCw, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStore } from '@/stores/authStore';
import { adminAPI } from '@/lib/api';
import { useQuery } from '@/admin/hooks/useAdminQuery';
import { Button, Input, Avatar } from '@/components/ui';
import { DataTable, createSelectColumn } from '@/admin/components/DataTable';
import { EmployeeSecurityModal } from '@/admin/components/Security/EmployeeSecurityModal';
import { cn } from '@/lib/utils';
import { LoadingState } from '@/admin/components/LoadingState';

interface EmployeeAuthRow {
  id: string;
  auth_user_id: string;
  email: string;
  full_name?: string;
  role?: string;
  department?: string | null;
  account_status: string;
  must_change_password: boolean;
  last_login_at?: string | null;
  total_logins: number;
  failed_login_attempts: number;
  locked_until?: string | null;
}

export function SecurityManagementPage() {
  const { user } = useAuthStore();
  const userId = user?.id ?? '';
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedOddrooId, setSelectedOddrooId] = useState<string | null>(null);
  const [bulkResetLoading, setBulkResetLoading] = useState(false);
  const [bulkForceChangeLoading, setBulkForceChangeLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Record<string, boolean>>({});

  const { data: employeesRes, isLoading, error, refetch } = useQuery(
    ['admin-auth-employees', userId],
    () => adminAPI.auth.getEmployees(userId) as Promise<{ success: boolean; data: EmployeeAuthRow[] }>,
    { enabled: !!userId }
  );

  const employees = useMemo(() => {
    const list = employeesRes?.data ?? [];
    return Array.isArray(list) ? list : [];
  }, [employeesRes]);

  const filtered = useMemo(() => {
    let list = employees as EmployeeAuthRow[];
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (e) =>
          (e.email ?? '').toLowerCase().includes(q) ||
          (e.full_name ?? '').toLowerCase().includes(q) ||
          (e.auth_user_id ?? '').toLowerCase().includes(q)
      );
    }
    if (statusFilter) {
      list = list.filter((e) => e.account_status === statusFilter);
    }
    return list;
  }, [employees, search, statusFilter]);

  const stats = useMemo(() => {
    const total = employees.length;
    const active = employees.filter((e) => e.account_status === 'active').length;
    const locked = employees.filter((e) => e.account_status === 'locked').length;
    const pending = employees.filter((e) => e.must_change_password).length;
    return { total, active, locked, pending };
  }, [employees]);

  const handleBulkReset = async () => {
    const ids = Object.entries(selectedIds)
      .filter(([, v]) => v)
      .map(([k]) => k);
    if (ids.length === 0) {
      toast.error('Select at least one employee');
      return;
    }
    setBulkResetLoading(true);
    try {
      const res = await adminAPI.auth.bulkReset(userId, ids) as { success: boolean; data?: { oddrooId: string; success: boolean; error?: string }[] };
      const failed = res.data?.filter((r) => !r.success) ?? [];
      if (failed.length > 0) toast.error(`${failed.length} failed`);
      else toast.success('Passwords reset to default');
      refetch();
      setSelectedIds({});
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Bulk reset failed');
    } finally {
      setBulkResetLoading(false);
    }
  };

  const handleBulkForceChange = async () => {
    const ids = Object.entries(selectedIds)
      .filter(([, v]) => v)
      .map(([k]) => k);
    if (ids.length === 0) {
      toast.error('Select at least one employee');
      return;
    }
    setBulkForceChangeLoading(true);
    try {
      await adminAPI.auth.bulkForceChange(userId, ids, true) as { success: boolean };
      toast.success('Force password change enabled');
      refetch();
      setSelectedIds({});
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Bulk action failed');
    } finally {
      setBulkForceChangeLoading(false);
    }
  };

  const columns = useMemo(
    () => [
      createSelectColumn<EmployeeAuthRow>(),
      {
        id: 'employee',
        header: 'Employee',
        accessorFn: (row: EmployeeAuthRow) => row.full_name ?? row.email,
        cell: ({ row }: { row: { original: EmployeeAuthRow } }) => (
          <div className="flex items-center gap-3">
            <Avatar
              name={row.original.full_name ?? row.original.email}
              size="sm"
            />
            <div>
              <p className="font-medium text-[var(--app-text)]">{row.original.full_name ?? row.original.email}</p>
              <p className="text-xs text-[var(--app-text-muted)]">{row.original.email}</p>
            </div>
          </div>
        ),
      },
      {
        id: 'department',
        header: 'Department',
        accessorFn: (row: EmployeeAuthRow) => row.department ?? '—',
        cell: (info: { getValue: () => unknown }) => String(info.getValue()),
      },
      {
        id: 'status',
        header: 'Status',
        accessorFn: (row: EmployeeAuthRow) => row.account_status,
        cell: ({ row }: { row: { original: EmployeeAuthRow } }) => {
          const s = row.original.account_status;
          const pending = row.original.must_change_password;
          return (
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium',
                  s === 'active' && 'bg-green-500/10 text-green-500',
                  s === 'locked' && 'bg-red-500/10 text-red-500',
                  s === 'inactive' && 'bg-gray-500/10 text-app-muted',
                  s === 'pending' && 'bg-yellow-500/10 text-yellow-500'
                )}
              >
                {s === 'active' ? 'Active' : s === 'locked' ? 'Locked' : s === 'inactive' ? 'Inactive' : 'Pending'}
              </span>
              {pending && (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-amber-500/10 text-amber-500">
                  Pending change
                </span>
              )}
            </div>
          );
        },
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }: { row: { original: EmployeeAuthRow } }) => (
          <button
            type="button"
            onClick={() => setSelectedOddrooId(row.original.auth_user_id)}
            className="p-2 rounded-lg hover:bg-[var(--app-hover)] text-[var(--app-text-muted)]"
            aria-label="Open security settings"
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>
        ),
        size: 48,
      },
    ],
    []
  );

  if (isLoading || !userId) return <LoadingState />;
  if (error) return <div className="p-6 text-red-500">Failed to load employees</div>;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--app-text)]">Security Management</h1>
        <p className="text-sm text-[var(--app-text-muted)] mt-1">Manage employee passwords and access</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-[var(--app-card)] border border-[var(--app-border)]">
          <p className="text-sm text-[var(--app-text-muted)]">Total Users</p>
          <p className="text-2xl font-bold text-[var(--app-text)] mt-1">{stats.total}</p>
        </div>
        <div className="p-4 rounded-xl bg-[var(--app-card)] border border-[var(--app-border)]">
          <p className="text-sm text-[var(--app-text-muted)]">Active Sessions</p>
          <p className="text-2xl font-bold text-[var(--app-text)] mt-1">—</p>
        </div>
        <div className="p-4 rounded-xl bg-[var(--app-card)] border border-[var(--app-border)]">
          <p className="text-sm text-[var(--app-text-muted)]">Locked Accounts</p>
          <p className="text-2xl font-bold text-red-500 mt-1">{stats.locked}</p>
        </div>
        <div className="p-4 rounded-xl bg-[var(--app-card)] border border-[var(--app-border)]">
          <p className="text-sm text-[var(--app-text-muted)]">Pending Password Change</p>
          <p className="text-2xl font-bold text-amber-500 mt-1">{stats.pending}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--app-text-muted)]" />
          <Input
            placeholder="Search employees..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 w-full"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-[var(--app-border)] bg-[var(--app-card)] px-3 py-2 text-sm text-[var(--app-text)]"
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="locked">Locked</option>
          <option value="inactive">Inactive</option>
          <option value="pending">Pending</option>
        </select>
        <Button
          variant="secondary"
          size="sm"
          onClick={handleBulkReset}
          disabled={bulkResetLoading || Object.values(selectedIds).every((v) => !v)}
        >
          <RefreshCw className={cn('w-4 h-4 mr-2', bulkResetLoading && 'animate-spin')} />
          Reset to Default
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={handleBulkForceChange}
          disabled={bulkForceChangeLoading || Object.values(selectedIds).every((v) => !v)}
        >
          <Lock className="w-4 h-4 mr-2" />
          Force Password Change
        </Button>
      </div>

      <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-card)] overflow-hidden">
        <DataTable
          data={filtered.map((r) => ({ ...r, id: r.auth_user_id }))}
          columns={columns}
          onRowSelect={(rows) => {
            const next: Record<string, boolean> = {};
            (rows as EmployeeAuthRow[]).forEach((r) => {
              next[r.auth_user_id] = true;
            });
            setSelectedIds(next);
          }}
        />
      </div>

      {selectedOddrooId && (
        <EmployeeSecurityModal
          oddrooId={selectedOddrooId}
          onClose={() => setSelectedOddrooId(null)}
          onUpdated={() => refetch()}
        />
      )}
    </div>
  );
}
