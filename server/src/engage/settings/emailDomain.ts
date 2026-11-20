import { promises as dnsPromises } from 'dns';
import { withEngageScheduler, withEngageTenant } from '../db.js';
import { logError, logInfo, logWarn } from '../log.js';
import { EMAIL_DOMAIN_ITEM } from '../messaging/gate.js';

/**
 * The email domain authentication check (WP-39, ADR-020). For the domain in the active email account's From address it
 * looks up, in DNS and read-only:
 *   - SPF: exactly one TXT record starting `v=spf1` at the domain;
 *   - DKIM: for each selector the admin names, a CNAME or a TXT with a public key at `<selector>._domainkey.<domain>`;
 *   - DMARC: exactly one TXT record starting `v=DMARC1` with a valid `p=` policy at `_dmarc.<domain>`.
 * A check passes only when all three are found. A passing check sets the readiness item `email_domain_authenticated`,
 * a failing one removes it, and the application refuses to record that item by hand, so the item always reflects the
 * last check. The check sends nothing, reads no record text into storage and logs the domain name and codes only.
 *
 * What it does not do: it does not prove the provider can send for the domain (that is the provider's own verification),
 * it does not follow SPF includes, and a From domain whose DMARC record lives only on its parent domain fails (no public
 * suffix list here); the admin can send from the parent domain instead.
 */

export interface DnsResolver {
  resolveTxt(name: string): Promise<string[][]>;
  resolveCname(name: string): Promise<string[]>;
}

function systemResolver(): DnsResolver {
  const r = new dnsPromises.Resolver({ timeout: 3000, tries: 1 });
  return { resolveTxt: (n) => r.resolveTxt(n), resolveCname: (n) => r.resolveCname(n) };
}

/** Tests replace the resolver; production uses the system's DNS servers. */
export const emailDomainDeps: { resolver: DnsResolver } = { resolver: systemResolver() };

const MIN_SECONDS_BETWEEN_CHECKS = 10;
/** After a pass the scheduler looks again after 23 hours (migration 132 uses the same numbers); after an inconclusive check, after 1. */
const RECHECK_AFTER_PASS_HOURS = 23;
const RECHECK_AFTER_INCONCLUSIVE_HOURS = 1;
const RECHECK_BATCH = 50;
const MAX_SELECTORS = 5;

const DOMAIN_RE = /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const SELECTOR_RE = /^[a-z0-9][a-z0-9._-]{0,62}$/;

export class EmailDomainError extends Error {
  constructor(public readonly status: 400 | 409 | 429, message: string, public readonly code: string, public readonly issues: Array<{ path: string; message: string }> = []) { super(message); }
}

type Lookup<T> = { kind: 'found'; value: T } | { kind: 'absent' } | { kind: 'error' };

async function lookup<T>(fn: () => Promise<T>): Promise<Lookup<T>> {
  try {
    return { kind: 'found', value: await fn() };
  } catch (err) {
    const code = (err as { code?: unknown } | null)?.code;
    // No such name, or no record of that type: the record is absent. Anything else (timeout, refused, server failure)
    // means we do not know, which must not read as "found" and must not read as "missing" either.
    return code === 'ENODATA' || code === 'ENOTFOUND' ? { kind: 'absent' } : { kind: 'error' };
  }
}

/** A TXT answer is a list of records, each a list of strings that belong together. */
const txtRecords = (l: Lookup<string[][]>): string[] => (l.kind === 'found' ? l.value.map((chunks) => chunks.join('').trim()) : []);

export interface Mechanism { ok: boolean; code: string }
export interface DomainCheckResult {
  domain: string;
  selectors: string[];
  spf: Mechanism;
  dkim: Array<Mechanism & { selector: string }>;
  dmarc: Mechanism & { policy?: string };
  passed: boolean;
  /** Distinct codes of everything that failed, in a stable order. */
  reasons: string[];
}

