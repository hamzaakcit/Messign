/**
 * Aggregates for `projects:get_sprint_status` (sprint_requests / help sprints).
 */

export interface SprintStatusAggregates {
  sprintCount: number;
  /** Mean helper staffing progress % */
  avgProgress: number;
  /** Count of rows with ACTIVE or IN_PROGRESS status */
  activeCount: number;
  /** Smallest days-until-end among rows with a known end; null if none */
  minDaysLeft: number | null;
}

/**
 * Rolls up enriched sprint rows from get_sprint_status.
 */
export function computeSprintStatusAggregates(sprints: ReadonlyArray<Record<string, unknown>>): SprintStatusAggregates {
  if (sprints.length === 0) {
    return { sprintCount: 0, avgProgress: 0, activeCount: 0, minDaysLeft: null };
  }
  let sumProgress = 0;
  let activeCount = 0;
  const daysCandidates: number[] = [];
  for (const s of sprints) {
    sumProgress += Number(s.progress ?? 0);
    const st = String(s.status ?? '').toUpperCase();
    if (st === 'ACTIVE' || st === 'IN_PROGRESS') activeCount += 1;
    const dl = s.daysLeft;
    if (typeof dl === 'number' && Number.isFinite(dl)) daysCandidates.push(dl);
  }
  const n = sprints.length;
  const minDaysLeft = daysCandidates.length > 0 ? Math.min(...daysCandidates) : null;
  return {
    sprintCount: n,
    avgProgress: n > 0 ? Math.round(sumProgress / n) : 0,
    activeCount,
    minDaysLeft,
  };
}

/**
 * Normalizes legacy array or `{ sprints, aggregates }` payloads.
 */
export function sprintsFromSprintStatusData(data: unknown): {
  sprints: Record<string, unknown>[];
  aggregates: SprintStatusAggregates;
} {
  if (Array.isArray(data)) {
    const sprints = data as Record<string, unknown>[];
    return { sprints, aggregates: computeSprintStatusAggregates(sprints) };
  }
  if (data && typeof data === 'object' && Array.isArray((data as Record<string, unknown>).sprints)) {
    const o = data as Record<string, unknown>;
    const sprints = o.sprints as Record<string, unknown>[];
    const agg = o.aggregates as SprintStatusAggregates | undefined;
    return { sprints, aggregates: agg ?? computeSprintStatusAggregates(sprints) };
  }
  return { sprints: [], aggregates: computeSprintStatusAggregates([]) };
}

/**
 * One-line summary for chat (no markdown).
 */
export function buildShortSprintSummary(aggregates: SprintStatusAggregates, filterHint?: string): string {
  if (aggregates.sprintCount === 0) {
    const hint = filterHint?.trim() ? ` (${filterHint.trim()})` : '';
    return `No sprint or help requests found${hint}.`;
  }
  const deadline =
    aggregates.minDaysLeft != null
      ? aggregates.minDaysLeft === 0
        ? ' Closest deadline is today.'
        : ` Closest deadline in ${aggregates.minDaysLeft} day${aggregates.minDaysLeft === 1 ? '' : 's'}.`
      : '';
  return `${aggregates.sprintCount} sprint/help request${aggregates.sprintCount === 1 ? '' : 's'} (avg ${aggregates.avgProgress}% staffed, ${aggregates.activeCount} active).${deadline}`;
}
