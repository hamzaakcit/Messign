import { useAuthStore } from '@/stores/authStore';
import { MainDashboard } from '@/components/dashboard';

/**
 * Main home dashboard: single-fold Company OS (bento + workspace strip).
 */
export function DashboardView(): JSX.Element {
  const { user } = useAuthStore();

  if (!user) {
    return (
      <div className="flex flex-1 min-h-[50vh] items-center justify-center p-6 bg-app" role="status" aria-live="polite">
        <p className="text-app-muted text-sm text-center max-w-sm">Loading workspace…</p>
      </div>
    );
  }

  return <MainDashboard />;
}
