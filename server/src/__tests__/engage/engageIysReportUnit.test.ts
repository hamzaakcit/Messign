/**
 * The İYS SLA classification (WP-26) without a database: how a report still waiting is graded against the same-day target and
 * the three-business-day limit, and how fresh a pull is. Business days are Monday to Friday in Turkish time.
 */
import { describe, expect, it } from 'vitest';
import { classifyPending, classifyPull } from '../../engage/iys/report.js';

const at = (iso: string) => new Date(iso);
const HOUR = 3_600_000;

describe('a report still waiting', () => {
  // Opt-out on Wednesday 2026-11-18 at 10:00 Turkish time (07:00 UTC). Three business days later is Monday 2026-11-23, 10:00.
  const wed = at('2026-11-18T07:00:00Z');
  it('is on track for the first day, late after 24 hours', () => {
    expect(classifyPending(wed, at('2026-11-18T07:00:00Z'))).toBe('on_track');
    expect(classifyPending(wed, new Date(wed.getTime() + 24 * HOUR))).toBe('on_track');
    expect(classifyPending(wed, new Date(wed.getTime() + 24 * HOUR + 1))).toBe('late');
  });
  it('is at risk from two business days (Friday 10:00), and breached after three (Monday 10:00), with the weekend in between', () => {
    expect(classifyPending(wed, at('2026-11-19T20:00:00Z'))).toBe('late'); // Thursday evening
    expect(classifyPending(wed, at('2026-11-20T07:00:00Z'))).toBe('at_risk'); // Friday 10:00: two business days
    expect(classifyPending(wed, at('2026-11-22T12:00:00Z'))).toBe('at_risk'); // Sunday
    expect(classifyPending(wed, at('2026-11-23T07:00:00Z'))).toBe('at_risk'); // Monday 10:00 exactly: the last moment
    expect(classifyPending(wed, at('2026-11-23T07:00:01Z'))).toBe('breached');
  });
  it('counts a Friday evening opt-out from the next business day', () => {
    const fri = at('2026-11-20T15:00:00Z');
    expect(classifyPending(fri, at('2026-11-24T14:59:59Z'))).toBe('late'); // Tuesday just before 18:00 Turkish time
    expect(classifyPending(fri, at('2026-11-24T15:00:00Z'))).toBe('at_risk'); // two business days after Friday 18:00
    expect(classifyPending(fri, at('2026-11-25T15:00:01Z'))).toBe('breached');
  });
});

describe('a pull', () => {
  const now = at('2026-11-20T12:00:00Z');
  it('is ok within two hours, stale up to 72 hours, critical beyond, and never before the first success', () => {
    expect(classifyPull(null, now)).toBe('never');
    expect(classifyPull(new Date(now.getTime() - 2 * HOUR), now)).toBe('ok');
    expect(classifyPull(new Date(now.getTime() - 2 * HOUR - 1), now)).toBe('stale');
    expect(classifyPull(new Date(now.getTime() - 72 * HOUR), now)).toBe('stale');
    expect(classifyPull(new Date(now.getTime() - 72 * HOUR - 1), now)).toBe('critical');
  });
});
