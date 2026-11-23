import { describe, expect, it } from 'vitest';
import { headStillHolds, parseVerifyArgs } from '../../scripts/engageAuditVerifyArgs.js';

const ORG = '0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f';
const HASH = 'a'.repeat(64);

describe('engage:audit-verify arguments', () => {
  it('takes --all or one --org', () => {
    expect(parseVerifyArgs(['--all'])).toEqual({ all: true });
    expect(parseVerifyArgs(['--org', ORG])).toEqual({ all: false, org: ORG });
  });
  it('takes a remembered head only with --org, and both parts together', () => {
    expect(parseVerifyArgs(['--org', ORG, '--expect-head-seq', '42', '--expect-head-hash', HASH])).toMatchObject({ expectSeq: 42, expectHash: HASH });
    expect(() => parseVerifyArgs(['--org', ORG, '--expect-head-seq', '42'])).toThrow(/go together/);
    expect(() => parseVerifyArgs(['--all', '--expect-head-seq', '1', '--expect-head-hash', HASH])).toThrow();
  });
  it('refuses anything else', () => {
    expect(() => parseVerifyArgs([])).toThrow(/exactly one/);
    expect(() => parseVerifyArgs(['--all', '--org', ORG])).toThrow(/exactly one/);
    expect(() => parseVerifyArgs(['--org', 'nope'])).toThrow(/UUID/);
    expect(() => parseVerifyArgs(['--org', ORG, '--expect-head-seq', '0', '--expect-head-hash', HASH])).toThrow(/positive/);
    expect(() => parseVerifyArgs(['--org', ORG, '--expect-head-seq', '1', '--expect-head-hash', 'XYZ'])).toThrow(/64/);
    expect(() => parseVerifyArgs(['--bogus'])).toThrow(/Unexpected/);
    expect(() => parseVerifyArgs(['--org'])).toThrow(/needs a value/);
  });
});

describe('remembered head', () => {
  const status = (headSeq: number | null) => ({ ok: true, entries: headSeq ?? 0, firstBadSeq: null, headSeq, headHash: HASH });
  it('holds when the entry at that position still has the remembered hash, even after the chain grew', async () => {
    expect(await headStillHolds(status(50), 42, HASH, async () => HASH)).toBe(true);
  });
  it('fails when the chain is now shorter (a removed tail) or the entry changed', async () => {
    expect(await headStillHolds(status(40), 42, HASH, async () => HASH)).toBe(false);
    expect(await headStillHolds(status(null), 42, HASH, async () => null)).toBe(false);
    expect(await headStillHolds(status(50), 42, HASH, async () => 'b'.repeat(64))).toBe(false);
  });
});
