import { useState } from 'react';
import { X, CheckCircle, XCircle, User, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStore } from '@/stores/authStore';
import { useQuery } from '@/admin/hooks/useAdminQuery';
import { adminAPI, type ProjectApplicationWithUser } from '@/lib/api';
import { Button } from '@/components/ui';
import { cn } from '@/lib/utils';

interface ApplicationDrawerProps {
  projectId: string;
  projectName: string;
  onClose: () => void;
  onUpdated?: () => void;
}

export function ApplicationDrawer({ projectId, projectName, onClose, onUpdated }: ApplicationDrawerProps) {
  const { user } = useAuthStore();
  const userId = user?.id ?? '';
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);

  const { data, isLoading, refetch } = useQuery(
    ['admin-project-applications', projectId, userId],
    () => adminAPI.projects.getApplications(userId, projectId),
    { enabled: !!userId && !!projectId }
  );

  const applications: ProjectApplicationWithUser[] = data?.applications ?? [];
  const pendingApps = applications.filter((a) => a.status === 'pending');

  const handleAccept = async (appId: string) => {
    setAcceptingId(appId);
    try {
      await adminAPI.projects.acceptApplication(userId, projectId, appId);
      toast.success('Application accepted');
      refetch();
      onUpdated?.();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to accept');
    } finally {
      setAcceptingId(null);
    }
  };

  const handleReject = async (appId: string) => {
    const note = window.prompt('Rejection note (optional):');
    setRejectingId(appId);
    try {
      await adminAPI.projects.rejectApplication(userId, projectId, appId, note ?? undefined);
      toast.success('Application rejected');
      refetch();
      onUpdated?.();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to reject');
    } finally {
      setRejectingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden />
      <div
        className="relative w-full max-w-md bg-app-sidebar border-l border-app-border flex flex-col shadow-xl animate-in slide-in-from-right duration-200"
        role="dialog"
        aria-label="Applications"
      >
        <div className="p-4 border-b border-app-border flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-app">Applications</h2>
            <p className="text-sm text-app-muted truncate">{projectName}</p>
          </div>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={onClose} aria-label="Close">
            <X className="w-5 h-5" />
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {isLoading ? (
            <p className="text-app-muted text-sm">Loading…</p>
          ) : pendingApps.length === 0 ? (
            <p className="text-app-muted text-sm">No pending applications.</p>
          ) : (
            pendingApps.map((app) => (
              <div
                key={app.id}
                className="rounded-xl border border-app-border bg-app-card p-4 space-y-3"
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-app-surface-tertiary flex items-center justify-center shrink-0">
                    <User className="w-5 h-5 text-app-muted" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-app truncate">{app.user_name ?? app.user_id}</p>
                    {app.user_email && (
                      <p className="text-xs text-app-muted truncate">{app.user_email}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 text-amber-400 text-xs shrink-0">
                    <Zap className="w-3.5 h-3.5" />
                    {app.user_xp} MP · Lvl {app.user_level}
                  </div>
                </div>
                {app.message && (
                  <p className="text-sm text-app-muted bg-app-surface-tertiary rounded-lg p-2">
                    {app.message}
                  </p>
                )}
                <div className="flex items-center gap-2">
                  <Button
                    variant="primary"
                    size="sm"
                    className="flex-1 gap-1.5"
                    disabled={acceptingId !== null}
                    onClick={() => handleAccept(app.id)}
                  >
                    <CheckCircle className="w-4 h-4" /> {acceptingId === app.id ? 'Accepting…' : 'Accept'}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className={cn('flex-1 gap-1.5 text-red-400 hover:text-red-300 hover:bg-red-500/10')}
                    disabled={rejectingId !== null}
                    onClick={() => handleReject(app.id)}
                  >
                    <XCircle className="w-4 h-4" /> {rejectingId === app.id ? 'Rejecting…' : 'Reject'}
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
