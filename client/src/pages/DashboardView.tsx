import { useAuthStore } from '@/stores/authStore';
import { CommandCenter } from '@/components/command-center';

/**
 * Main home dashboard: high-density Intelligence Kanban (Mission Control).
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

  return <CommandCenter />;
}