export function evaluateSpf(l: Lookup<string[][]>): Mechanism {
  if (l.kind === 'error') return { ok: false, code: 'lookup_failed' };
  const spf = txtRecords(l).filter((r) => /^v=spf1(\s|$)/i.test(r));
  if (spf.length === 0) return { ok: false, code: 'spf_missing' };
  if (spf.length > 1) return { ok: false, code: 'spf_multiple' };
  return { ok: true, code: 'found' };
}

export function evaluateDmarc(l: Lookup<string[][]>): Mechanism & { policy?: string } {
  if (l.kind === 'error') return { ok: false, code: 'lookup_failed' };
  const dmarc = txtRecords(l).filter((r) => /^v=DMARC1\s*(;|$)/i.test(r));
  if (dmarc.length === 0) return { ok: false, code: 'dmarc_missing' };
  if (dmarc.length > 1) return { ok: false, code: 'dmarc_multiple' };
  const tags = dmarc[0]!.split(';').map((t) => t.trim()).filter(Boolean);
  const policy = tags.map((t) => /^p\s*=\s*(none|quarantine|reject)$/i.exec(t)?.[1]?.toLowerCase()).find(Boolean);
  return policy ? { ok: true, code: 'found', policy } : { ok: false, code: 'dmarc_invalid' };
}

/** A DKIM selector is published as a CNAME (providers that host the key) or as a TXT with a non-empty public key. */
export function evaluateDkim(cname: Lookup<string[]>, txt: Lookup<string[][]>): Mechanism {
  if (cname.kind === 'found' && cname.value.length > 0) return { ok: true, code: 'found' };
  if (txtRecords(txt).some((r) => /(^|;)\s*p\s*=\s*[A-Za-z0-9+/=]{8,}/.test(r))) return { ok: true, code: 'found' };
  return cname.kind === 'error' || txt.kind === 'error' ? { ok: false, code: 'lookup_failed' } : { ok: false, code: 'dkim_missing' };
}

export async function checkDomain(domain: string, selectors: string[], resolver: DnsResolver): Promise<DomainCheckResult> {
  const [spfTxt, dmarcTxt, dkimLookups] = await Promise.all([
    lookup(() => resolver.resolveTxt(domain)),
    lookup(() => resolver.resolveTxt(`_dmarc.${domain}`)),
    Promise.all(selectors.map(async (s) => {
      const name = `${s}._domainkey.${domain}`;
      const [cname, txt] = await Promise.all([lookup(() => resolver.resolveCname(name)), lookup(() => resolver.resolveTxt(name))]);
      return { s, cname, txt };
    })),
  ]);
  const spf = evaluateSpf(spfTxt);
  const dmarc = evaluateDmarc(dmarcTxt);
  const dkim = dkimLookups.map((d) => ({ selector: d.s, ...evaluateDkim(d.cname, d.txt) }));
  const reasons: string[] = [];
  const add = (code: string) => { if (!reasons.includes(code)) reasons.push(code); };
  if (!spf.ok) add(spf.code);
  if (dkim.length === 0) add('dkim_selectors_not_set');
  for (const d of dkim) if (!d.ok) add(d.code);
  if (!dmarc.ok) add(dmarc.code);
  return { domain, selectors, spf, dkim, dmarc, passed: reasons.length === 0, reasons };
}

/** The domain of an address, lower-cased, or null when it is not a plain registrable-looking host name. */
export function domainOfAddress(address: unknown): string | null {
  if (typeof address !== 'string') return null;
  const at = address.trim().lastIndexOf('@');
  const domain = at < 0 ? '' : address.trim().slice(at + 1).toLowerCase();
  return domain.length <= 253 && DOMAIN_RE.test(domain) ? domain : null;
}

