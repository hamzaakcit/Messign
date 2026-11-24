import { createHash } from 'crypto';
import type { ProviderEvent, ProviderEventType, RawWebhook } from './adapter.js';
import { MOCK_SIGNATURE_HEADER, signMockPayload } from './mockAdapter.js';

/**
 * Delivery-report simulator (WP-10). Produces the reports a real provider would eventually send for messages already
 * handed to the mock adapter, including the awkward ones: reports out of order, the same report twice, and reports
 * that never come. Deterministic for a given seed, so a failing run can be replayed.
 */

export type SimulatedOutcome = 'delivered' | 'failed' | 'bounced' | 'silent';

export interface SimulatorOptions {
  seed?: number;
  /** Relative weights of the final outcome per message. Default: all delivered. */
  weights?: Partial<Record<SimulatedOutcome, number>>;
  /** Chance that any one report is sent a second time (same provider event id). Default 0. */
  duplicateRate?: number;
  /** Shuffle the whole batch (so a "delivered" may arrive before its "sent"). Default false. */
  shuffle?: boolean;
  now?: Date;
}

export interface SimulatedBatch {
  events: ProviderEvent[];
  /** What each message must end up as, whatever order the events arrive in. */
  expected: Map<string, 'sent' | 'delivered' | 'failed' | 'bounced'>;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const eventId = (providerMessageId: string, type: string) => `evt_${createHash('sha256').update(`${providerMessageId}\n${type}`).digest('hex').slice(0, 20)}`;

export function simulateReports(providerMessageIds: string[], opts: SimulatorOptions = {}): SimulatedBatch {
  const rnd = mulberry32(opts.seed ?? 1);
  const w = { delivered: 1, failed: 0, bounced: 0, silent: 0, ...opts.weights };
  const total = w.delivered + w.failed + w.bounced + w.silent;
  if (!(total > 0)) throw new Error('simulator weights must not all be zero');
  const base = (opts.now ?? new Date()).getTime();
  const events: ProviderEvent[] = [];
  const expected = new Map<string, 'sent' | 'delivered' | 'failed' | 'bounced'>();

  providerMessageIds.forEach((pid, i) => {
    let pick = rnd() * total;
    let outcome: SimulatedOutcome = 'delivered';
    for (const k of ['delivered', 'failed', 'bounced', 'silent'] as const) { if (pick < w[k]) { outcome = k; break; } pick -= w[k]; }
    const at = base + i;
    const mk = (type: ProviderEventType, offset: number, errorCode?: string): ProviderEvent =>
      ({ providerMessageId: pid, providerEventId: eventId(pid, type), type, occurredAt: new Date(at + offset), errorCode });
    events.push(mk('sent', 0));
    if (outcome === 'silent') { expected.set(pid, 'sent'); return; }
    events.push(mk(outcome, 1000, outcome === 'delivered' ? undefined : outcome === 'failed' ? 'sim_rejected' : 'sim_hard_bounce'));
    expected.set(pid, outcome);
  });

  const withDuplicates = [...events];
  for (const e of events) if (rnd() < (opts.duplicateRate ?? 0)) withDuplicates.push({ ...e });
  if (opts.shuffle) {
    for (let i = withDuplicates.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [withDuplicates[i], withDuplicates[j]] = [withDuplicates[j]!, withDuplicates[i]!];
    }
  }
  return { events: withDuplicates, expected };
}

/** Wraps reports as the mock provider's signed webhook delivery. */
export function signedMockWebhook(secret: string, events: ProviderEvent[]): RawWebhook {
  const body = Buffer.from(JSON.stringify({
    events: events.map((e) => ({
      provider_message_id: e.providerMessageId, event_id: e.providerEventId, type: e.type, occurred_at: e.occurredAt.toISOString(),
      ...(e.errorCode ? { error_code: e.errorCode } : {}),
    })),
  }));
  return { headers: { [MOCK_SIGNATURE_HEADER]: signMockPayload(secret, body) }, body };
}
