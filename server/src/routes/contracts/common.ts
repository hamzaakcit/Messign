import type { CallerContext, SortOptions } from '../../dal/types.js';
import type { ReimbursementRequest } from '../../middleware/reimbursementAuth.js';

export function buildCtx(req: ReimbursementRequest): CallerContext {
  const user = req.reimbursementUser!;
  return {
    userId: user.id,
    role: user.role as CallerContext['role'],
    organizationId: req.organizationId,
  };
}

export function parsePositiveInt(value: unknown, fallback: number): number {
  const parsed = typeof value === 'string' ? parseInt(value, 10) : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function parseSort(
  sortBy: unknown,
  sortDir: unknown,
  mapping: Record<string, string>,
): SortOptions | undefined {
  if (typeof sortBy !== 'string' || !sortBy) return undefined;
  return {
    field: mapping[sortBy] ?? sortBy,
    direction: sortDir === 'asc' ? 'asc' : 'desc',
  };
}
