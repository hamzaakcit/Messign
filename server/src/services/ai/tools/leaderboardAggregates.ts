/**
 * Aggregates for `achievements:get_achievements_leaderboard` (XP leaderboard rows).
 */

export interface LeaderboardXpRow {
  user_id?: string;
  points?: number;
  full_name?: string;
  email?: string;
  rank?: number;
}

export interface LeaderboardXpAggregates {
  count: number;
  topPoints: number;
  avgPoints: number;
}

/**
 * Computes count, top XP, and average XP from leaderboard rows.
 */
export function computeLeaderboardXpAggregates(rows: ReadonlyArray<{ points?: number }>): LeaderboardXpAggregates {
  const count = rows.length;
  if (count === 0) {
    return { count: 0, topPoints: 0, avgPoints: 0 };
  }
  const pts = rows.map((r) => Number(r.points ?? 0));
  const topPoints = Math.max(...pts);
  const sum = pts.reduce((a, b) => a + b, 0);
  const avgPoints = Math.round((sum / count) * 10) / 10;
  return { count, topPoints, avgPoints };
}

/**
 * Short summary for chat (no markdown). XP is all-time per org member — not a fiscal quarter window.
 */
export function buildShortLeaderboardSummary(
  aggregates: LeaderboardXpAggregates,
  topName?: string,
): string {
  if (aggregates.count === 0) {
    return 'No XP leaderboard data for your organization yet.';
  }
  const leader =
    topName && aggregates.topPoints > 0
      ? ` ${topName} leads with ${aggregates.topPoints} XP.`
      : aggregates.topPoints > 0
        ? ` Top score ${aggregates.topPoints} XP.`
        : '';
  return `Top ${aggregates.count} by XP (all-time).${leader}`;
}

/**
 * True when a row looks like an XP leaderboard entry (not e.g. an `all_badges` catalog row).
 */
export function rowLooksLikeXpLeaderboard(row: unknown): boolean {
  if (!row || typeof row !== 'object') return false;
  const r = row as Record<string, unknown>;
  const hasPoints = r.points != null || r.xp != null;
  const hasName = r.full_name != null || r.name != null;
  return hasPoints && hasName;
}

/**
 * Extracts leaderboard rows from tool `data` (structured `{ leaderboard }` or legacy XP row array).
 * Returns `null` when the payload is not a leaderboard shape (e.g. `all_badges` array).
 */
export function leaderboardRowsFromToolData(data: unknown): LeaderboardXpRow[] | null {
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const o = data as Record<string, unknown>;
    if (Array.isArray(o.leaderboard)) {
      return o.leaderboard as LeaderboardXpRow[];
    }
  }
  if (Array.isArray(data)) {
    if (data.length === 0) return [];
    if (rowLooksLikeXpLeaderboard(data[0])) return data as LeaderboardXpRow[];
  }
  return null;
}

/**
 * Reads aggregates from structured tool data when present.
 */
export function leaderboardAggregatesFromToolData(data: unknown): LeaderboardXpAggregates | undefined {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return undefined;
  const o = data as Record<string, unknown>;
  const a = o.aggregates;
  if (!a || typeof a !== 'object') return undefined;
  const rec = a as Record<string, unknown>;
  const count = Number(rec.count ?? 0);
  const topPoints = Number(rec.topPoints ?? 0);
  const avgPoints = Number(rec.avgPoints ?? 0);
  if (!Number.isFinite(count)) return undefined;
  return { count, topPoints, avgPoints };
}