/** 1 to 5 selectors, lower-cased and de-duplicated. Anything else is refused with the field named. */
export function parseSelectors(raw: unknown): string[] {
  if (!Array.isArray(raw) || raw.length > MAX_SELECTORS * 4) throw new EmailDomainError(400, 'The DKIM selectors are not valid', 'invalid', [{ path: 'dkimSelectors', message: `must be a list of up to ${MAX_SELECTORS} selector names` }]);
  const out: string[] = [];
  for (const item of raw) {
    const s = typeof item === 'string' ? item.trim().toLowerCase() : '';
    if (!SELECTOR_RE.test(s) || s.includes('..') || s.endsWith('.') || s.endsWith('-')) {
      throw new EmailDomainError(400, 'The DKIM selectors are not valid', 'invalid', [{ path: 'dkimSelectors', message: 'each selector is letters, digits, dots, hyphens or underscores (for example s1 or selector1)' }]);
    }
    if (!out.includes(s)) out.push(s);
  }
  if (out.length > MAX_SELECTORS) throw new EmailDomainError(400, 'The DKIM selectors are not valid', 'invalid', [{ path: 'dkimSelectors', message: `at most ${MAX_SELECTORS} selectors` }]);
  return out;
}

export interface EmailDomainCheckView {
  id: string; domain: string; dkimSelectors: string[]; spf: Mechanism; dkim: DomainCheckResult['dkim']; dmarc: DomainCheckResult['dmarc'];
  passed: boolean; checkedAt: string;
  /** True when the scheduled re-check made it, not an admin. */
  automatic: boolean;
}
export interface EmailDomainView {
  /** The one active email account. The domain is the part after the @ of its From address; null when that is not usable. */
  account: { id: string; label: string; domain: string | null } | null;
  /** Why there is no single account to check, when there is not. */
  accountProblem: 'no_email_account' | 'email_account_ambiguous' | null;
  lastCheck: EmailDomainCheckView | null;
}

type Tx = Parameters<Parameters<typeof withEngageTenant>[1]>[0];
const iso = (v: unknown): string => new Date(v as string).toISOString();

interface CheckRow { id: string; domain: string; dkim_selectors: string[]; spf: Mechanism; dkim: DomainCheckResult['dkim']; dmarc: DomainCheckResult['dmarc']; passed: boolean; checked_at: Date; checked_by: string | null }
const toView = (r: CheckRow): EmailDomainCheckView => ({
  id: r.id, domain: r.domain, dkimSelectors: r.dkim_selectors, spf: r.spf, dkim: r.dkim, dmarc: r.dmarc, passed: r.passed, checkedAt: iso(r.checked_at), automatic: r.checked_by === null,
});

async function activeAccounts(c: Tx, orgId: string): Promise<Array<{ id: string; label: string; config: Record<string, unknown> }>> {
  return (await c.query<{ id: string; label: string; config: Record<string, unknown> }>(
    `SELECT id, label, config FROM engage.channel_accounts WHERE organization_id = $1 AND channel = 'email' AND status = 'active' ORDER BY created_at LIMIT 2`, [orgId])).rows;
}

async function lastCheckOn(c: Tx, orgId: string): Promise<CheckRow | undefined> {
  return (await c.query<CheckRow>(
    `SELECT id, domain, dkim_selectors, spf, dkim, dmarc, passed, checked_at, checked_by FROM engage.email_domain_checks
      WHERE organization_id = $1 ORDER BY checked_at DESC, id DESC LIMIT 1`, [orgId])).rows[0];
}

function viewOf(accounts: Awaited<ReturnType<typeof activeAccounts>>, last: CheckRow | undefined): EmailDomainView {
  const one = accounts.length === 1 ? accounts[0]! : null;
  return {
    account: one ? { id: one.id, label: one.label, domain: domainOfAddress(one.config.from_address) } : null,
    accountProblem: accounts.length === 0 ? 'no_email_account' : accounts.length > 1 ? 'email_account_ambiguous' : null,
    lastCheck: last ? toView(last) : null,
  };
}

export async function getEmailDomain(orgId: string): Promise<EmailDomainView> {
  return withEngageTenant(orgId, async (c) => viewOf(await activeAccounts(c, orgId), await lastCheckOn(c, orgId)));
}

const ONLY_LOOKUP_FAILED = (reasons: string[]): boolean => reasons.length > 0 && reasons.every((r) => r === 'lookup_failed');

