import { useMemo, useState, useCallback, useEffect } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Link } from 'react-router-dom';
import { Pencil, Trash2, CheckCircle, XCircle, AlertTriangle, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Modal, InfoTooltip } from '@/components/ui';
import { DataTable } from '@/admin/components/DataTable';
import { useAuthStore } from '@/stores/authStore';
import { useQuery } from '@/admin/hooks/useAdminQuery';
import { adminAPI } from '@/lib/api';
import { cn } from '@/lib/utils';
import { LoadingState } from '@/admin/components/LoadingState';
import { ApplicationDrawer } from '@/admin/components/projects/ApplicationDrawer';

function isAuthError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes('token') ||
    m.includes('expired') ||
    m.includes('authorization') ||
    m.includes('unauthorized') ||
    m.includes('required for admin') ||
    m.includes('user not found')
  );
}

const DEFAULT_DEPT_COLOR = { bg: 'rgba(128, 128, 128, 0.2)', text: '#888', border: '#888' };

const departmentColors: Record<string, { bg: string; text: string; border: string }> = {
  engineering: { bg: 'rgba(99, 179, 237, 0.15)', text: '#63B3ED', border: '#63B3ED' },
  product: { bg: 'rgba(246, 173, 85, 0.15)', text: '#F6AD55', border: '#F6AD55' },
  design: { bg: 'rgba(237, 100, 166, 0.15)', text: '#ED64A6', border: '#ED64A6' },
  marketing: { bg: 'rgba(72, 187, 120, 0.15)', text: '#48BB78', border: '#48BB78' },
  sales: { bg: 'rgba(159, 122, 234, 0.15)', text: '#9F7AEA', border: '#9F7AEA' },
  operations: { bg: 'rgba(237, 137, 54, 0.15)', text: '#ED8936', border: '#ED8936' },
};

function getDeptColor(dept: string): { bg: string; text: string; border: string } {
  return departmentColors[dept] ?? DEFAULT_DEPT_COLOR;
}

function getStatusColor(status: string): { bg: string; text: string } {
  switch (status) {
    case 'pending_approval':
      return { bg: 'bg-amber-500/20', text: 'text-amber-400' };
    case 'recruiting':
      return { bg: 'bg-green-500/20', text: 'text-green-400' };
    case 'active':
      return { bg: 'bg-blue-500/20', text: 'text-blue-400' };
    case 'review':
      return { bg: 'bg-accent-500/20', text: 'text-accent-400' };
    case 'completed':
    case 'closed':
      return { bg: 'bg-gray-500/20', text: 'text-app-muted' };
    case 'rejected':
      return { bg: 'bg-red-500/20', text: 'text-red-400' };
    default:
      return { bg: 'bg-app-surface-tertiary', text: 'text-app-muted' };
  }
}

/** Map DB recruitment_status to user-facing display label. */
function getStatusDisplayLabel(status: string): string {
  switch (status) {
    case 'recruiting':
    case 'draft':
      return 'First Phase';
    case 'active':
      return 'In Progress';
    case 'review':
      return 'Review';
    case 'completed':
    case 'closed':
      return 'Done';
    case 'pending_approval':
      return 'Pending approval';
    default:
      return status ? status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : status;
  }
}

/** Tooltip content for the 4 main project stages (shown with Info icon next to status). */
const STATUS_TOOLTIPS: Record<string, string> = {
  'First Phase':
    'Kickoff & Discovery. The team is assembled and holds initial meetings to gather requirements and align on goals before execution begins.',
  'In Progress':
    'Execution mode. The team has been assembled and is actively working on project tasks.',
  Review:
    'Quality Control. Deliverables have been submitted and are awaiting final validation by the Admin.',
  Done:
    'Mission accomplished. The project is closed and all P/MSP rewards have been distributed to the team.',
};

export interface ProjectMarketplaceRow {
  id: string;
  name: string;
  recruitment_status: string;
  recruitment_config: { dept: string; count: number; filled: number }[];
  xp_reward: number;
  is_featured: boolean;
  application_count: number;
}

function mapApiProjectToRow(p: Record<string, unknown>): ProjectMarketplaceRow {
  const config = Array.isArray(p.recruitment_config) ? p.recruitment_config : [];
  return {
    id: String(p.id ?? ''),
    name: String(p.name ?? ''),
    recruitment_status: String(p.recruitment_status ?? 'closed'),
    recruitment_config: config.map((c: Record<string, unknown>) => ({
      dept: String(c.dept ?? ''),
      count: Number(c.count ?? 0),
      filled: Number(c.filled ?? 0),
    })),
    xp_reward: Number(p.xp_reward ?? 0),
    is_featured: Boolean(p.is_featured),
    application_count: Number(p.application_count ?? 0),
  };
}

