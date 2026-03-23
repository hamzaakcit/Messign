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
  fallbackField: string,
): SortOptions {
  const field = typeof sortBy === 'string' && sortBy ? (mapping[sortBy] ?? fallbackField) : fallbackField;
  return {
    field,
    direction: sortDir === 'asc' ? 'asc' : 'desc',
  };
}