/**
 * Appends the evidence row and sets or clears the readiness item, inside the caller's tenant transaction. A pass sets
 * the item. A failure clears it, except for the scheduled re-check when nothing but `lookup_failed` went wrong: a
 * resolver that timed out says nothing about the records, so it must not switch a tenant's sending off.
 * Returns what happened to the item.
 */
async function recordCheck(c: Tx, orgId: string, accountId: string, result: DomainCheckResult, userId: string | null, inconclusiveKeepsItem: boolean): Promise<'passed' | 'failed' | 'inconclusive'> {
  await c.query(
    `INSERT INTO engage.email_domain_checks (organization_id, channel_account_id, domain, dkim_selectors, spf, dkim, dmarc, passed, checked_by)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8, $9)`,
    [orgId, accountId, result.domain, result.selectors, JSON.stringify(result.spf), JSON.stringify(result.dkim), JSON.stringify(result.dmarc), result.passed, userId]);
  if (result.passed) {
    await c.query(
      `INSERT INTO engage.tenant_readiness (organization_id, channel, item, value, evidence_url, recorded_by)
       VALUES ($1, 'email', $2, $3, NULL, $4)
       ON CONFLICT (organization_id, channel, item) DO UPDATE SET value = EXCLUDED.value, evidence_url = NULL,
         recorded_by = EXCLUDED.recorded_by, recorded_at = now()`,
      [orgId, EMAIL_DOMAIN_ITEM, `checked by DNS: SPF, DKIM and DMARC found for ${result.domain}`, userId]);
    return 'passed';
  }
  if (inconclusiveKeepsItem && ONLY_LOOKUP_FAILED(result.reasons)) return 'inconclusive';
  await c.query(`DELETE FROM engage.tenant_readiness WHERE organization_id = $1 AND channel = 'email' AND item = $2`, [orgId, EMAIL_DOMAIN_ITEM]);
  return 'failed';
}

/**
 * Runs the check for the tenant's one active email account and records the result and the readiness item. The DNS
 * lookups happen outside any database transaction, so a slow resolver never holds a connection. Selectors are the ones
 * given, or the ones of the last check when none are given.
 */
export async function runEmailDomainCheck(orgId: string, userId: string, input: { dkimSelectors?: unknown }): Promise<EmailDomainView> {
  const requested = input.dkimSelectors === undefined ? null : parseSelectors(input.dkimSelectors);

  const before = await withEngageTenant(orgId, async (c) => {
    const accounts = await activeAccounts(c, orgId);
    if (accounts.length === 0) throw new EmailDomainError(409, 'No email sending account is set up.', 'no_email_account');
    if (accounts.length > 1) throw new EmailDomainError(409, 'More than one email sending account is active; keep exactly one.', 'email_account_ambiguous');
    const account = accounts[0]!;
    const domain = domainOfAddress(account.config.from_address);
    if (!domain) throw new EmailDomainError(409, 'The email account\'s From address has no usable domain.', 'domain_invalid');
    const last = await lastCheckOn(c, orgId);
    if (last && Date.now() - new Date(last.checked_at).getTime() < MIN_SECONDS_BETWEEN_CHECKS * 1000) {
      throw new EmailDomainError(429, `Wait ${MIN_SECONDS_BETWEEN_CHECKS} seconds between checks.`, 'too_soon');
    }
    return { accountId: account.id, domain, selectors: requested ?? last?.dkim_selectors ?? [] };
  });

  const result = await checkDomain(before.domain, before.selectors, emailDomainDeps.resolver);

  await withEngageTenant(orgId, async (c) => {
    // The account may have been replaced while the lookups ran; a result for a different account is not recorded.
    const accounts = await activeAccounts(c, orgId);
    if (accounts.length !== 1 || accounts[0]!.id !== before.accountId) throw new EmailDomainError(409, 'The email account changed during the check; run it again.', 'account_changed');
    await recordCheck(c, orgId, before.accountId, result, userId, false);
  });

  logInfo('engage email domain checked', { organizationId: orgId, userId, domain: result.domain, passed: result.passed, reasons: result.reasons.join(',') });
  return getEmailDomain(orgId);
}

