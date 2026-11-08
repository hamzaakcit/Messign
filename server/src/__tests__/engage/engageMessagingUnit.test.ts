import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'fs';
import { dirname, join, relative } from 'path';
import { fileURLToPath } from 'url';
import { AdapterError, WebhookSignatureError } from '../../engage/messaging/adapter.js';
import { currentSendMode } from '../../engage/messaging/dispatch.js';
import { requestHash } from '../../engage/messaging/messages.js';
import { simulateReports, signedMockWebhook } from '../../engage/messaging/dlrSimulator.js';
import { MOCK_SIGNATURE_HEADER, mockAdapter, mockProviderMessageId, signMockPayload } from '../../engage/messaging/mockAdapter.js';

const ENGAGE = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'engage');
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? sources(p) : p.endsWith('.ts') ? [p] : [];
  });
}

describe('send boundary', () => {
  it('only dispatch.ts calls an adapter send(), and only the messaging module resolves adapters', () => {
    const callers: string[] = [];
    const resolvers: string[] = [];
    for (const f of sources(ENGAGE)) {
      const rel = relative(ENGAGE, f).replace(/\\/g, '/');
      const text = readFileSync(f, 'utf8');
      if (/\badapter\.send\s*\(/.test(text)) callers.push(rel);
      if (/\bgetAdapter\s*\(/.test(text) && rel !== 'messaging/adapter.ts') resolvers.push(rel);
    }
    expect(callers).toEqual(['messaging/dispatch.ts']);
    expect(resolvers.sort()).toEqual(['messaging/dispatch.ts', 'messaging/index.ts', 'messaging/messages.ts']);
  });

  it('keeps vendor names out of the core (adapters are looked up by the account provider)', () => {
    const core = ['adapter.ts', 'messages.ts', 'dispatch.ts', 'dlrSimulator.ts'].map((n) => readFileSync(join(ENGAGE, 'messaging', n), 'utf8')).join('\n');
    expect(core).not.toMatch(/\b(twilio|sendgrid|amazon|mailgun|postmark|alaris|netgsm|infobip)\b/i);
  });
});

describe('SEND_MODE', () => {
  it.each([[undefined, 'off'], ['', 'off'], ['off', 'off'], ['OFF', 'off'], ['true', 'off'], ['Live', 'off'], [' live', 'off'], ['sandbox', 'sandbox'], ['live', 'live']])(
    '%j is %s', (v, expected) => {
      expect(currentSendMode(v === undefined ? {} : { SEND_MODE: v })).toBe(expected);
    });
});

describe('request hash', () => {
  const base = { profileId: 'p', channel: 'email' as const, purpose: 'marketing' as const, channelAccountId: 'a', idempotencyKey: 'k', content: { subject: 's', nested: { x: 1, y: [1, 2] } } };
  it('ignores key order and the idempotency key itself', () => {
    expect(requestHash({ ...base, idempotencyKey: 'other', content: { nested: { y: [1, 2], x: 1 }, subject: 's' } })).toBe(requestHash(base));
  });
  it.each([
    ['profile', { profileId: 'q' }], ['channel', { channel: 'sms' as const }], ['purpose', { purpose: 'transactional' as const }],
    ['account', { channelAccountId: 'b' }], ['content', { content: { subject: 't', nested: { x: 1, y: [1, 2] } } }],
    ['array order', { content: { subject: 's', nested: { x: 1, y: [2, 1] } } }],
  ])('changes with the %s', (_n, over) => {
    expect(requestHash({ ...base, ...over })).not.toBe(requestHash(base));
  });
});

describe('mock adapter', () => {
  const account = (over: Record<string, unknown> = {}, secrets: Record<string, string> = { webhook_secret: 'whsec_x' }) =>
    ({ id: 'acct-1', channel: 'email' as const, provider: 'mock', mode: 'test' as const, config: over as Record<string, string | number | boolean>, secrets });
  const req = { idempotencyKey: 'k1', channel: 'email' as const, to: 'a@example.com', content: {} };

  it('derives the provider id from account and key, so a repeat returns the same id', async () => {
    const one = await mockAdapter.send(req, account());
    const two = await mockAdapter.send(req, account());
    expect(one.providerMessageId).toBe(two.providerMessageId);
    expect(one.providerMessageId).toBe(mockProviderMessageId('acct-1', 'k1'));
    expect(mockProviderMessageId('acct-2', 'k1')).not.toBe(one.providerMessageId);
    expect(mockProviderMessageId('acct-1', 'k2')).not.toBe(one.providerMessageId);
  });

  it('refuses a live-mode account', async () => {
    await expect(mockAdapter.send(req, { ...account(), mode: 'live' })).rejects.toThrow(AdapterError);
  });

  it('verifies signatures over the raw bytes in constant-time form, and rejects every malformed variant', () => {
    const w = signedMockWebhook('whsec_x', simulateReports(['mock_a']).events);
    expect(mockAdapter.parseWebhook(w, account())).toHaveLength(2);
    const bad = (headers: Record<string, string | undefined>, body = w.body, secrets?: Record<string, string>) =>
      () => mockAdapter.parseWebhook({ headers, body }, account({}, secrets));
    expect(bad({})).toThrow(WebhookSignatureError);
    expect(bad({ [MOCK_SIGNATURE_HEADER]: 'abc' })).toThrow(WebhookSignatureError);
    expect(bad({ [MOCK_SIGNATURE_HEADER]: 'g'.repeat(64) })).toThrow(WebhookSignatureError);
    expect(bad({ [MOCK_SIGNATURE_HEADER]: signMockPayload('whsec_wrong', w.body) })).toThrow(WebhookSignatureError);
    expect(bad(w.headers, Buffer.concat([w.body, Buffer.from(' ')]))).toThrow(WebhookSignatureError);
    expect(bad(w.headers, w.body, {})).toThrow(WebhookSignatureError); // an account with no webhook secret accepts nothing
    expect(bad(w.headers, w.body, { webhook_secret: '' })).toThrow(WebhookSignatureError);
  });

  it('refuses a signed report of a type a provider cannot send', () => {
    const body = Buffer.from(JSON.stringify({ events: [{ provider_message_id: 'x', event_id: 'e', type: 'queued', occurred_at: new Date().toISOString() }] }));
    const raw = { headers: { [MOCK_SIGNATURE_HEADER]: signMockPayload('whsec_x', body) }, body };
    expect(() => mockAdapter.parseWebhook(raw, account())).toThrow(/malformed_webhook/);
  });

  it('classifies errors', () => {
    expect(mockAdapter.normalizeError(new AdapterError('permanent', 'x'))).toEqual({ kind: 'permanent', code: 'x' });
    expect(mockAdapter.normalizeError(new Error('boom: a@example.com'))).toEqual({ kind: 'transient', code: 'unknown_error' });
  });
});

describe('delivery-report simulator', () => {
  const ids = Array.from({ length: 200 }, (_, i) => `mock_${i}`);

  it('is deterministic for a seed and differs between seeds', () => {
    const o = { now: new Date('2026-01-01T00:00:00Z'), seed: 5, shuffle: true, duplicateRate: 0.3, weights: { delivered: 2, failed: 1, bounced: 1, silent: 1 } };
    expect(simulateReports(ids, o).events).toEqual(simulateReports(ids, o).events);
    expect(simulateReports(ids, { ...o, seed: 6 }).events).not.toEqual(simulateReports(ids, o).events);
  });

  it('produces every outcome in the requested proportions', () => {
    const { expected } = simulateReports(ids, { seed: 3, weights: { delivered: 5, failed: 2, bounced: 2, silent: 1 } });
    const n = (k: string) => [...expected.values()].filter((v) => v === k).length;
    expect(n('delivered')).toBeGreaterThan(70);
    expect(n('failed')).toBeGreaterThan(20);
    expect(n('bounced')).toBeGreaterThan(20);
    expect(n('sent')).toBeGreaterThan(5); // silent: no final report ever arrives
    expect(n('delivered') + n('failed') + n('bounced') + n('sent')).toBe(200);
  });

  it('really reorders and duplicates when asked, and not otherwise', () => {
    const plain = simulateReports(ids, { seed: 1 }).events;
    expect(plain).toHaveLength(400);
    expect(plain.findIndex((e) => e.type === 'delivered')).toBeGreaterThan(plain.findIndex((e) => e.type === 'sent'));
    const messy = simulateReports(ids, { seed: 1, shuffle: true, duplicateRate: 0.5 }).events;
    expect(messy.length).toBeGreaterThan(500);
    expect(new Set(messy.map((e) => e.providerEventId)).size).toBe(400);
    const outOfOrder = ids.filter((id) => {
      const mine = messy.filter((e) => e.providerMessageId === id);
      return mine.findIndex((e) => e.type === 'delivered') !== -1 && mine.findIndex((e) => e.type === 'delivered') < mine.findIndex((e) => e.type === 'sent');
    });
    expect(outOfOrder.length).toBeGreaterThan(20);
  });

  it('refuses all-zero weights', () => {
    expect(() => simulateReports(ids, { weights: { delivered: 0 } })).toThrow(/weights/);
  });
});
