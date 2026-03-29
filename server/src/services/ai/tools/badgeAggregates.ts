/**
 * Aggregates for user_badges query (badges earned widget).
 */

export interface BadgeAggregates {
  count: number;
  /** ISO month key YYYY-MM -> count earned in that month */
  byMonth: Record<string, number>;
}

/**
 * Groups earned badges by calendar month for charts.
 */
export function computeBadgeAggregates(badges: Record<string, unknown>[]): BadgeAggregates {
  const byMonth: Record<string, number> = {};
  for (const b of badges) {
    const raw = b.earned_at;
    if (raw == null) continue;
    const d = new Date(raw as string);
    if (Number.isNaN(d.getTime())) continue;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    byMonth[key] = (byMonth[key] ?? 0) + 1;
  }
  return { count: badges.length, byMonth };
}
