import { createHash } from 'crypto';
import { describeError, logError, setErrorSink } from '../log.js';
import { redactString } from '../redact.js';

/**
 * Error tracking for the engage server (WP-29, ADR-024), without a third-party service: an error caught in a job or a request is
 * grouped by what it is (source, kind, message with ids and numbers taken out), counted, logged once at 1, 10, 100… and offered
 * to the ops check, which tells the operators the first time a group appears and again when it bursts. Nothing but the
 * redacted description is kept: no stack, no request, no data. The groups live in this process; the history is the log.
 */

export interface ErrorGroup {
  fingerprint: string; source: string; description: string;
  count: number; firstSeen: Date; lastSeen: Date;
  notifiedAt: Date | null; burstNotifiedAt: Date | null; recent: number[];
}

const MAX_GROUPS = 200;
const BURST_WINDOW_MS = 10 * 60_000;
const BURST_COUNT = 20;
const BURST_REPEAT_MS = 60 * 60_000;
const groups = new Map<string, ErrorGroup>();
// True while this module logs or records, so the line it logs is not itself tracked.
let inSink = false;

const normalise = (text: string): string => redactString(text)
  .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<id>').replace(/\d+/g, '<n>').slice(0, 160);

/** Records one error. Never throws and never logs more than the redacted description. Returns the group's fingerprint. */
export function captureError(source: string, err: unknown, now: Date = new Date()): string {
  return record(source, describeError(err), now);
}

function record(source: string, description: string, now: Date): string {
  const fingerprint = createHash('sha256').update(`${source}|${normalise(description)}`).digest('hex').slice(0, 12);
  let g = groups.get(fingerprint);
  if (!g) {
    if (groups.size >= MAX_GROUPS) { const oldest = [...groups.values()].sort((a, b) => a.lastSeen.getTime() - b.lastSeen.getTime())[0]; if (oldest) groups.delete(oldest.fingerprint); }
    g = { fingerprint, source, description, count: 0, firstSeen: now, lastSeen: now, notifiedAt: null, burstNotifiedAt: null, recent: [] };
    groups.set(fingerprint, g);
  }
  g.count++;
  g.lastSeen = now;
  g.recent.push(now.getTime());
  if (g.recent.length > BURST_COUNT * 2) g.recent.splice(0, g.recent.length - BURST_COUNT * 2);
  if (g.count === 1 || [10, 100, 1000, 10000].includes(g.count)) {
    const was = inSink;
    inSink = true;
    try { logError('error captured', { source, fingerprint, count: g.count, description }); } finally { inSink = was; }
  }
  return fingerprint;
}

// Everything engage code logs as an error is tracked too: a request that failed, a webhook that could not be processed. The
// sink takes the message and, where the log line carries one, the error's redacted description.
setErrorSink((message, fields) => {
  if (inSink) return; // recording logs a line of its own at the milestones
  inSink = true;
  try {
    const f = (fields ?? {}) as { detail?: unknown; error?: unknown; description?: unknown; name?: unknown };
    const pickText = (...v: unknown[]): string => (v.find((x) => typeof x === 'string' && x !== '') as string | undefined) ?? '';
    const detail = pickText(f.detail, f.description, f.error, f.name);
    record('log', detail ? `${message}: ${detail}` : message, new Date());
  } finally { inSink = false; }
});

export type ErrorNotice = { kind: 'new' | 'burst'; group: ErrorGroup };

/** The groups the operators have not been told about: new ones, and ones that repeat fast (at most hourly). Marks them told. */
export function drainErrorNotices(now: Date = new Date()): ErrorNotice[] {
  const out: ErrorNotice[] = [];
  for (const g of groups.values()) {
    const inWindow = g.recent.filter((t) => now.getTime() - t <= BURST_WINDOW_MS).length;
    if (g.notifiedAt === null) { g.notifiedAt = now; out.push({ kind: 'new', group: { ...g } }); continue; }
    if (inWindow >= BURST_COUNT && (g.burstNotifiedAt === null || now.getTime() - g.burstNotifiedAt.getTime() >= BURST_REPEAT_MS)) {
      g.burstNotifiedAt = now; out.push({ kind: 'burst', group: { ...g } });
    }
  }
  return out;
}

export const errorGroups = (): ErrorGroup[] => [...groups.values()].sort((a, b) => b.lastSeen.getTime() - a.lastSeen.getTime());
export const resetErrorGroups = (): void => { groups.clear(); };

/** Wraps a job handler so that what it throws is captured, then thrown on (pg-boss still retries and records the failure). */
export function tracked<A extends unknown[], R>(source: string, fn: (...args: A) => Promise<R>): (...args: A) => Promise<R> {
  return async (...args: A) => {
    try { return await fn(...args); } catch (err) { captureError(source, err); throw err; }
  };
}
