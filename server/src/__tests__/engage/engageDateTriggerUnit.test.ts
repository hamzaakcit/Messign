/**
 * The date-attribute trigger's date logic (WP-25) without a database: which day a run's customers' occasions fall on,
 * how 29 February is treated, and the definition rule that a yearly journey must allow re-entry.
 */
import { describe, expect, it } from 'vitest';
import { addDays, isLeapYear, occasionDayFor, occasionMatch } from '../../engage/journeys/dateTrigger.js';
import { validateDefinition } from '../../engage/journeys/definition.js';
import { occasionJourneyKey, occasionReminderDefinition } from '../../engage/journeys/occasionReminder.js';

describe('occasion day', () => {
  it('is the run day minus the offset: a negative offset looks ahead, a positive one looks back', () => {
    expect(occasionDayFor('2026-11-21', -7)).toBe('2026-11-28'); // fires 7 days before the occasion
    expect(occasionDayFor('2026-11-21', 0)).toBe('2026-11-21');
    expect(occasionDayFor('2026-11-21', 3)).toBe('2026-11-18'); // fires 3 days after
  });
  it('crosses months and years, and leap days, as a calendar does', () => {
    expect(addDays('2026-12-28', 7)).toBe('2027-01-04');
    expect(addDays('2027-01-02', -5)).toBe('2026-12-28');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2027-02-28', 1)).toBe('2027-03-01');
    expect(occasionDayFor('2027-03-01', -365)).toBe('2028-02-29'); // a year later is 366 days away when a leap day lies between
  });
  it('knows leap years', () => {
    expect([2024, 2028, 2000].every(isLeapYear)).toBe(true);
    expect([2025, 2026, 1900, 2100].some(isLeapYear)).toBe(false);
  });
});

describe('what matches an occasion day', () => {
  it('is the month and day, whatever year the customer recorded', () => {
    expect(occasionMatch('2026-11-28')).toEqual({ monthDay: '11-28', alsoLeapDay: false });
    expect(occasionMatch('2026-01-05')).toEqual({ monthDay: '01-05', alsoLeapDay: false });
  });
  it('29 February is celebrated on 28 February in a year without one, and on the day in a leap year', () => {
    expect(occasionMatch('2027-02-28')).toEqual({ monthDay: '02-28', alsoLeapDay: true });
    expect(occasionMatch('2028-02-28')).toEqual({ monthDay: '02-28', alsoLeapDay: false });
    expect(occasionMatch('2028-02-29')).toEqual({ monthDay: '02-29', alsoLeapDay: false });
    expect(occasionMatch('2027-03-01')).toEqual({ monthDay: '03-01', alsoLeapDay: false });
  });
  it('refuses anything that is not a calendar date string', () => {
    expect(() => occasionMatch('2026-1-5')).toThrow();
    expect(() => occasionMatch("2026-01-05' OR 1=1")).toThrow();
  });
});

describe('the definition of a date-attribute journey', () => {
  const steps = [{ id: 'm', type: 'message', channel: 'email', template: 'occasion-reminder', purpose: 'marketing' }];
  const trigger = { type: 'date_attribute', attribute: 'anniversary_date', offset_days: -7, at_local_time: '09:30' };
  it('must let a customer enter again, because the occasion comes back every year', () => {
    const never = validateDefinition({ trigger, steps });
    expect(never.ok).toBe(false);
    if (!never.ok) expect(never.errors).toEqual([{ path: 're_entry', message: expect.stringMatching(/after_exit/) }]);
    expect(validateDefinition({ trigger, re_entry: 'never', steps }).ok).toBe(false);
    expect(validateDefinition({ trigger, re_entry: 'after_exit', steps }).ok).toBe(true);
  });
  it('does not change the other triggers', () => {
    expect(validateDefinition({ trigger: { type: 'api' }, steps }).ok).toBe(true);
    expect(validateDefinition({ trigger: { type: 'event', event: 'cart_updated' }, steps }).ok).toBe(true);
  });
  it('the ready-made occasion reminder is valid and keyed by attribute', () => {
    expect(validateDefinition(occasionReminderDefinition({ attribute: 'birth_date' })).ok).toBe(true);
    expect(validateDefinition(occasionReminderDefinition({ attribute: 'anniversary_date', offsetDays: 0, atLocalTime: '08:00' })).ok).toBe(true);
    expect(occasionJourneyKey('anniversary_date')).toBe('occasion-anniversary-date');
    expect(occasionJourneyKey('BirthDate')).toBe('occasion-birthdate');
  });
});
