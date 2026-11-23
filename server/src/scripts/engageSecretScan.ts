/**
 * Secret scan (WP-31): looks for credentials in the files git tracks, and with --history in every line ever committed.
 *
 *   npm run security:secrets                 files tracked right now (what CI runs on every push)
 *   npm run security:secrets -- --history    every added line of every commit on every branch
 *
 * Prints rule, place and a fingerprint, never the value. A false positive is accepted by adding its fingerprint, rule and a
 * reason to `.secretscan-allow.json` at the repository root. Exit code 1 when anything not accepted is found. A real find
 * means: rotate that credential first (a deleted commit is still in every clone and fork), then fix the repository.
 */
import { execFileSync, spawn } from 'node:child_process';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { isAllowed, scanText, type AllowEntry, type Finding } from './secretScan/rules.js';

const SKIP_PATH = /(^|\/)(package-lock\.json|node_modules\/|dist\/|\.git\/)|\.(png|jpe?g|gif|webp|avif|ico|pdf|woff2?|ttf|otf|mp4|mov|zip|gz|dump|lock)$/i;
const MAX_BYTES = 1_500_000;

const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
const allowFile = join(root, '.secretscan-allow.json');
const allow: AllowEntry[] = existsSync(allowFile) ? (JSON.parse(readFileSync(allowFile, 'utf8')) as { allow: AllowEntry[] }).allow : [];

for (const a of allow) {
  if (!a.fingerprint || !a.rule || !a.reason || a.reason.trim().length < 10) {
    console.error('.secretscan-allow.json: every entry needs a fingerprint, a rule and a reason of at least 10 characters');
    process.exit(2);
  }
}

function scanTracked(): Array<Finding & { file: string }> {
  const files = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).split('\0').filter(Boolean);
  const out: Array<Finding & { file: string }> = [];
  for (const file of files) {
    if (SKIP_PATH.test(file)) continue;
    const full = join(root, file);
    let size = 0;
    try { const st = statSync(full); if (!st.isFile()) continue; size = st.size; } catch { continue; } // deleted, or a directory (submodule)
    if (size > MAX_BYTES) continue;
    const buf = readFileSync(full);
    if (buf.includes(0)) continue; // binary
    for (const f of scanText(buf.toString('utf8'))) out.push({ ...f, file });
  }
  return out;
}

async function scanHistory(): Promise<Array<Finding & { file: string; commit: string }>> {
  const out: Array<Finding & { file: string; commit: string }> = [];
  const child = spawn('git', ['log', '--all', '-p', '-U0', '--no-color', '--no-ext-diff', '--format=commit %H'], { cwd: root });
  const rl = createInterface({ input: child.stdout });
  let commit = ''; let file = ''; let skip = false;
  for await (const line of rl) {
    if (line.startsWith('commit ')) { commit = line.slice(7, 19); continue; }
    if (line.startsWith('+++ ')) { file = line.slice(6); skip = SKIP_PATH.test(file) || line === '+++ /dev/null'; continue; }
    if (skip || !line.startsWith('+') || line.startsWith('+++')) continue;
    for (const f of scanText(line.slice(1))) out.push({ ...f, line: 0, file, commit });
  }
  await new Promise<void>((resolve) => child.on('close', () => resolve()));
  return out;
}

async function main(): Promise<void> {
  const history = process.argv.includes('--history');
  const raw = history ? await scanHistory() : scanTracked();
  // The same value in the same file counts once.
  const seen = new Set<string>();
  const findings = raw.filter((f) => !isAllowed(f, allow)).filter((f) => {
    const k = `${f.rule}|${f.fingerprint}|${f.file}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const accepted = raw.length - raw.filter((f) => !isAllowed(f, allow)).length;
  for (const f of findings) {
    const where = 'commit' in f ? `${f.file} (commit ${(f as { commit: string }).commit})` : `${f.file}:${f.line}`;
    console.log(`FOUND  ${f.rule}  ${where}  fingerprint ${f.fingerprint}`);
  }
  console.log(`[secrets] ${history ? 'history' : 'tracked files'}: ${findings.length} finding(s)${accepted ? `, ${accepted} accepted in .secretscan-allow.json` : ''}`);
  if (findings.length) process.exitCode = 1;
}

main().then(() => process.exit(process.exitCode ?? 0), (err) => { console.error('[secrets] scan failed:', err instanceof Error ? err.message : err); process.exit(2); });
