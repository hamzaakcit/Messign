import type { ReactNode } from 'react';
import { PageSkeleton } from '@/components/ui';
import { mountsFrozenModules } from '@/lib/productSurface';
import { useEngageAccess } from './engageWorkspace';

/**
 * Which page `/marketing` is (ADR-015, ADR-016). One page everywhere, and the signed-in organization decides what is on it:
 *  - engage surface, or a tenant on a shared deployment: the engage page. A tenant never gets the Company-OS Lucy chat
 *    or tools (frozen for tenants, ADR-009, and their API is not tenant-safe).
 *  - the platform organization with engage enabled: the Company-OS Lucy page, which then holds the engage sections too.
 *  - anyone else: the Company-OS Lucy page exactly as it was.
 * On a shared deployment nothing is shown until the engage API has answered, so a tenant never sees the Lucy page flash by.
 */
export function MarketingEntry({ lucy, hub }: { lucy: ReactNode; hub: ReactNode }): JSX.Element {
  const access = useEngageAccess();
  if (!mountsFrozenModules()) return <>{hub}</>;
  if (access.loading) return <PageSkeleton variant="dashboard" />;
  return <>{access.available && access.product === 'engage' ? hub : lucy}</>;
}
