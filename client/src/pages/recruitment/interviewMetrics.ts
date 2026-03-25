/**
 * Helpers for recruitment interview KPIs (client-side filtering).
 */

export interface WeekRange {
  start: Date;
  end: Date;
}

/** Monday 00:00:00 — Sunday 23:59:59.999 in local time (for “this week” KPIs). */
export function getCurrentWeekRange(now: Date = new Date()): WeekRange {
  const d = new Date(now);
  const day = d.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const start = new Date(d);
  start.setDate(d.getDate() + mondayOffset);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

export function isDateInRange(iso: string | null | undefined, range: WeekRange): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return t >= range.start.getTime() && t <= range.end.getTime();
}
