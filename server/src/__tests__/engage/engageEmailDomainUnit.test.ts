/**
 * The email domain authentication check (WP-39) without a database or a network: what counts as an SPF, DKIM and DMARC
 * record, how a failed lookup differs from a missing record, what the domain and selector inputs may be, and that a
 * check passes only when all three are found. DNS is a fake resolver; nothing here touches the real one.
 */
import { describe, expect, it } from 'vitest';

const { checkDomain, evaluateSpf, evaluateDmarc, evaluateDkim, domainOfAddress, parseSelectors, EmailDomainError } = await import('../../engage/settings/emailDomain.js');

const found = <T>(value: T) => ({ kind: 'found' as const, value });
const absent = { kind: 'absent' as const };
const failed = { kind: 'error' as const };

const dnsError = (code: string) => Object.assign(new Error(code), { code });
/** A resolver over fixed answers. A name with no answer is ENODATA, 'timeout' is ETIMEOUT. */
function resolver(txt: Record<string, string[][] | 'timeout'>, cname: Record<string, string[] | 'timeout'> = {}) {
  return {
    resolveTxt: async (name: string) => { const v = txt[name]; if (v === 'timeout') throw dnsError('ETIMEOUT'); if (!v) throw dnsError('ENODATA'); return v; },
    resolveCname: async (name: string) => { const v = cname[name]; if (v === 'timeout') throw dnsError('ETIMEOUT'); if (!v) throw dnsError('ENODATA'); return v; },
  };
}
const KEY = 'MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC7';
const GOOD_TXT = {
  'shop.example': [['v=spf1 include:amazonses.com ~all']],
  '_dmarc.shop.example': [['v=DMARC1; p=none; rua=mailto:dmarc@shop.example']],
};

describe('SPF', () => {
  it('needs exactly one v=spf1 record; other TXT records are ignored and split strings are joined', () => {
    expect(evaluateSpf(found([['google-site-verification=abc'], ['v=spf1 -all']]))).toEqual({ ok: true, code: 'found' });
    expect(evaluateSpf(found([['v=spf1 include:amazon', 'ses.com ~all']]))).toEqual({ ok: true, code: 'found' });
    expect(evaluateSpf(found([['v=spf1']]))).toEqual({ ok: true, code: 'found' });
  });
  it('is missing without a record, and a lookalike is not a record', () => {
    expect(evaluateSpf(absent)).toEqual({ ok: false, code: 'spf_missing' });
    expect(evaluateSpf(found([['google-site-verification=abc']]))).toEqual({ ok: false, code: 'spf_missing' });
    expect(evaluateSpf(found([['v=spf10 -all']]))).toEqual({ ok: false, code: 'spf_missing' });
  });
  it('fails with two records (a permanent error for receivers) and on a failed lookup', () => {
    expect(evaluateSpf(found([['v=spf1 -all'], ['v=spf1 ~all']]))).toEqual({ ok: false, code: 'spf_multiple' });
    expect(evaluateSpf(failed)).toEqual({ ok: false, code: 'lookup_failed' });
  });
});

describe('DMARC', () => {
  it('needs one v=DMARC1 record with a valid policy, and reports the policy', () => {
    expect(evaluateDmarc(found([['v=DMARC1; p=none']]))).toEqual({ ok: true, code: 'found', policy: 'none' });
    expect(evaluateDmarc(found([['v=DMARC1; p=Reject; rua=mailto:a@b.example']]))).toEqual({ ok: true, code: 'found', policy: 'reject' });
    expect(evaluateDmarc(found([['v=DMARC1; sp=none; p = quarantine']]))).toEqual({ ok: true, code: 'found', policy: 'quarantine' });
  });
  it('is invalid without a policy or with an unknown one', () => {
    expect(evaluateDmarc(found([['v=DMARC1']]))).toEqual({ ok: false, code: 'dmarc_invalid' });
    expect(evaluateDmarc(found([['v=DMARC1; rua=mailto:a@b.example']]))).toEqual({ ok: false, code: 'dmarc_invalid' });
    expect(evaluateDmarc(found([['v=DMARC1; p=maybe']]))).toEqual({ ok: false, code: 'dmarc_invalid' });
  });
  it('is missing when absent, multiple with two records, and unknown on a failed lookup', () => {
    expect(evaluateDmarc(absent)).toEqual({ ok: false, code: 'dmarc_missing' });
    expect(evaluateDmarc(found([['something else']]))).toEqual({ ok: false, code: 'dmarc_missing' });
    expect(evaluateDmarc(found([['v=DMARC1; p=none'], ['v=DMARC1; p=reject']]))).toEqual({ ok: false, code: 'dmarc_multiple' });
    expect(evaluateDmarc(failed)).toEqual({ ok: false, code: 'lookup_failed' });
  });
});

