import { describe, expect, it } from 'vitest';
import { CsvError, parseCsv } from '../../engage/import/csv.js';
import { ErrorSink, parseOrderRows, parseProfileRows } from '../../engage/import/importers.js';
import { TEST_PHONE_PREFIX, assertSafeEmail, assertSafePhone, generateSyntheticTenant } from '../../engage/import/synthetic.js';
import { normalizePhone } from '../../engage/profiles.js';

describe('csv parser', () => {
  it('reads quoted fields, escaped quotes, embedded delimiters and newlines, CRLF and a BOM', () => {
    const t = parseCsv('﻿External_ID,Name,Note\r\na1,"Yılmaz, Ayşe","said ""hi""\nthen left"\r\na2,Ali,\r\n');
    expect(t.headers).toEqual(['external_id', 'name', 'note']);
    expect(t.rows.map((r) => r.cells)).toEqual([['a1', 'Yılmaz, Ayşe', 'said "hi"\nthen left'], ['a2', 'Ali', '']]);
  });
  it('reports the file line each row starts on, even after a multi-line field', () => {
    const t = parseCsv('a,b\n1,"x\ny"\n2,z\n');
    expect(t.rows.map((r) => r.line)).toEqual([2, 4]);
  });
  it('picks the semicolon delimiter used by Turkish spreadsheet exports', () => {
    const t = parseCsv('external_id;email\nc1;a@example.com\n');
    expect(t.delimiter).toBe(';');
    expect(t.rows[0]!.cells).toEqual(['c1', 'a@example.com']);
  });
  it('ignores blank lines and accepts a missing final newline', () => {
    expect(parseCsv('a\n\n1\n\n2').rows.map((r) => r.cells[0])).toEqual(['1', '2']);
  });
  it.each([
    ['', /empty/],
    ['a,a\n1,2', /same name/],
    ['a,,b\n1,2,3', /no name/],
    ['a,b\n1,"open', /never closed/],
  ])('rejects %j', (input, re) => {
    expect(() => parseCsv(input)).toThrow(CsvError);
    expect(() => parseCsv(input)).toThrow(re);
  });
});

function rows<T>(csv: string, parse: (t: ReturnType<typeof parseCsv>, s: ErrorSink) => T[]): { out: T[]; sink: ErrorSink } {
  const sink = new ErrorSink();
  return { out: parse(parseCsv(csv), sink), sink };
}

