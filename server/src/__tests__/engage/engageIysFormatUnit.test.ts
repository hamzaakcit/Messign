/**
 * İYS formats and rules (WP-26) without a database or a network. The expectations follow the official documentation
 * (apidocs.iys.org.tr 3.2.4): Turkish-time dates, the three channels, and the three-business-day reporting limit.
 */
import { describe, expect, it } from 'vitest';
import { addBusinessDays, channelOfIysType, formatIysDate, iysSourceOf, iysTypeOf, parseIysDate, reportDeadline } from '../../engage/iys/format.js';

describe('dates', () => {
  it('are written in Turkish time (UTC+3), as YYYY-MM-DD HH:mm:ss', () => {
    expect(formatIysDate(new Date('2026-11-20T10:30:05Z'))).toBe('2026-11-20 13:30:05');
    expect(formatIysDate(new Date('2026-11-20T22:00:00Z'))).toBe('2026-11-21 01:00:00'); // the next day in Turkey
    expect(formatIysDate(new Date('2026-12-31T21:00:00Z'))).toBe('2027-01-01 00:00:00');
  });
  it('round-trip, and refuse anything else', () => {
    const at = new Date('2026-03-08T04:05:06Z');
    expect(parseIysDate(formatIysDate(at))?.toISOString()).toBe(at.toISOString());
    expect(parseIysDate('2020-07-08 07:07:07')?.toISOString()).toBe('2020-07-08T04:07:07.000Z');
    for (const bad of ['2020-07-08T07:07:07', '2020-7-8 07:07:07', '2020-02-30 10:00:00', '2020-13-01 10:00:00', '2020-07-08 25:00:00', '', null, 5, undefined]) {
      expect(parseIysDate(bad), String(bad)).toBeNull();
    }
  });
});

describe('business days', () => {
  it('skip the weekend and keep the time of day (Friday 2026-11-20 is a business day in Turkey)', () => {
    expect(addBusinessDays(new Date('2026-11-18T09:00:00Z'), 3).toISOString()).toBe('2026-11-23T09:00:00.000Z'); // Wed -> Mon
    expect(addBusinessDays(new Date('2026-11-16T09:00:00Z'), 3).toISOString()).toBe('2026-11-19T09:00:00.000Z'); // Mon -> Thu
    expect(addBusinessDays(new Date('2026-11-20T09:00:00Z'), 3).toISOString()).toBe('2026-11-25T09:00:00.000Z'); // Fri -> Wed
    expect(addBusinessDays(new Date('2026-11-21T09:00:00Z'), 1).toISOString()).toBe('2026-11-23T09:00:00.000Z'); // Sat -> Mon
    expect(addBusinessDays(new Date('2026-11-21T09:00:00Z'), 0).toISOString()).toBe('2026-11-21T09:00:00.000Z');
  });
  it('count the day in Turkish time: late on a Friday UTC is already Saturday in Turkey', () => {
    // Friday 22:30 UTC is Saturday 01:30 in Turkey, so one business day later is Monday 01:30 Turkish time.
    expect(addBusinessDays(new Date('2026-11-20T22:30:00Z'), 1).toISOString()).toBe('2026-11-22T22:30:00.000Z');
  });
  it('the reporting deadline of a consent is three business days later', () => {
    expect(reportDeadline(new Date('2026-11-19T12:00:00Z')).toISOString()).toBe('2026-11-24T12:00:00.000Z'); // Thu -> Tue
  });
});

describe('channels and sources', () => {
  it('map the local channels to İYS types, and WhatsApp to none', () => {
    expect(iysTypeOf('email')).toBe('EPOSTA');
    expect(iysTypeOf('sms')).toBe('MESAJ');
    expect(iysTypeOf('call')).toBe('ARAMA');
    expect(iysTypeOf('whatsapp')).toBeNull();
  });
  it('map an İYS type back to a local channel', () => {
    expect([channelOfIysType('EPOSTA'), channelOfIysType('MESAJ'), channelOfIysType('ARAMA'), channelOfIysType('SMS'), channelOfIysType('')]).toEqual(['email', 'sms', 'call', null, null]);
  });
  it('report a tenant opt-out with the documented source that describes how it happened, never HS_KARAR', () => {
    expect(iysSourceOf('unsubscribe_link')).toBe('HS_EPOSTA');
    expect(iysSourceOf('stop_keyword')).toBe('HS_MESAJ');
    expect(iysSourceOf('web')).toBe('HS_WEB');
    expect(iysSourceOf('api')).toBe('HS_EORTAM');
    expect(iysSourceOf('import')).toBe('HS_EORTAM');
    expect(iysSourceOf('iys')).toBeNull(); // what came from İYS is never reported back
  });
});
