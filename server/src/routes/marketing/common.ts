import type { CallerContext, DateRange, SortOptions } from '../../dal/types.js';
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

export function parseOptionalNumber(value: unknown): number | undefined {
  if (value == null || value === '') return undefined;
  const parsed = typeof value === 'string' ? Number(value) : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function parseDateRange(from: unknown, to: unknown): DateRange | undefined {
  const range: DateRange = {};
  if (typeof from === 'string' && from) range.from = from;
  if (typeof to === 'string' && to) range.to = to;
  return range.from || range.to ? range : undefined;
}

export function parseSort(
  sortBy: unknown,
  sortDir: unknown,
  mapping: Record<string, string>,
): SortOptions | undefined {
  if (typeof sortBy !== 'string' || !sortBy) return undefined;
  const mapped = mapping[sortBy];
  if (!mapped) return undefined;
  return {
    field: mapped,
    direction: sortDir === 'asc' ? 'asc' : 'desc',
  };
}
