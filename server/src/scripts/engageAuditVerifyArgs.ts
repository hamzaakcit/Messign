/** Argument parsing for `npm run engage:audit-verify` (kept apart from the script so it can be tested without a database or .env). */
import type { AuditChainStatus } from '../engage/audit.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const VERIFY_USAGE = `Usage:
  npm run engage:audit-verify -- --all
  npm run engage:audit-verify -- --org <uuid> [--expect-head-seq <n> --expect-head-hash <64 hex>]`;

export interface VerifyArgs { all: boolean; org?: string; expectSeq?: number; expectHash?: string }

export function parseVerifyArgs(argv: string[]): VerifyArgs {
  const out: VerifyArgs = { all: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    const v = argv[i + 1];
    if (a === '--all') { out.all = true; continue; }
    if (!['--org', '--expect-head-seq', '--expect-head-hash'].includes(a)) throw new Error(`Unexpected argument "${a}"\n${VERIFY_USAGE}`);
    if (v === undefined || v.startsWith('--')) throw new Error(`${a} needs a value`);
    i++;
    if (a === '--org') { if (!UUID_RE.test(v)) throw new Error('--org must be a UUID'); out.org = v; }
    if (a === '--expect-head-seq') { if (!/^[1-9]\d{0,15}$/.test(v)) throw new Error('--expect-head-seq must be a positive whole number'); out.expectSeq = Number(v); }
    if (a === '--expect-head-hash') { if (!/^[0-9a-f]{64}$/.test(v)) throw new Error('--expect-head-hash must be 64 lowercase hex characters'); out.expectHash = v; }
  }
  if (out.all === (out.org !== undefined)) throw new Error(`Give exactly one of --all and --org\n${VERIFY_USAGE}`);
  if ((out.expectSeq !== undefined || out.expectHash !== undefined) && (out.org === undefined || out.expectSeq === undefined || out.expectHash === undefined)) {
    throw new Error('--expect-head-seq and --expect-head-hash go together, with --org');
  }
  return out;
}

/** True when the remembered head is still part of the chain unchanged. A chain that has grown since is fine; a shorter one is not. */
export function headStillHolds(status: AuditChainStatus, expectSeq: number, expectHash: string, hashAt: (seq: number) => Promise<string | null>): Promise<boolean> {
  if (status.headSeq === null || status.headSeq < expectSeq) return Promise.resolve(false);
  return hashAt(expectSeq).then((h) => h === expectHash);
}