function OpenSlotsCell({ config }: { config?: { dept: string; count: number; filled: number }[] | null }) {
  const safeConfig = Array.isArray(config) ? config : [];
  if (!safeConfig.length) return <span className="text-app-muted">—</span>;
  return (
    <div className="flex flex-wrap gap-2">
      {safeConfig.map((slot, idx) => {
        const count = Number(slot?.count ?? 0);
        const filled = Number(slot?.filled ?? 0);
        const dept = String(slot?.dept ?? '');
        const colors = getDeptColor(dept);
        return (
          <div key={idx} className="flex items-center gap-1.5">
            <span className="text-xs text-app-muted capitalize">{dept || '—'}:</span>
            <div className="flex gap-0.5">
              {Array.from({ length: Math.max(0, count) }).map((_, i) => {
                const isFilled = i < filled;
                return (
                  <span
                    key={i}
                    className={cn(
                      'inline-flex w-6 h-6 rounded-full border-2 items-center justify-center text-xs',
                      isFilled ? 'border-solid' : 'border-dashed border-app-border bg-app-surface-tertiary'
                    )}
                    style={
                      isFilled ? { backgroundColor: colors.bg, borderColor: colors.border } : undefined
                    }
                    title={`${dept}: ${filled}/${count}`}
                  >
                    {!isFilled && '+'}
                  </span>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

type StatusFilter = 'all' | 'pending_approval' | 'recruiting' | 'active' | 'completed';

export function ProjectMarketplaceAdmin() {
  const { user } = useAuthStore();
  const userId = user?.id ?? '';
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [drawerProject, setDrawerProject] = useState<{ id: string; name: string } | null>(null);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);

  const { data: apiData, isLoading, error, refetch } = useQuery(
    ['admin-projects', userId],
    () => adminAPI.projects.getAll(userId) as Promise<unknown[]>,
    { enabled: !!userId }
  );

  const { data: pendingData, refetch: refetchPending } = useQuery(
    ['admin-projects-pending', userId],
    () => adminAPI.projects.getPending(userId) as Promise<unknown[]>,
    { enabled: !!userId }
  );

  const { data: editingProject, isLoading: loadingEdit } = useQuery(
    ['admin-project-edit', userId, editingProjectId],
    () => adminAPI.projects.getById(userId, editingProjectId!) as Promise<Record<string, unknown>>,
    { enabled: !!userId && !!editingProjectId }
  );

  const projects = useMemo(() => {
    if (!Array.isArray(apiData)) return [];
    try {
      return apiData.map((p) => mapApiProjectToRow(p as Record<string, unknown>));
    } catch {
      return [];
    }
  }, [apiData]);

  const pendingProjects = useMemo(() => {
    if (!Array.isArray(pendingData)) return [];
    try {
      return pendingData.map((p) => mapApiProjectToRow(p as Record<string, unknown>));
    } catch {
      return [];
    }
  }, [pendingData]);

  const filteredProjects = useMemo(() => {
    if (statusFilter === 'all') return projects;
    if (statusFilter === 'pending_approval') return projects.filter((p) => p.recruitment_status === 'pending_approval');
    if (statusFilter === 'recruiting') return projects.filter((p) => p.recruitment_status === 'recruiting');
    if (statusFilter === 'active') return projects.filter((p) => p.recruitment_status === 'active');
    if (statusFilter === 'completed') return projects.filter((p) => p.recruitment_status === 'closed' || p.recruitment_status === 'completed');
    return projects;
  }, [projects, statusFilter]);

  const handleApprove = useCallback(
    async (projectId: string) => {
      try {
        await adminAPI.projects.approve(userId, projectId);
        toast.success('Project approved');
        refetch();
        refetchPending();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to approve');
      }
    },
    [userId, refetch, refetchPending]
  );

  const handleReject = useCallback(
    async (projectId: string) => {
      const reason = window.prompt('Rejection reason (required):');
      if (reason == null || reason.trim() === '') return;
      try {
        await adminAPI.projects.reject(userId, projectId, reason.trim());
        toast.success('Project rejected');
        refetch();
        refetchPending();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to reject');
      }
    },
    [userId, refetch, refetchPending]
  );

  const handleComplete = useCallback(
    async (projectId: string) => {
      if (!window.confirm('Mark this project as complete and award MP to team members?')) return;
      try {
        const result = await adminAPI.projects.complete(userId, projectId);
        toast.success(result?.message ?? 'Project completed');
        refetch();
        refetchPending();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to complete');
      }
    },
    [userId, refetch, refetchPending]
  );

  const handleDelete = useCallback(
    async (projectId: string, projectName: string) => {
      if (!window.confirm(`Delete project "${projectName}"? This cannot be undone.`)) return;
      try {
        await adminAPI.projects.delete(userId, projectId);
        toast.success('Project deleted');
        refetch();
        refetchPending();
        setEditingProjectId(null);
        setDrawerProject((prev) => (prev?.id === projectId ? null : prev));
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to delete project');
      }
    },
    [userId, refetch, refetchPending]
  );

  const safeProjects = filteredProjects;

  const columns = useMemo<ColumnDef<ProjectMarketplaceRow, unknown>[]>(
    () => [
      {
        id: 'name',
        header: 'Title',
        accessorKey: 'name',
        cell: (info) => (
          <span className="font-medium text-app">{String(info.getValue() ?? '')}</span>
        ),
        enableSorting: true,
      },
      {
        id: 'recruitment_status',
        header: 'Status',
        accessorKey: 'recruitment_status',
        cell: (info) => {
          const status = (info.getValue() as string) || 'closed';
          const displayLabel = getStatusDisplayLabel(status);
          const tooltipContent = STATUS_TOOLTIPS[displayLabel];
          const { bg, text } = getStatusColor(status);
          return (
            <span className="inline-flex items-center gap-1">
              <span
                className={cn(
                  'inline-flex px-2 py-0.5 rounded text-xs font-medium',
                  bg,
                  text
                )}
              >
                {displayLabel}
              </span>
              {tooltipContent != null && (
                <InfoTooltip content={tooltipContent} aria-label={`Definition: ${displayLabel}`} />
              )}
            </span>
          );
        },
        enableSorting: true,
      },
      {
        id: 'open_slots',
        header: 'Open Slots',
        accessorFn: (row) => row.recruitment_config,
        cell: ({ row }) => (
          <OpenSlotsCell config={row.original?.recruitment_config ?? []} />
        ),
        enableSorting: false,
      },
      {
        id: 'application_count',
        header: 'Applications',
        accessorKey: 'application_count',
        cell: (info) => {
          const row = info.row.original as ProjectMarketplaceRow;
          const val = info.getValue();
          const num = typeof val === 'number' ? val : Number(val) || 0;
          if (num > 0) {
            return (
              <Button
                variant="ghost"
                size="sm"
                className="text-amber-400 hover:text-amber-300 hover:bg-amber-500/10"
                onClick={() => setDrawerProject({ id: row.id, name: row.name })}
              >
                {num} pending
              </Button>
            );
          }
          return <span className="text-app-muted">—</span>;
        },
        enableSorting: true,
      },
      {
        id: 'xp_reward',
        header: 'MP',
        accessorKey: 'xp_reward',
        cell: (info) => (
          <span className="inline-flex items-center gap-1 text-amber-400 text-sm">
            <Zap className="w-3.5 h-3.5" />
            {Number(info.getValue() ?? 0)}
          </span>
        ),
        enableSorting: true,
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => {
          const r = row.original as ProjectMarketplaceRow;
          const isPending = r.recruitment_status === 'pending_approval';
          const canComplete = (r.recruitment_status === 'recruiting' || r.recruitment_status === 'active') && r.recruitment_config.some((s) => s.filled < s.count) === false;
          return (
            <div className="flex items-center gap-1">
              {isPending && (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-green-400 hover:text-green-300 hover:bg-green-500/10"
                    aria-label="Approve project"
                    onClick={() => handleApprove(r.id)}
                  >
                    <CheckCircle className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                    aria-label="Reject project"
                    onClick={() => handleReject(r.id)}
                  >
                    <XCircle className="w-4 h-4" />
                  </Button>
                </>
              )}
              {canComplete && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 text-green-400 hover:text-green-300 hover:bg-green-500/10"
                  aria-label="Complete project and award MP"
                  onClick={() => handleComplete(r.id)}
                >
                  <CheckCircle className="w-4 h-4" aria-label="Complete & award MP" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                aria-label="Edit project"
                onClick={() => setEditingProjectId(r.id)}
              >
                <Pencil className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 text-red-400 hover:text-red-300"
                aria-label="Delete project"
                onClick={() => handleDelete(r.id, r.name)}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          );
        },
        enableSorting: false,
      },
    ],
    [handleApprove, handleReject, handleComplete, handleDelete]
  );

  if (!!userId && isLoading && !apiData) {
    return <LoadingState message="Loading projects…" />;
  }

  if (!!userId && error && !apiData) {
    const authRelated = isAuthError(error.message);
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold text-app mb-4">Project Marketplace</h1>
        {authRelated ? (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 max-w-md">
            <p className="text-amber-400 font-medium mb-2">Your session may have expired.</p>
            <p className="text-app-muted text-sm mb-4">Please sign in again to continue.</p>
            <Link to="/login">
              <Button variant="primary" size="sm">
                Sign in
              </Button>
            </Link>
          </div>
        ) : (
          <p className="text-app-muted">Could not load projects from the database. Please try again later.</p>
        )}
      </div>
    );
  }

  return (
    <div className="p-6 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-app">Project Marketplace</h1>
      </div>

      {pendingProjects.length > 0 && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
            <div>
              <p className="font-medium text-amber-400">
                {pendingProjects.length} project{pendingProjects.length !== 1 ? 's' : ''} awaiting approval
              </p>
              <p className="text-sm text-amber-400/80">Review and approve to publish to marketplace.</p>
            </div>
          </div>
          <Button
            variant="primary"
            size="sm"
            className="bg-amber-500 hover:bg-amber-600 text-app"
            onClick={() => setStatusFilter('pending_approval')}
          >
            Review now
          </Button>
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm text-app-muted mr-1">Filter:</span>
        {(['all', 'pending_approval', 'recruiting', 'active', 'completed'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setStatusFilter(tab)}
            className={cn(
              'px-3 py-1.5 rounded-lg text-sm font-medium capitalize transition-colors',
              statusFilter === tab
                ? 'bg-app-surface-tertiary text-app'
                : 'text-app-muted hover:text-app'
            )}
          >
            {tab === 'pending_approval' ? 'Pending approval' : tab}
          </button>
        ))}
      </div>

      {safeProjects.length === 0 ? (
        <p className="text-app-muted">No projects found.</p>
      ) : (
        <DataTable data={safeProjects} columns={columns} />
      )}

      {drawerProject && (
        <ApplicationDrawer
          projectId={drawerProject.id}
          projectName={drawerProject.name}
          onClose={() => setDrawerProject(null)}
          onUpdated={refetch}
        />
      )}

      {editingProjectId && (
        <EditProjectModal
          projectId={editingProjectId}
          project={editingProject as Record<string, unknown> | undefined}
          isLoading={loadingEdit}
          onClose={() => setEditingProjectId(null)}
          onSave={async (data) => {
            await adminAPI.projects.update(userId, editingProjectId, data);
            toast.success('Project updated');
            refetch();
            refetchPending();
            setEditingProjectId(null);
          }}
        />
      )}
    </div>
  );
}

function EditProjectModal({
  projectId: _projectId,
  project,
  isLoading,
  onClose,
  onSave,
}: {
  projectId: string;
  project: Record<string, unknown> | undefined;
  isLoading: boolean;
  onClose: () => void;
  onSave: (data: { name: string; description: string; recruitment_status: string; xp_reward: number; is_featured: boolean; due_date: string }) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [recruitment_status, setRecruitmentStatus] = useState('recruiting');
  const [xp_reward, setXpReward] = useState(0);
  const [is_featured, setIsFeatured] = useState(false);
  const [due_date, setDueDate] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!project) return;
    setName(String(project.name ?? ''));
    setDescription(String(project.description ?? ''));
    setRecruitmentStatus(String(project.recruitment_status ?? 'recruiting'));
    setXpReward(Number(project.xp_reward ?? 0));
    setIsFeatured(Boolean(project.is_featured));
    setDueDate(project.due_date ? String(project.due_date).slice(0, 10) : '');
  }, [project]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave({ name, description, recruitment_status, xp_reward, is_featured, due_date });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title="Edit project" size="md">
      {isLoading ? (
        <div className="py-8 text-center text-app-muted">Loading…</div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-app mb-1">Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input-theme w-full"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-app mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="input-theme w-full min-h-[80px]"
              rows={3}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-app mb-1">Status</label>
            <select
              value={recruitment_status}
              onChange={(e) => setRecruitmentStatus(e.target.value)}
              className="input-theme w-full"
            >
              <option value="pending_approval">Pending approval</option>
              <option value="recruiting">First Phase</option>
              <option value="active">In Progress</option>
              <option value="review">Review</option>
              <option value="closed">Done</option>
              <option value="completed">Done</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-app mb-1">MP reward</label>
            <input
              type="number"
              min={0}
              value={xp_reward}
              onChange={(e) => setXpReward(Number(e.target.value) || 0)}
              className="input-theme w-full"
            />
          </div>
          <div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={is_featured}
                onChange={(e) => setIsFeatured(e.target.checked)}
                className="rounded border-app-border"
              />
              <span className="text-sm text-app">Featured</span>
            </label>
          </div>
          <div>
            <label className="block text-sm font-medium text-app mb-1">Due date</label>
            <input
              type="date"
              value={due_date}
              onChange={(e) => setDueDate(e.target.value)}
              className="input-theme w-full"
            />
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