export type RecheckOutcome = 'passed' | 'failed' | 'inconclusive' | 'no_account' | 'skipped';

/**
 * The scheduled re-check (ADR-020): looks again at a tenant whose readiness item is set, using the selectors and the
 * account's current From domain, and renews or clears the item like an admin's check would, with `checked_by` empty.
 * Differences from the admin's check: no throttle (the work list only offers a tenant that is due, and this re-verifies
 * that); a DNS lookup that failed keeps the item and is tried again within the hour; and an account that is gone, doubled
 * or without a usable domain clears the item, because the item described an account that no longer sends.
 */
export async function recheckEmailDomain(orgId: string): Promise<RecheckOutcome> {
  const before = await withEngageTenant(orgId, async (c) => {
    const held = (await c.query(`SELECT 1 FROM engage.tenant_readiness WHERE organization_id = $1 AND channel = 'email' AND item = $2`, [orgId, EMAIL_DOMAIN_ITEM])).rows.length > 0;
    const last = await lastCheckOn(c, orgId);
    // Nothing to protect, nothing to repeat, or another run already did this tenant.
    if (!held || !last || Date.now() - new Date(last.checked_at).getTime() < (last.passed ? RECHECK_AFTER_PASS_HOURS : RECHECK_AFTER_INCONCLUSIVE_HOURS) * 3_600_000) return { kind: 'skipped' as const };
    const accounts = await activeAccounts(c, orgId);
    const one = accounts.length === 1 ? accounts[0]! : null;
    const domain = one ? domainOfAddress(one.config.from_address) : null;
    if (!one || !domain) {
      await c.query(`DELETE FROM engage.tenant_readiness WHERE organization_id = $1 AND channel = 'email' AND item = $2`, [orgId, EMAIL_DOMAIN_ITEM]);
      return { kind: 'no_account' as const };
    }
    return { kind: 'check' as const, accountId: one.id, domain, selectors: last.dkim_selectors };
  });
  if (before.kind === 'skipped') return 'skipped';
  if (before.kind === 'no_account') {
    logWarn('engage email domain re-check: no usable email account, readiness item cleared', { organizationId: orgId });
    return 'no_account';
  }

  const result = await checkDomain(before.domain, before.selectors, emailDomainDeps.resolver);

  const outcome = await withEngageTenant(orgId, async (c) => {
    const accounts = await activeAccounts(c, orgId);
    if (accounts.length !== 1 || accounts[0]!.id !== before.accountId) return 'skipped' as const; // replaced meanwhile: the next run looks at the new one
    return recordCheck(c, orgId, before.accountId, result, null, true);
  });
  const fields = { organizationId: orgId, domain: result.domain, outcome, reasons: result.reasons.join(',') };
  if (outcome === 'failed' || outcome === 'inconclusive') logWarn('engage email domain re-check did not pass', fields);
  else logInfo('engage email domain re-checked', fields);
  return outcome;
}

export interface RecheckSummary { due: number; passed: number; failed: number; inconclusive: number; no_account: number; skipped: number; error: number }

/** One scheduled run: re-checks up to `limit` due tenants, one after another, each in its own transactions. */
export async function recheckDueEmailDomains(opts: { limit?: number; onlyOrganizations?: string[] } = {}): Promise<RecheckSummary> {
  const orgs = (await withEngageScheduler((c) => c.query<{ organization_id: string }>(
    'SELECT organization_id FROM engage.email_domain_recheck_work($1, $2::uuid[])', [opts.limit ?? RECHECK_BATCH, opts.onlyOrganizations ?? null]))).rows;
  const tally: RecheckSummary = { due: orgs.length, passed: 0, failed: 0, inconclusive: 0, no_account: 0, skipped: 0, error: 0 };
  for (const o of orgs) {
    try { tally[await recheckEmailDomain(o.organization_id)]++; } catch (err) {
      tally.error++;
      logError('engage email domain re-check error', { organizationId: o.organization_id, name: err instanceof Error ? err.name : 'error' });
    }
  }
  return tally;
}