describe('DKIM selector', () => {
  it('is found as a CNAME, or as a TXT with a public key', () => {
    expect(evaluateDkim(found(['abc.dkim.amazonses.com']), absent)).toEqual({ ok: true, code: 'found' });
    expect(evaluateDkim(absent, found([[`v=DKIM1; k=rsa; p=${KEY}`]]))).toEqual({ ok: true, code: 'found' });
    expect(evaluateDkim(absent, found([['v=DKIM1; k=rsa; p=', KEY]]))).toEqual({ ok: true, code: 'found' });
  });
  it('is missing when neither exists, or when the key was revoked (empty p=)', () => {
    expect(evaluateDkim(absent, absent)).toEqual({ ok: false, code: 'dkim_missing' });
    expect(evaluateDkim(absent, found([['v=DKIM1; k=rsa; p=']]))).toEqual({ ok: false, code: 'dkim_missing' });
    expect(evaluateDkim(absent, found([['unrelated text']]))).toEqual({ ok: false, code: 'dkim_missing' });
  });
  it('is unknown, not missing and not found, when a lookup failed', () => {
    expect(evaluateDkim(failed, absent)).toEqual({ ok: false, code: 'lookup_failed' });
    expect(evaluateDkim(absent, failed)).toEqual({ ok: false, code: 'lookup_failed' });
    expect(evaluateDkim(found(['k.dkim.example']), failed)).toEqual({ ok: true, code: 'found' });
  });
});

describe('the whole check', () => {
  it('passes when SPF, every named DKIM selector and DMARC are found', async () => {
    const r = await checkDomain('shop.example', ['s1', 's2'], resolver(GOOD_TXT, { 's1._domainkey.shop.example': ['s1.dkim.amazonses.com'], 's2._domainkey.shop.example': ['s2.dkim.amazonses.com'] }));
    expect(r.passed).toBe(true);
    expect(r.reasons).toEqual([]);
    expect(r.dkim).toEqual([{ selector: 's1', ok: true, code: 'found' }, { selector: 's2', ok: true, code: 'found' }]);
    expect(r.dmarc.policy).toBe('none');
  });

  it('does not pass without named DKIM selectors, because a domain cannot be proven authenticated without a key', async () => {
    const r = await checkDomain('shop.example', [], resolver(GOOD_TXT));
    expect(r.passed).toBe(false);
    expect(r.reasons).toEqual(['dkim_selectors_not_set']);
  });

  it('fails when any one of them is missing, with each reason once and in a stable order', async () => {
    const r = await checkDomain('shop.example', ['s1', 's2'], resolver({}, { 's1._domainkey.shop.example': ['s1.dkim.example'] }));
    expect(r.passed).toBe(false);
    expect(r.reasons).toEqual(['spf_missing', 'dkim_missing', 'dmarc_missing']);
  });

  it('a timeout is a failure with its own code, never a pass', async () => {
    const r = await checkDomain('shop.example', ['s1'], resolver({ ...GOOD_TXT, '_dmarc.shop.example': 'timeout' }, { 's1._domainkey.shop.example': ['k.dkim.example'] }));
    expect(r.passed).toBe(false);
    expect(r.reasons).toEqual(['lookup_failed']);
    expect(r.dmarc).toEqual({ ok: false, code: 'lookup_failed' });
  });

  it('looks up exactly the names it should, and nothing else', async () => {
    const asked: string[] = [];
    const base = resolver(GOOD_TXT, { 's1._domainkey.shop.example': ['k.dkim.example'] });
    await checkDomain('shop.example', ['s1'], {
      resolveTxt: (n) => { asked.push(`TXT ${n}`); return base.resolveTxt(n); },
      resolveCname: (n) => { asked.push(`CNAME ${n}`); return base.resolveCname(n); },
    });
    expect(asked.sort()).toEqual(['CNAME s1._domainkey.shop.example', 'TXT _dmarc.shop.example', 'TXT s1._domainkey.shop.example', 'TXT shop.example']);
  });
});

describe('the domain of the From address', () => {
  it('is the lower-cased host after the last @', () => {
    expect(domainOfAddress('Info@Shop.Example')).toBe('shop.example');
    expect(domainOfAddress('  news@mail.shop.com.tr ')).toBe('mail.shop.com.tr');
  });
  it.each(['a@b', 'a@1.2.3.4', 'a@-x.example', 'a@x_y.example', 'no-at-sign', 'a@', 'a@müşteri.example', 'a@' + 'x'.repeat(64) + '.example', 42, null, undefined])(
    'is not usable for %s', (v) => { expect(domainOfAddress(v)).toBeNull(); });
});

describe('DKIM selector input', () => {
  it('lower-cases, trims and drops duplicates', () => {
    expect(parseSelectors([' S1 ', 's1', 'selector2', 's2._key'])).toEqual(['s1', 'selector2', 's2._key']);
    expect(parseSelectors([])).toEqual([]);
  });
  it.each([
    ['not a list', 's1'],
    ['an empty name', ['']],
    ['a space', ['s 1']],
    ['a leading dot', ['.s1']],
    ['a trailing dot', ['s1.']],
    ['a double dot', ['a..b']],
    ['a slash', ['s1/../x']],
    ['too long', ['x'.repeat(64)]],
    ['not text', [1]],
    ['more than five', ['a', 'b', 'c', 'd', 'e', 'f']],
  ])('refuses %s, naming the field', (_label, value) => {
    try { parseSelectors(value); expect.unreachable(); } catch (err) {
      expect(err).toBeInstanceOf(EmailDomainError);
      expect((err as InstanceType<typeof EmailDomainError>).issues[0]?.path).toBe('dkimSelectors');
    }
  });
});
