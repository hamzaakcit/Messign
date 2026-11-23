/** The decision logic of the dependency audit gate, apart from running npm, so it can be tested with a handed-in report. */
export interface AcceptedAdvisory { id: string; package: string; reason: string; reviewBy: string }
interface AuditVia { source?: number; name?: string; title?: string; url?: string; severity?: string }
export interface AuditReport { vulnerabilities?: Record<string, { via?: Array<string | AuditVia> }> }
export interface Advisory { id: string; package: string; severity: string; title: string }

const GATING = new Set(['high', 'critical']);

/** Every advisory in the report (a package that only inherits one lists the package name in `via`, which is not an advisory). */
export function advisoriesOf(report: AuditReport): Advisory[] {
  const out = new Map<string, Advisory>();
  for (const v of Object.values(report.vulnerabilities ?? {})) {
    for (const via of v.via ?? []) {
      if (typeof via === 'string' || !via.url) continue;
      const id = via.url.split('/').pop() ?? via.url;
      out.set(id, { id, package: via.name ?? '?', severity: via.severity ?? 'unknown', title: via.title ?? '' });
    }
  }
  return [...out.values()].sort((a, b) => a.package.localeCompare(b.package) || a.id.localeCompare(b.id));
}

export function evaluateAudit(report: AuditReport, accepted: AcceptedAdvisory[], now: Date) {
  for (const a of accepted) {
    if (!/^GHSA-[a-z0-9-]+$/.test(a.id) || a.reason.trim().length < 20 || Number.isNaN(Date.parse(a.reviewBy))) {
      throw new Error(`audit-accepted.json: "${a.id}" needs a GHSA id, a reason of at least 20 characters and a reviewBy date`);
    }
  }
  const advisories = advisoriesOf(report);
  const byId = new Map(accepted.map((a) => [a.id, a]));
  const unaccepted: Advisory[] = [];
  const acceptedSeen: Array<Advisory & { reviewBy: string }> = [];
  const expired: AcceptedAdvisory[] = [];
  const nonGating: Advisory[] = [];
  for (const adv of advisories) {
    if (!GATING.has(adv.severity)) { nonGating.push(adv); continue; }
    const acc = byId.get(adv.id);
    if (!acc) { unaccepted.push(adv); continue; }
    if (Date.parse(acc.reviewBy) < now.getTime()) expired.push(acc);
    else acceptedSeen.push({ ...adv, reviewBy: acc.reviewBy });
  }
  const present = new Set(advisories.map((a) => a.id));
  const stale = accepted.filter((a) => !present.has(a.id));
  return { unaccepted, acceptedSeen, expired, stale, nonGating };
}
