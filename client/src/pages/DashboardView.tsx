import { useAuthStore } from '@/stores/authStore';
import { CommandCenter } from '@/components/command-center';

/**
 * Main home dashboard: high-density Intelligence Kanban (Mission Control).
 */
export function DashboardView(): JSX.Element | null {
  const { user } = useAuthStore();

  if (!user) return null;

  return <CommandCenter />;
}