describe('profile rows', () => {
  const H = 'external_id,email,phone,city,consent_email,consent_sms,consent_recorded_at,consent_evidence_ref\n';
  it('normalizes identifiers and keeps other columns as attributes', () => {
    const { out, sink } = rows(`${H}c1, Ada@Example.COM ,0532 111 22 33,Izmir,,,,\n`, parseProfileRows);
    expect(sink.total).toBe(0);
    expect(out[0]).toMatchObject({ externalId: 'c1', email: 'ada@example.com', phone: '+905321112233', attributes: { city: 'Izmir' } });
  });
  it('a bad email or phone is reported but the profile is still imported', () => {
    const { out, sink } = rows(`${H}c1,nope,12,Izmir,,,,\n`, parseProfileRows);
    expect(out).toHaveLength(1);
    expect(out[0]!.email).toBeUndefined();
    expect(sink.errors.map((e) => e.code)).toEqual(['invalid_email', 'invalid_phone']);
    expect(JSON.stringify(sink.errors)).not.toMatch(/nope/);
  });
  it('a missing external_id drops the row', () => {
    const { out, sink } = rows(`${H},a@example.com,,,,,,\n`, parseProfileRows);
    expect(out).toHaveLength(0);
    expect(sink.errors[0]).toMatchObject({ line: 2, code: 'invalid_external_id' });
  });
  it('a grant needs a date and an evidence reference; a revocation does not', () => {
    const { out, sink } = rows(`${H}c1,,,,granted,revoked,,\nc2,,,,granted,,2025-03-01,form-v3\n`, parseProfileRows);
    expect(sink.errors.map((e) => e.code)).toEqual(['consent_evidence_missing']);
    expect([...out[0]!.consents]).toEqual([['sms', expect.objectContaining({ status: 'revoked' })]]);
    expect(out[1]!.consents.get('email')).toMatchObject({ status: 'granted', evidence: { evidence_ref: 'form-v3' } });
  });
  it('refuses a consent dated in the future and an unknown value', () => {
    const future = new Date(Date.now() + 5 * 86400_000).toISOString().slice(0, 10);
    const { sink } = rows(`${H}c1,,,,granted,maybe,${future},form\n`, parseProfileRows);
    expect(sink.errors.map((e) => e.code).sort()).toEqual(['consent_in_future', 'invalid_consent_value']);
  });
  it('accepts yes/no/evet/hayır spellings', () => {
    const { out } = rows(`${H}c1,,,,evet,hayır,2025-01-01,form\n`, parseProfileRows);
    expect(out[0]!.consents.get('email')!.status).toBe('granted');
    expect(out[0]!.consents.get('sms')!.status).toBe('revoked');
  });
  it('requires the external_id column and rejects column names that cannot be attributes', () => {
    expect(() => parseProfileRows(parseCsv('email\na@example.com\n'), new ErrorSink())).toThrow(/external_id/);
    expect(() => parseProfileRows(parseCsv('external_id,Favori Tür\nc1,x\n'), new ErrorSink())).toThrow(/attribute name/);
  });
});

describe('order rows', () => {
  const day = (n: number) => new Date(Date.now() - n * 86400_000).toISOString().slice(0, 10);
  it('accepts a decimal comma and defaults the currency to TRY', () => {
    const { out, sink } = rows(`order_id,external_id,ordered_at,total,product_ids\no1,c1,${day(3)},"129,90",b1|b2\n`, parseOrderRows);
    expect(sink.total).toBe(0);
    expect(out[0]).toMatchObject({ orderId: 'o1', total: 129.9, currency: 'TRY', productIds: ['b1', 'b2'] });
  });
  it('rejects bad totals, future dates and orders older than the event window', () => {
    const future = new Date(Date.now() + 3 * 86400_000).toISOString().slice(0, 10);
    const { out, sink } = rows(`order_id,external_id,ordered_at,total\no1,c1,${day(2)},abc\no2,c1,${future},10\no3,c1,${day(500)},10\no4,c1,not-a-date,10\no5,c1,${day(2)},10\n`, parseOrderRows);
    expect(out.map((o) => o.orderId)).toEqual(['o5']);
    expect(sink.errors.map((e) => e.code)).toEqual(['invalid_total', 'date_in_future', 'date_too_old', 'invalid_date']);
  });
  it('requires its columns', () => {
    expect(() => parseOrderRows(parseCsv('order_id,external_id\no1,c1\n'), new ErrorSink())).toThrow(/ordered_at/);
  });
});

