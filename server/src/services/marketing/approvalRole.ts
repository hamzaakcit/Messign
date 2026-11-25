/** Roles that may approve content (same as the approval queue's `POST /approvals/:id/review`). */
export const APPROVER_ROLES = ['manager', 'admin'] as const;

/**
 * Human-in-the-loop: moving content to `approved` is an approval, so only an approver may do it — whether through
 * the approval queue or a direct status change. Returns the refusal message, or null when allowed.
 */
export function approvalRoleBlock(
  nextStatus: string | null | undefined,
  currentStatus: string | null | undefined,
  role: string | null | undefined,
): string | null {
  if (nextStatus !== 'approved' || currentStatus === 'approved') return null;
  if (role && (APPROVER_ROLES as readonly string[]).includes(role)) return null;
  return 'Only a manager or admin can approve content.';
}
