/**
 * Aggregates for achievements:get_bounty_board (widget charts).
 */

export interface BountyAggregates {
  byStatus: Record<string, number>;
  byUrgency: Record<string, number>;
  totalXp: number;
  avgXp: number;
  count: number;
}

function n(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === 'number' && !Number.isNaN(v)) return v;
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

/**
 * Builds status / urgency counts and XP totals from bounty rows.
 */
export function computeBountyAggregates(bounties: Record<string, unknown>[]): BountyAggregates {
  const byStatus: Record<string, number> = {};
  const byUrgency: Record<string, number> = {};
  let totalXp = 0;
  for (const b of bounties) {
    const st = String(b.status ?? 'UNKNOWN').trim() || 'UNKNOWN';
    byStatus[st] = (byStatus[st] ?? 0) + 1;
    const urg = String(b.urgency ?? 'NORMAL').trim() || 'NORMAL';
    byUrgency[urg] = (byUrgency[urg] ?? 0) + 1;
    totalXp += n(b.xp_reward);
  }
  const count = bounties.length;
  const avgXp = count > 0 ? Math.round((totalXp / count) * 10) / 10 : 0;
  return { byStatus, byUrgency, totalXp, avgXp, count };
}
