import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClipboardList, Target, Zap } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';
import { projectsAPI, type UserApplication } from '@/lib/api';
import { useMarketplaceProjectsQuery } from '@/hooks/useMarketplaceProjectsQuery';
import { cn } from '@/lib/utils';

function useProjectsNav() {
  const navigate = useNavigate();
  const setView = useUIStore((s) => s.setView);
  return () => {
    setView('projects');
    navigate('/projects');
  };
}

function StatusBadge({ status }: { status: string }) {
  const isPending = status === 'pending';
  const isApproved = status === 'approved';
  const isRejected = status === 'rejected';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium',
        isApproved && 'bg-green-500/20 text-green-400',
        isRejected && 'bg-red-500/20 text-red-400',
        isPending && 'bg-amber-500/20 text-amber-400'
      )}
    >
      <span
        className={cn(
          'w-1.5 h-1.5 rounded-full',
          isApproved && 'bg-green-400',
          isRejected && 'bg-red-400',
          isPending && 'bg-amber-400'
        )}
      />
      {status === 'approved' ? 'Approved' : status === 'rejected' ? 'Rejected' : 'Pending'}
    </span>
  );
}

export function ProjectsRightSidebar() {
  const { user } = useAuthStore();
  const goToMarketplace = useProjectsNav();
  const [applications, setApplications] = useState<UserApplication[]>([]);
  const [loadingApps, setLoadingApps] = useState(true);

  const { data: marketplaceProjects, isLoading: loadingRec } = useMarketplaceProjectsQuery(user?.id);

  useEffect(() => {
    if (!user?.id) return;
    setLoadingApps(true);
    projectsAPI
      .getMyApplications()
      .then((data) => setApplications(Array.isArray(data) ? data : []))
      .catch(() => setApplications([]))
      .finally(() => setLoadingApps(false));
  }, [user?.id]);

  const userDept = (user?.department ?? user?.jobTitle ?? '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
  const deptKey = userDept.includes('engineer') ? 'engineering' : userDept.includes('design') ? 'design' : userDept.includes('product') ? 'product' : userDept.includes('market') ? 'marketing' : userDept.includes('sale') ? 'sales' : userDept.includes('operation') ? 'operations' : null;

  const recommended = deptKey
    ? marketplaceProjects.filter(
        (p) =>
          p.recruitment_status === 'recruiting' &&
          (p.type === deptKey || (Array.isArray(p.recruitment_config) && p.recruitment_config.some((s) => s.dept === deptKey && s.filled < s.count)))
      ).slice(0, 5)
    : marketplaceProjects.filter((p) => p.recruitment_status === 'recruiting').slice(0, 5);

  return (
    <div className="h-full bg-app-sidebar border-l border-app-border flex flex-col overflow-hidden transition-colors duration-200" role="complementary" aria-label="Project marketplace sidebar">
      {/* My Applications */}
      <div className="p-4 border-b border-app-border flex-shrink-0">
        <h3 className="font-semibold text-app flex items-center gap-2 mb-3">
          <ClipboardList className="w-4 h-4 text-primary-400" /> My Applications
        </h3>
        {loadingApps ? (
          <p className="text-sm text-app-muted">Loading…</p>
        ) : applications.length === 0 ? (
          <p className="text-sm text-app-muted">No applications yet. Apply to recruiting projects from the marketplace.</p>
        ) : (
          <ul className="space-y-2">
            {applications.map((app) => (
              <li key={app.id} className="p-3 rounded-lg bg-app-surface-tertiary border border-app-border">
                <p className="font-medium text-app text-sm truncate">{app.project_name}</p>
                <p className="text-xs text-app-muted mt-0.5">
                  Applied {app.created_at ? new Date(app.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                </p>
                <div className="mt-2">
                  <StatusBadge status={app.status} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Recommended for You */}
      <div className="p-4 border-b border-app-border flex-1 overflow-hidden flex flex-col min-h-0">
        <h3 className="font-semibold text-app flex items-center gap-2 mb-2">
          <Target className="w-4 h-4 text-accent-400" /> Recommended for You
        </h3>
        {deptKey && (
          <p className="text-xs text-app-muted mb-3">Based on your department: {deptKey}</p>
        )}
        {loadingRec ? (
          <p className="text-sm text-app-muted">Loading…</p>
        ) : recommended.length === 0 ? (
          <p className="text-sm text-app-muted">No recruiting projects match right now. Check the marketplace for all open projects.</p>
        ) : (
          <ul className="space-y-2 overflow-y-auto">
            {recommended.map((p) => (
              <li key={p.id} className="p-3 rounded-lg bg-app-surface-tertiary border border-app-border">
                <p className="font-medium text-app text-sm truncate">{p.name}</p>
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  {p.xp_reward > 0 && (
                    <span className="inline-flex items-center gap-0.5 text-xs text-amber-400">
                      <Zap className="w-3 h-3" /> +{p.xp_reward} MP
                    </span>
                  )}
                  <span className="text-xs text-app-muted capitalize">{p.type}</span>
                </div>
                <button
                  type="button"
                  onClick={goToMarketplace}
                  className="mt-2 text-xs font-medium text-primary-400 hover:text-primary-300"
                >
                  View in Marketplace →
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
