/** The dependency audit gate's decisions (WP-31), from a handed-in `npm audit` report. */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { advisoriesOf, evaluateAudit, type AcceptedAdvisory, type AuditReport } from '../../scripts/dependencyAuditCore.js';

const via = (name: string, ghsa: string, severity: string) => ({ source: 1, name, title: `${name} problem`, url: `https://github.com/advisories/${ghsa}`, severity });
const report: AuditReport = {
  vulnerabilities: {
    foo: { via: [via('foo', 'GHSA-aaaa-aaaa-aaaa', 'high')] },
    'needs-foo': { via: ['foo'] }, // inherits: a package name, not an advisory
    bar: { via: [via('bar', 'GHSA-bbbb-bbbb-bbbb', 'critical'), via('bar', 'GHSA-cccc-cccc-cccc', 'moderate')] },
  },
};
const accept = (id: string, reviewBy = '2099-01-01'): AcceptedAdvisory => ({ id, package: 'x', reason: 'a proper reason that is long enough', reviewBy });
const now = new Date('2026-11-23T00:00:00Z');

describe('dependency audit gate', () => {
  it('lists each advisory once and ignores inherited package names', () => {
    expect(advisoriesOf(report).map((a) => a.id)).toEqual(['GHSA-bbbb-bbbb-bbbb', 'GHSA-cccc-cccc-cccc', 'GHSA-aaaa-aaaa-aaaa']);
  });
  it('fails on an unaccepted high or critical advisory, and only reports a moderate one', () => {
    const r = evaluateAudit(report, [], now);
    expect(r.unaccepted.map((a) => a.id).sort()).toEqual(['GHSA-aaaa-aaaa-aaaa', 'GHSA-bbbb-bbbb-bbbb']);
    expect(r.nonGating.map((a) => a.id)).toEqual(['GHSA-cccc-cccc-cccc']);
  });
  it('passes when every high and critical advisory is accepted and not expired', () => {
    const r = evaluateAudit(report, [accept('GHSA-aaaa-aaaa-aaaa'), accept('GHSA-bbbb-bbbb-bbbb')], now);
    expect([r.unaccepted, r.expired, r.stale].map((x) => x.length)).toEqual([0, 0, 0]);
    expect(r.acceptedSeen).toHaveLength(2);
  });
  it('treats an expired acceptance as needing a review', () => {
    const r = evaluateAudit(report, [accept('GHSA-aaaa-aaaa-aaaa', '2026-11-22'), accept('GHSA-bbbb-bbbb-bbbb')], now);
    expect(r.expired.map((a) => a.id)).toEqual(['GHSA-aaaa-aaaa-aaaa']);
  });
  it('reports an acceptance that no advisory needs any more', () => {
    const r = evaluateAudit(report, [accept('GHSA-aaaa-aaaa-aaaa'), accept('GHSA-bbbb-bbbb-bbbb'), accept('GHSA-zzzz-zzzz-zzzz')], now);
    expect(r.stale.map((a) => a.id)).toEqual(['GHSA-zzzz-zzzz-zzzz']);
  });
  it('refuses an acceptance without a reason or a date', () => {
    expect(() => evaluateAudit(report, [{ id: 'GHSA-aaaa-aaaa-aaaa', package: 'x', reason: 'short', reviewBy: '2099-01-01' }], now)).toThrow(/reason/);
    expect(() => evaluateAudit(report, [{ id: 'GHSA-aaaa-aaaa-aaaa', package: 'x', reason: 'a proper reason that is long enough', reviewBy: 'someday' }], now)).toThrow(/reviewBy/);
    expect(() => evaluateAudit(report, [{ id: 'CVE-1', package: 'x', reason: 'a proper reason that is long enough', reviewBy: '2099-01-01' }], now)).toThrow(/GHSA/);
  });
  it('the committed acceptance file is well formed and every entry carries a real reason', () => {
    const file = JSON.parse(readFileSync(join(__dirname, '..', '..', '..', '..', 'docs', 'quality', 'audit-accepted.json'), 'utf8')) as { accepted: AcceptedAdvisory[] };
    expect(() => evaluateAudit({}, file.accepted, now)).not.toThrow();
    expect(new Set(file.accepted.map((a) => a.id)).size).toBe(file.accepted.length);
  });
});
