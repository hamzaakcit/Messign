import { useEffect, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getProductSurface, setSessionSurface } from '@/lib/productSurface';
import { useAuthStore } from '@/stores/authStore';
import { engageMeQuery } from './engageMe';

/**
 * Decides the surface of a signed-in session before anything of the app is drawn (ADR-017). On a shared (`all`) build
 * the engage API says whether the user's organization is an engage tenant; if it is, the session is narrowed to the
 * engage surface (engage pages only, no Company-OS pages, no Company-OS requests). The app waits for that answer, so a
 * tenant never sees a Company-OS page for a moment. On an `engage` or `workspace` build there is nothing to decide.
 * When the user signs out, the narrowing is undone.
 */
export function SurfaceGate({ children }: { children: ReactNode }): JSX.Element {
  const userId = useAuthStore((s) => s.user?.id);
  const shared = getProductSurface() === 'all';
  const me = useQuery({ ...engageMeQuery(userId), enabled: shared });

  useEffect(() => () => setSessionSurface(null), []);

  if (shared && me.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-app">
        <div className="text-app-muted">Loading…</div>
      </div>
    );
  }
  return <>{children}</>;
}
