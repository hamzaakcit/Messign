/**
 * Dependency audit gate (WP-31): fails when a production dependency has a HIGH or CRITICAL advisory that nobody has looked at.
 *
 *   npm run security:audit
 *
 * Runs `npm audit --omit=dev --json` at the repository root (client and server together) and compares the advisories with
 * `docs/quality/audit-accepted.json`. An advisory is accepted with a reason and a review date; once the date has passed it
 * counts as unaccepted again, so an acceptance is never forever. Moderate and low advisories are reported, not gating.
 * Dev-only dependencies are outside the gate (they are not in what runs in production).
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { evaluateAudit, type AcceptedAdvisory } from './dependencyAuditCore.js';

const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();

function runAudit(): unknown {
  try {
    return JSON.parse(execFileSync('npm', ['audit', '--omit=dev', '--json'], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));
  } catch (err) {
    // npm audit exits 1 when it found vulnerabilities and still prints the report.
    const out = (err as { stdout?: string }).stdout;
    if (out) { try { return JSON.parse(out); } catch { /* fall through */ } }
    throw new Error('npm audit did not return a report (is the registry reachable?)');
  }
}

const accepted = (JSON.parse(readFileSync(join(root, 'docs/quality/audit-accepted.json'), 'utf8')) as { accepted: AcceptedAdvisory[] }).accepted;
const result = evaluateAudit(runAudit() as Parameters<typeof evaluateAudit>[0], accepted, new Date());

for (const a of result.unaccepted) console.log(`UNACCEPTED  ${a.severity}  ${a.package}  ${a.id}  ${a.title}`);
for (const a of result.expired) console.log(`EXPIRED     ${a.id}  accepted until ${a.reviewBy}: review it (${a.package})`);
for (const a of result.stale) console.log(`STALE       ${a.id}  no longer reported: remove it from docs/quality/audit-accepted.json`);
for (const a of result.acceptedSeen) console.log(`accepted    ${a.severity}  ${a.package}  ${a.id}  until ${a.reviewBy}`);
for (const a of result.nonGating) console.log(`not gating  ${a.severity}  ${a.package}  ${a.id}  ${a.title}`);
const bad = result.unaccepted.length + result.expired.length + result.stale.length;
console.log(`[audit] ${result.unaccepted.length} unaccepted, ${result.expired.length} expired, ${result.stale.length} stale, ${result.acceptedSeen.length} accepted, ${result.nonGating.length} moderate or low`);
process.exit(bad ? 1 : 0);
