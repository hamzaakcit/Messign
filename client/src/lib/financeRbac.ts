import type { User } from '@/types';

/** Resolves the user id for `X-User-Id` on finance API calls (prefers `authUserId`). */
export function getFinanceUserId(user: Pick<User, 'id' | 'authUserId'> | null | undefined): string {
  return user?.authUserId || user?.id || '';
}

/** True when the user matches server-side finance/admin roles for elevated finance UI. */
export function hasFinanceElevatedAccess(user: Pick<User, 'role'> | null | undefined, isAdmin: boolean): boolean {
  if (isAdmin) return true;
  const r = user?.role ?? '';
  return r === 'finance' || r === 'finance_admin' || r === 'system_admin';
}