describe('synthetic generator', () => {
  const gen = (over: Partial<Parameters<typeof generateSyntheticTenant>[0]> = {}) => generateSyntheticTenant({ kind: 'bookstore', profiles: 3000, seed: 7, ...over });

  it('is deterministic for a seed and different for another', () => {
    const now = new Date('2026-11-08T00:00:00Z');
    expect(gen({ now }).profilesCsv).toBe(gen({ now }).profilesCsv);
    expect(gen({ now, seed: 8 }).profilesCsv).not.toBe(gen({ now }).profilesCsv);
  });

  it.each(['bookstore', 'florist'] as const)('%s: every email is example.* or a known-broken string, every phone is in the test range or a known-broken string', (kind) => {
    const t = gen({ kind });
    for (const csv of [t.profilesCsv]) {
      const table = parseCsv(csv);
      const e = table.headers.indexOf('email'); const p = table.headers.indexOf('phone');
      for (const r of table.rows) {
        if (r.cells[e]) expect(() => assertSafeEmail(r.cells[e]!), `email on line ${r.line}`).not.toThrow();
        if (r.cells[p]) expect(() => assertSafePhone(r.cells[p]!), `phone on line ${r.line}`).not.toThrow();
      }
    }
    const text = t.profilesCsv + t.ordersCsv;
    expect(text).not.toMatch(/@(?!example\.(com|org|net))[a-z0-9-]+\.[a-z]/i);
    const valid = [...t.profilesCsv.matchAll(/(?:\+90|0)?\s?5000[\s\d]{6,8}/g)].map((m) => normalizePhone(m[0])).filter(Boolean);
    expect(valid.length).toBeGreaterThan(1000);
    for (const n of valid) expect(n!.startsWith(TEST_PHONE_PREFIX)).toBe(true);
  });

  it('refuses anything outside the test space', () => {
    for (const bad of ['ayse@gmail.com', 'x@example.com.evil.io', 'a@hotmail.com']) expect(() => assertSafeEmail(bad)).toThrow(/non-test/);
    for (const bad of ['+905321234567', '0532 123 45 67', '+442079460958', '+905001234567']) expect(() => assertSafePhone(bad)).toThrow(/non-test/);
  });

  it('injects real-world mess by default, and none when asked for clean data', () => {
    const messy = gen().profilesCsv;
    expect(messy).toMatch(/ayse@@example\.com|no-at-sign|trailing@|spaces in@/);
    expect(messy).toContain('maybe');
    const t = parseCsv(messy);
    const ids = t.rows.map((r) => r.cells[0]);
    expect(new Set(ids).size, 'duplicate customers').toBeLessThan(ids.length);
    expect(ids.some((i) => i === ''), 'a row without an id').toBe(true);
    const clean = parseCsv(gen({ mess: false }).profilesCsv);
    expect(new Set(clean.rows.map((r) => r.cells[0])).size).toBe(clean.rows.length);
    expect(clean.rows.some((r) => r.cells[0] === '')).toBe(false);
    expect(gen({ mess: false }).profilesCsv).not.toMatch(/@@|no-at-sign|maybe/);
  });

  it('gives two different customers the same email (the importer must cope with that)', () => {
    const t = parseCsv(gen({ profiles: 6000 }).profilesCsv);
    const e = t.headers.indexOf('email');
    const owners = new Map<string, Set<string>>();
    for (const r of t.rows) {
      const v = r.cells[e]!.trim().toLowerCase();
      if (v && /^[^@\s]+@example\.(com|org|net)$/.test(v) && r.cells[0]) (owners.get(v) ?? owners.set(v, new Set()).get(v)!).add(r.cells[0]);
    }
    expect([...owners.values()].some((ids) => ids.size > 1)).toBe(true);
  });

  it('stated expectations match what the files contain', () => {
    const t = gen();
    const table = parseCsv(t.profilesCsv);
    expect(table.rows.length).toBe(t.expected.profileRows);
    expect(new Set(table.rows.map((r) => r.cells[0]).filter(Boolean)).size).toBe(t.expected.distinctProfiles);
    expect(parseCsv(t.ordersCsv).rows.length).toBe(t.expected.orderRows);
  });

  it('florist data carries occasion dates; bookstore data carries reading taste', () => {
    expect(parseCsv(gen({ kind: 'florist' }).profilesCsv).headers).toEqual(expect.arrayContaining(['birth_date', 'anniversary_date']));
    expect(parseCsv(gen({ kind: 'bookstore' }).profilesCsv).headers).toEqual(expect.arrayContaining(['favorite_genre', 'preferred_format']));
  });

  it('rejects an impossible size', () => {
    expect(() => gen({ profiles: 0 })).toThrow();
    expect(() => gen({ profiles: 1_000_001 })).toThrow();
  });
});
