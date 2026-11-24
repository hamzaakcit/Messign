import { withEngageTenant } from '../db.js';
import { getJourney, JourneyInputError } from '../journeys/journeys.js';
import { uplift, type Uplift } from './stats.js';

/**
 * Journey results (WP-21): what happened to the treatment and the holdout groups, and whether the difference is
 * real. Conversion means at least one order placed in the window after the customer entered the journey. Only
 * enrollments whose window has ended ("mature") are counted, so a customer who is still inside the window cannot make
 * one group look better than the other. All numbers come from the same tables the rest of engage writes (enrollments,
 * enrollment_steps, messages, events); nothing is cached, so the numbers always reconcile with those tables.
 */

export const DEFAULT_WINDOW_HOURS = 72;
export const MAX_WINDOW_HOURS = 168;

export interface GroupCounts {
  entered: number; mature: number; active: number; completed: number; exited: number; failed: number;
}
export interface GroupConversion {
  n: number; converted: number; conversionRate: number | null; revenue: number; revenuePerCustomer: number | null;
}
export interface JourneyResults {
  windowHours: number;
  asOf: string;
  enrollments: { treatment: GroupCounts; holdout: GroupCounts };
  conversion: { treatment: GroupConversion; holdout: GroupConversion; uplift: Uplift; revenueDifferencePerCustomer: number | null };
  messages: { created: number; byStatus: Record<string, number>; heldOut: number };
  note: string;
}

const emptyCounts = (): GroupCounts => ({ entered: 0, mature: 0, active: 0, completed: 0, exited: 0, failed: 0 });
const emptyConversion = (): GroupConversion => ({ n: 0, converted: 0, conversionRate: null, revenue: 0, revenuePerCustomer: null });

export async function journeyResults(orgId: string, journeyId: string, opts: { windowHours?: number; now?: Date } = {}): Promise<JourneyResults> {
  const windowHours = opts.windowHours ?? DEFAULT_WINDOW_HOURS;
  if (!Number.isInteger(windowHours) || windowHours < 1 || windowHours > MAX_WINDOW_HOURS) {
    throw new JourneyInputError(`windowHours must be a whole number from 1 to ${MAX_WINDOW_HOURS}`);
  }
  const asOf = opts.now ?? new Date();
  await getJourney(orgId, journeyId); // 404 for another tenant's or a made-up journey

  return withEngageTenant(orgId, async (c) => {
    const enrolled = (await c.query<{ cohort: string; status: string; mature: boolean; n: number }>(
      `SELECT en.cohort, en.status, (en.entered_at + make_interval(hours => $3::int) <= $4::timestamptz) AS mature, count(*)::int AS n
         FROM engage.enrollments en WHERE en.organization_id = $1 AND en.journey_id = $2
        GROUP BY 1, 2, 3`, [orgId, journeyId, windowHours, asOf.toISOString()])).rows;

    // One row per mature enrollment: the orders and revenue inside its window (orders after `asOf` are not known yet).
    const conv = (await c.query<{ cohort: string; n: number; converted: number; revenue: string }>(
      `SELECT x.cohort, count(*)::int AS n, count(*) FILTER (WHERE x.orders > 0)::int AS converted, COALESCE(sum(x.revenue), 0)::text AS revenue
         FROM (
           SELECT en.id, en.cohort,
                  count(ev.id)::int AS orders,
                  COALESCE(sum(CASE WHEN ev.properties->>'total' ~ '^[0-9]{1,12}(\\.[0-9]{1,6})?$' THEN (ev.properties->>'total')::numeric END), 0) AS revenue
             FROM engage.enrollments en
             LEFT JOIN engage.events ev ON ev.organization_id = en.organization_id AND ev.profile_id = en.profile_id
                  AND ev.name = 'order_completed' AND ev.occurred_at >= en.entered_at
                  AND ev.occurred_at <= en.entered_at + make_interval(hours => $3::int) AND ev.occurred_at <= $4::timestamptz
            WHERE en.organization_id = $1 AND en.journey_id = $2
              AND en.entered_at + make_interval(hours => $3::int) <= $4::timestamptz
            GROUP BY en.id, en.cohort
         ) x
        GROUP BY x.cohort`, [orgId, journeyId, windowHours, asOf.toISOString()])).rows;

    const steps = (await c.query<{ cohort: string; outcome: string | null; message_status: string | null; n: number }>(
      `SELECT en.cohort, st.outcome, m.status AS message_status, count(*)::int AS n
         FROM engage.enrollment_steps st
         JOIN engage.enrollments en ON en.organization_id = st.organization_id AND en.id = st.enrollment_id
         LEFT JOIN engage.messages m ON m.organization_id = st.organization_id AND m.id = st.message_id
        WHERE st.organization_id = $1 AND en.journey_id = $2 AND st.step_type = 'message'
        GROUP BY 1, 2, 3`, [orgId, journeyId])).rows;

    const counts = { treatment: emptyCounts(), holdout: emptyCounts() };
    for (const r of enrolled) {
      const g = counts[r.cohort as 'treatment' | 'holdout'];
      if (!g) continue;
      g.entered += r.n;
      if (r.mature) g.mature += r.n;
      if (r.status === 'active') g.active += r.n;
      if (r.status === 'completed') g.completed += r.n;
      if (r.status === 'exited') g.exited += r.n;
      if (r.status === 'failed') g.failed += r.n;
    }
    const conversion = { treatment: emptyConversion(), holdout: emptyConversion() };
    for (const r of conv) {
      const g = conversion[r.cohort as 'treatment' | 'holdout'];
      if (!g) continue;
      g.n += r.n; g.converted += r.converted; g.revenue += Number(r.revenue);
    }
    for (const g of [conversion.treatment, conversion.holdout]) {
      g.conversionRate = g.n > 0 ? g.converted / g.n : null;
      g.revenuePerCustomer = g.n > 0 ? g.revenue / g.n : null;
    }
    const messages = { created: 0, byStatus: {} as Record<string, number>, heldOut: 0 };
    for (const r of steps) {
      if (r.outcome === 'held_out') messages.heldOut += r.n;
      if (r.message_status) {
        messages.created += r.n;
        messages.byStatus[r.message_status] = (messages.byStatus[r.message_status] ?? 0) + r.n;
      }
    }
    const difference = conversion.treatment.revenuePerCustomer !== null && conversion.holdout.revenuePerCustomer !== null
      ? conversion.treatment.revenuePerCustomer - conversion.holdout.revenuePerCustomer : null;
    return {
      windowHours,
      asOf: asOf.toISOString(),
      enrollments: { treatment: counts.treatment, holdout: counts.holdout },
      conversion: {
        treatment: conversion.treatment,
        holdout: conversion.holdout,
        uplift: uplift(
          { n: conversion.treatment.n, converted: conversion.treatment.converted },
          { n: conversion.holdout.n, converted: conversion.holdout.converted },
        ),
        revenueDifferencePerCustomer: difference,
      },
      messages,
      note: `Only customers whose ${windowHours}-hour window has ended are counted. Converted = at least one order in that window after they entered. The interval is 95%.`,
    };
  });
}
