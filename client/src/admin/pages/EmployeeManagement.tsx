import { useState, useMemo, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import {
  UserPlus,
  Upload,
  Download,
  Search,
  LayoutGrid,
  List,
  MoreHorizontal,
  Eye,
  Pencil,
  Trash2,
  RefreshCw,
  Building2,
  PenTool,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button, Input, Avatar } from '@/components/ui';
import { DataTable, createSelectColumn } from '@/admin/components/DataTable';
import { BulkActionToolbar } from '@/admin/components/BulkActionToolbar';
import { EmployeeDetailPanel } from '@/admin/components/EmployeeManagement/EmployeeDetailPanel';
import {
  ChangeDepartmentModal,
  ChangeRoleModal,
  AdjustXPModal,
  AwardBadgeModal,
  SendMessageModal,
} from '@/admin/components/EmployeeManagement/BulkActionModals';
import { useAuthStore } from '@/stores/authStore';
import { useQuery } from '@/admin/hooks/useAdminQuery';
import { adminAPI } from '@/lib/api';
import { onEmployeeAdded, onEmployeeUpdated, onEmployeeDeleted, onEmployeeBulkImport } from '@/lib/socket';
import type { Employee } from '@/admin/types';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { LoadingState } from '@/admin/components/LoadingState';
import { BankDetailsModal } from '@/components/invoices/BankDetailsModal';
import { SignaturePad } from '@/components/invoices/SignaturePad';

export function EmployeeManagement() {
  const { user } = useAuthStore();
  const userId = user?.id ?? '';
  const [search, setSearch] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
  const [selectedRows, setSelectedRows] = useState<Employee[]>([]);
  const [detailEmployee, setDetailEmployee] = useState<Employee | null>(null);
  const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({});
  const [actionsOpenId, setActionsOpenId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [showChangeDept, setShowChangeDept] = useState(false);
  const [showChangeRole, setShowChangeRole] = useState(false);
  const [showAdjustXP, setShowAdjustXP] = useState(false);
  const [showAwardBadge, setShowAwardBadge] = useState(false);
  const [showSendMessage, setShowSendMessage] = useState(false);
  const [bankDetailsTarget, setBankDetailsTarget] = useState<{ id: string; name: string } | null>(null);
  const [signatureTarget, setSignatureTarget] = useState<{ id: string; name: string } | null>(null);
  const actionsRef = useRef<HTMLDivElement>(null);

  const { data: employeesData, isLoading, error: employeesError, refetch } = useQuery(
    ['employees', userId],
    () => adminAPI.employees.getAll(userId) as Promise<Employee[]>,
    { enabled: !!userId }
  );

  const { data: departmentsData } = useQuery(
    ['admin-departments', userId],
    () => adminAPI.departments.getAll(userId) as Promise<{ id: string; name: string }[]>,
    { enabled: !!userId }
  );

  const employees = useMemo(() => {
    const list = Array.isArray(employeesData) ? (employeesData as Employee[]) : [];
    return list.map((e) => ({
      ...e,
      department: e.department ?? (e as { departmentId?: string }).departmentId ?? '',
    }));
  }, [employeesData]);

  const columns = useMemo<ColumnDef<Employee, unknown>[]>(() => {
    const cols: ColumnDef<Employee, unknown>[] = [
      createSelectColumn<Employee>(),
      {
        id: 'avatar',
        header: '',
        accessorFn: (row) => row.name,
        cell: ({ row }) => (
          <Avatar
            src={row.original.avatar}
            name={row.original.name}
            size="sm"
            status={row.original.status}
          />
        ),
        size: 48,
      },
      {
        id: 'employeeId',
        header: 'ID',
        accessorFn: (row) => (row as Employee & { employeeId?: string }).employeeId ?? row.id,
        cell: (info) => info.getValue() as string,
        enableSorting: true,
      },
      {
        id: 'name',
        header: 'Name',
        accessorKey: 'name',
        cell: (info) => info.getValue() as string,
        enableSorting: true,
      },
      {
        id: 'email',
        header: 'Email',
        accessorKey: 'email',
        cell: (info) => info.getValue() as string,
        enableSorting: true,
      },
      {
        id: 'department',
        header: 'Department',
        accessorKey: 'department',
        cell: (info) => info.getValue() as string,
        enableSorting: true,
      },
      {
        id: 'role',
        header: 'Role',
        accessorKey: 'role',
        cell: (info) => {
          const role = info.getValue() as string;
          const roleClass =
            role === 'admin'
              ? 'px-2 py-0.5 rounded text-xs font-medium bg-primary-500 text-app-text'
              : role === 'manager'
                ? 'px-2 py-0.5 rounded text-xs font-medium bg-accent-500 text-app-text'
                : 'px-2 py-0.5 rounded text-xs font-medium bg-app-surface-tertiary text-app-muted';
          return <span className={roleClass}>{role ?? '—'}</span>;
        },
        enableSorting: true,
      },
      {
        id: 'level',
        header: 'Level',
        accessorKey: 'level',
        cell: (info) => info.getValue() as number,
        enableSorting: true,
      },
      {
        id: 'xp',
        header: 'MP',
        accessorKey: 'xp',
        cell: (info) => (info.getValue() as number).toLocaleString(),
        enableSorting: true,
      },
      {
        id: 'status',
        header: 'Status',
        accessorKey: 'status',
        cell: (info) => {
          const status = info.getValue() as string;
          const statusClass =
            status === 'online'
              ? 'inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium bg-green-100 dark:bg-green-500/20 text-green-800 dark:text-green-400'
              : status === 'away'
                ? 'inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium bg-amber-100 dark:bg-amber-500/20 text-amber-800 dark:text-amber-400'
                : status === 'busy'
                  ? 'inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium bg-orange-100 dark:bg-orange-500/20 text-orange-800 dark:text-orange-400'
                  : 'inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium bg-gray-100 dark:bg-gray-500/20 text-gray-700 dark:text-app-muted';
          return <span className={cn('capitalize', statusClass)}>{status ?? '—'}</span>;
        },
        enableSorting: true,
      },
      {
        id: 'joinedAt',
        header: 'Join Date',
        accessorKey: 'joinedAt',
        cell: (info) => {
          const v = info.getValue() as string | undefined;
          return v ? format(new Date(v), 'MMM d, yyyy') : '—';
        },
        enableSorting: true,
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => {
          const emp = row.original;
          const open = actionsOpenId === emp.id;
          return (
            <div className="flex items-center gap-1 relative" ref={open ? actionsRef : undefined}>
              <button
                type="button"
                onClick={() => setDetailEmployee(emp)}
                className="p-1.5 rounded hover:bg-app-hover text-app-muted hover:text-app"
                aria-label="View profile"
              >
                <Eye className="w-4 h-4" />
              </button>
              <Link to={`/admin/employees/${emp.id}`}>
                <button
                  type="button"
                  className="p-1.5 rounded hover:bg-app-hover text-app-muted hover:text-app"
                  aria-label="Edit"
                >
                  <Pencil className="w-4 h-4" />
                </button>
              </Link>
              <button
                type="button"
                onClick={() => setActionsOpenId(open ? null : emp.id)}
                className="p-1.5 rounded hover:bg-app-hover text-app-muted hover:text-app"
                aria-label="More actions"
                aria-expanded={open}
              >
                <MoreHorizontal className="w-4 h-4" />
              </button>
              {open && (
                <div
                  className="absolute right-0 top-full mt-1 w-44 py-1 rounded-lg bg-app-card border border-app-border shadow-xl z-50"
                  role="menu"
                >
                  <button
                    type="button"
                    role="menuitem"
                    className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-app hover:bg-app-hover"
                    onClick={() => {
                      setDetailEmployee(emp);
                      setActionsOpenId(null);
                    }}
                  >
                    <Eye className="w-4 h-4" />
                    View details
                  </button>
                  <Link to={`/admin/employees/${emp.id}`} onClick={() => setActionsOpenId(null)}>
                    <span
                      role="menuitem"
                      className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-app hover:bg-app-hover"
                    >
                      <Pencil className="w-4 h-4" />
                      Edit
                    </span>
                  </Link>
                  {user?.role === 'admin' && (
                    <button
                      type="button"
                      role="menuitem"
                      className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-app hover:bg-app-hover"
                      onClick={() => { setBankDetailsTarget({ id: emp.id, name: emp.name || emp.id }); setActionsOpenId(null); }}
                    >
                      <Building2 className="w-4 h-4" />
                      Bank Details
                    </button>
                  )}
                  <button
                    type="button"
                    role="menuitem"
                    className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-app hover:bg-app-hover"
                    onClick={() => { setSignatureTarget({ id: emp.id, name: emp.name || emp.id }); setActionsOpenId(null); }}
                  >
                    <PenTool className="w-4 h-4" />
                    Signature
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-danger-400 hover:bg-danger-500/10"
                    onClick={() => handleDelete(emp)}
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete
                  </button>
                </div>
              )}
            </div>
          );
        },
        size: 120,
      },
    ];
    return cols;
  }, [actionsOpenId, userId]);

  const filteredData = useMemo(() => {
    let list = employees;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (e) =>
          e.name.toLowerCase().includes(q) ||
          e.email.toLowerCase().includes(q) ||
          (e.department ?? '').toLowerCase().includes(q) ||
          (e.role ?? '').toLowerCase().includes(q)
      );
    }
    if (departmentFilter) list = list.filter((e) => (e.department ?? '') === departmentFilter);
    if (roleFilter) list = list.filter((e) => (e.role ?? '') === roleFilter);
    return list;
  }, [employees, search, departmentFilter, roleFilter]);

  const departments = useMemo(() => {
    const fromApi = Array.isArray(departmentsData) ? (departmentsData as { id: string; name: string }[]).map((d) => d.name) : [];
    const fromEmployees = new Set(employees.map((e) => e.department).filter(Boolean));
    fromApi.forEach((n) => fromEmployees.add(n));
    return ['General', ...Array.from(fromEmployees).filter((d) => d !== 'General').sort()];
  }, [employees, departmentsData]);

  useEffect(() => {
    if (!actionsOpenId) return;
    const onMouseDown = (e: MouseEvent) => {
      if (actionsRef.current?.contains(e.target as Node)) return;
      setActionsOpenId(null);
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [actionsOpenId]);

  useEffect(() => {
    const unsubAdded = onEmployeeAdded(() => refetch());
    const unsubUpdated = onEmployeeUpdated(() => refetch());
    const unsubDeleted = onEmployeeDeleted(() => refetch());
    const unsubBulkImport = onEmployeeBulkImport(() => refetch());
    return () => {
      unsubAdded();
      unsubUpdated();
      unsubDeleted();
      unsubBulkImport();
    };
  }, [refetch]);

  const handleDelete = async (emp: Employee) => {
    if (!userId) return;
    if (!window.confirm(`Are you sure you want to delete ${emp.name}?`)) return;
    try {
      await adminAPI.employees.delete(userId, emp.id);
      toast.success('Employee deleted');
      setDetailEmployee((prev) => (prev?.id === emp.id ? null : prev));
      setActionsOpenId(null);
      refetch();
    } catch {
      toast.error('Failed to delete employee');
    }
  };

  const handleExport = async () => {
    if (!userId) return;
    setExporting(true);
    try {
      const blob = await adminAPI.export.getBlob(userId, 'csv');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'employees.csv';
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Export downloaded');
    } catch {
      toast.error('Export failed');
    } finally {
      setExporting(false);
    }
  };

  const handleBulkDelete = async () => {
    if (!userId || selectedRows.length === 0) return;
    if (!window.confirm(`Delete ${selectedRows.length} employee(s)?`)) return;
    try {
      await Promise.all(
        selectedRows.map((emp) => adminAPI.employees.delete(userId, emp.id))
      );
      toast.success(`Deleted ${selectedRows.length} employee(s)`);
      setSelectedRows([]);
      setRowSelection({});
      setDetailEmployee(null);
      refetch();
    } catch {
      toast.error('Failed to delete employees');
    }
  };

  const handleModalSuccess = () => {
    setSelectedRows([]);
    setRowSelection({});
    refetch();
  };

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-4 p-4 border-b border-white/10">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-app-muted pointer-events-none z-10" />
          <Input
            type="search"
            placeholder="Search employees..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 input-theme"
            aria-label="Search employees"
          />
        </div>
        <select
          className="select-theme text-sm py-2 px-3 w-auto"
          aria-label="Department filter"
          value={departmentFilter}
          onChange={(e) => setDepartmentFilter(e.target.value)}
        >
          <option value="">All departments</option>
          {departments.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        <select
          className="select-theme text-sm py-2 px-3 w-auto"
          aria-label="Role filter"
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
        >
          <option value="">All roles</option>
          <option value="admin">Admin</option>
          <option value="manager">Manager</option>
          <option value="member">Member</option>
        </select>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => refetch()}
          className="gap-2"
          aria-label="Refresh list"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </Button>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setViewMode('table')}
            className={cn(
              'p-2 rounded-lg',
              viewMode === 'table' ? 'bg-app-surface-tertiary text-app' : 'text-app-muted hover:bg-app-hover'
            )}
            aria-label="Table view"
          >
            <List className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setViewMode('grid')}
            className={cn(
              'p-2 rounded-lg',
              viewMode === 'grid' ? 'bg-app-surface-tertiary text-app' : 'text-app-muted hover:bg-app-hover'
            )}
            aria-label="Grid view"
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/admin/employees/new">
            <Button variant="primary" className="gap-2">
              <UserPlus className="w-4 h-4" />
              Add Employee
            </Button>
          </Link>
          <Link to="/admin/import">
            <Button variant="secondary" className="gap-2">
              <Upload className="w-4 h-4" />
              Bulk Import
            </Button>
          </Link>
          <Button variant="secondary" className="gap-2" onClick={handleExport} disabled={exporting}>
            <Download className="w-4 h-4" />
            {exporting ? 'Exporting…' : 'Export'}
          </Button>
        </div>
      </div>

      <BulkActionToolbar
        selectedCount={selectedRows.length}
        onChangeDepartment={() => setShowChangeDept(true)}
        onChangeRole={() => setShowChangeRole(true)}
        onAdjustXP={() => setShowAdjustXP(true)}
        onAwardBadge={() => setShowAwardBadge(true)}
        onSendMessage={() => setShowSendMessage(true)}
        onExport={handleExport}
        onDelete={handleBulkDelete}
        onClearSelection={() => {
          setSelectedRows([]);
          setRowSelection({});
        }}
      />

      {employeesError && (
        <div className="mx-4 mt-2 p-4 rounded-lg bg-danger-500/10 border border-danger-500/30 text-danger-400 text-sm" role="alert">
          Failed to load employees: {employeesError.message}
        </div>
      )}

      <p className="mx-4 mt-1 text-xs text-app-muted">
        Status reflects who has the app open right now. You appear online while this tab is open.
      </p>

      <div className="flex-1 overflow-auto p-4">
        {isLoading ? (
          <LoadingState message="Loading employees..." />
        ) : viewMode === 'table' ? (
          <DataTable<Employee>
            data={filteredData}
            columns={columns}
            onRowSelect={setSelectedRows}
            rowSelection={rowSelection}
            onRowSelectionChange={(updaterOrValue) =>
              setRowSelection(typeof updaterOrValue === 'function' ? updaterOrValue : () => updaterOrValue)
            }
            pageSizeOptions={[10, 25, 50, 100]}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredData.length === 0 ? (
              <div className="py-12 text-center text-app-muted">
                No employees match your filters.
              </div>
            ) : (
              filteredData.map((emp) => (
              <div
                key={emp.id}
                className="glass-card p-4 rounded-xl border border-white/10 flex items-center gap-4"
              >
                <Avatar src={emp.avatar} name={emp.name} size="lg" status={emp.status} />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-app-text truncate">{emp.name}</p>
                  <p className="text-sm text-app-muted truncate">{emp.jobTitle}</p>
                  <p className="text-xs text-app-muted truncate">{emp.department}</p>
                </div>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => setDetailEmployee(emp)}
                    className="p-2 rounded hover:bg-app-hover"
                    aria-label="View profile"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                  <Link to={`/admin/employees/${emp.id}`}>
                    <button type="button" className="p-2 rounded hover:bg-app-hover" aria-label="Edit">
                      <Pencil className="w-4 h-4" />
                    </button>
                  </Link>
                </div>
              </div>
              ))
            )}
          </div>
        )}
      </div>

      {detailEmployee && (
        <EmployeeDetailPanel
          employee={detailEmployee}
          isOpen={!!detailEmployee}
          onClose={() => setDetailEmployee(null)}
          onUpdate={() => {
            refetch();
            setDetailEmployee(null);
          }}
        />
      )}

      {showChangeDept && (
        <ChangeDepartmentModal
          selectedEmployees={selectedRows}
          onClose={() => setShowChangeDept(false)}
          onSuccess={() => {
            handleModalSuccess();
            setShowChangeDept(false);
          }}
        />
      )}
      {showChangeRole && (
        <ChangeRoleModal
          selectedEmployees={selectedRows}
          onClose={() => setShowChangeRole(false)}
          onSuccess={() => {
            handleModalSuccess();
            setShowChangeRole(false);
          }}
        />
      )}
      {showAdjustXP && (
        <AdjustXPModal
          selectedEmployees={selectedRows}
          onClose={() => setShowAdjustXP(false)}
          onSuccess={() => {
            handleModalSuccess();
            setShowAdjustXP(false);
          }}
        />
      )}
      {showAwardBadge && (
        <AwardBadgeModal
          selectedEmployees={selectedRows}
          onClose={() => setShowAwardBadge(false)}
          onSuccess={() => {
            handleModalSuccess();
            setShowAwardBadge(false);
          }}
        />
      )}
      {showSendMessage && (
        <SendMessageModal
          selectedEmployees={selectedRows}
          onClose={() => setShowSendMessage(false)}
          onSuccess={() => {
            handleModalSuccess();
            setShowSendMessage(false);
          }}
        />
      )}

      {bankDetailsTarget && (
        <BankDetailsModal
          open={!!bankDetailsTarget}
          onClose={() => setBankDetailsTarget(null)}
          targetUserId={bankDetailsTarget.id}
          targetUserName={bankDetailsTarget.name}
        />
      )}

      {signatureTarget && (
        <SignaturePad
          open={!!signatureTarget}
          onClose={() => setSignatureTarget(null)}
          targetUserId={signatureTarget.id}
          targetUserName={signatureTarget.name}
        />
      )}
    </div>
  );
}
