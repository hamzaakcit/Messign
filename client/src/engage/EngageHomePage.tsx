import { useAuthStore } from '@/stores/authStore';

/**
 * Home of the engage surface. The Company-OS marketing hub (Lucy, campaigns, approvals) is not tenant-safe and its API
 * stays closed to engage tenants, and the Dora/Lucy assistant is frozen for them (ADR-009). This page calls no API;
 * the engage screens (profiles, journeys, settings) replace it as they ship (WP-19 onward).
 */
export function EngageHomePage(): JSX.Element {
  const user = useAuthStore((s) => s.user);
  const firstName = user?.name?.trim().split(/\s+/)[0];

  return (
    <div className="flex-1 overflow-y-auto bg-app px-4 py-10 sm:px-8" data-testid="engage-home">
      <div className="mx-auto max-w-2xl">
        <p className="text-xs font-semibold uppercase tracking-wider text-app-muted">Messign Engage</p>
        <h1 className="mt-2 text-2xl font-bold text-app">{firstName ? `Welcome, ${firstName}` : 'Welcome'}</h1>
        <p className="mt-3 text-sm leading-relaxed text-app-muted">
          Your workspace is set up. Customer profiles, journeys and message reports will appear here as they become
          available.
        </p>
      </div>
    </div>
  );
}
