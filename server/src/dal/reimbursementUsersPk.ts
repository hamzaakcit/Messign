import type { CallerContext } from './types.js';

/**
 * `reimbursement_users.id` for FK columns. Prefer `userUuid` (JWT sub → DB row);
 * fall back to `userId` when it is already a UUID (e.g. tests).
 */
export function reimbursementUsersPk(ctx: CallerContext): string {
  return ctx.userUuid ?? ctx.userId;
}
