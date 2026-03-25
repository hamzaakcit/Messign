import type { CallerContext } from './types.js';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * True when `s` is a canonical UUID string (avoids PostgreSQL `invalid input syntax for type uuid`
 * when JWT `sub` is a legacy slug and `userUuid` was not resolved).
 */
export function isUuidString(s: string | undefined | null): boolean {
  return typeof s === 'string' && UUID_RE.test(s);
}

/**
 * `reimbursement_users.id` for FK columns. Prefer `userUuid` (JWT sub → DB row);
 * fall back to `userId` when it is already a UUID (e.g. tests).
 */
export function reimbursementUsersPk(ctx: CallerContext): string {
  return ctx.userUuid ?? ctx.userId;
}
