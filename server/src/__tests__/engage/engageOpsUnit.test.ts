import { afterEach, describe, expect, it } from 'vitest';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { noticeFor } from '../../engage/ops/alerts.js';
import { describeCondition } from '../../engage/ops/describe.js';
import { captureError, drainErrorNotices, errorGroups, resetErrorGroups } from '../../engage/ops/errors.js';
import { alertWebhookUrl } from '../../engage/ops/notify.js';
import { platformConditions } from '../../engage/ops/platform.js';
import { expectedTables } from '../../engage/ops/restoreCheck.js';
import { evaluateRules, isAuthFailure } from '../../engage/ops/rules.js';
import { DEFAULT_THRESHOLDS as T, loadThresholds } from '../../engage/ops/thresholds.js';
import type { AccountStats, AlertRow, Snapshot } from '../../engage/ops/types.js';
import { logError } from '../../engage/log.js';

const acct = (o: Partial<AccountStats> = {}): AccountStats => ({
  accountId: 'a1', channel: 'email', provider: 'ses', label: 'x', mode: 'live', expectsReports: true, sent: 0, failed: 0, retried: 0, failureCodes: {},
  sent24h: 0, bounced24h: 0, complained24h: 0, reports24h: 1, waitingForReport: 0, ...o,
});
const snap = (o: Partial<Snapshot> & { accounts?: AccountStats[] } = {}): Snapshot => ({
  at: new Date(), accounts: [], denials: { byCode: {} },
  queue: { sendingOn: true, overdue: 0, oldestOverdueSeconds: 0, staleSending: 0, outboxPending: 0, oldestOutboxSeconds: 0, outboxFailed: 0 },
  attention: [], ...o,
});
const rules = (s: Snapshot) => evaluateRules(s, T).map((c) => `${c.rule}:${c.subject}:${c.severity}`);

describe('ops rules', () => {
  it('says nothing for a quiet tenant', () => { expect(rules(snap({ accounts: [acct()] }))).toEqual([]); });

  it('provider failure rate needs volume, warns at 25% and is critical at 50%', () => {
    expect(rules(snap({ accounts: [acct({ sent: 5, failed: 4 })] }))).toEqual([]); // 9 calls: too few to judge
    expect(rules(snap({ accounts: [acct({ sent: 7, failed: 3 })] }))).toEqual(['provider_failing:a1:warning']);
    expect(rules(snap({ accounts: [acct({ sent: 5, failed: 3, retried: 2 })] }))).toEqual(['provider_failing:a1:critical']);
    expect(rules(snap({ accounts: [acct({ sent: 20, failed: 1 })] }))).toEqual([]);
  });

  it('rejected credentials are critical even at low volume, and replace the failure-rate alert', () => {
    const s = snap({ accounts: [acct({ sent: 0, failed: 3, failureCodes: { wa_190: 3 } })] });
    expect(rules(s)).toEqual(['credentials_rejected:a1:critical']);
    expect(isAuthFailure('wa_190')).toBe(true);
    expect(isAuthFailure('ses_unrecognized_client_exception')).toBe(true);
    expect(isAuthFailure('ses_throttled')).toBe(false);
    expect(rules(snap({ accounts: [acct({ failed: 2, failureCodes: { wa_190: 2 } })] }))).toEqual([]);
  });

  it('missing delivery reports: only for providers that send them, only when nothing at all came back', () => {
    expect(rules(snap({ accounts: [acct({ waitingForReport: 5, reports24h: 0 })] }))).toEqual(['delivery_reports_missing:a1:critical']);
    expect(rules(snap({ accounts: [acct({ waitingForReport: 5, reports24h: 1 })] }))).toEqual([]);
    expect(rules(snap({ accounts: [acct({ waitingForReport: 4, reports24h: 0 })] }))).toEqual([]);
    expect(rules(snap({ accounts: [acct({ waitingForReport: 50, reports24h: 0, expectsReports: false })] }))).toEqual([]);
  });

  it('bounce and complaint rates need a minimum volume and apply to email only', () => {
    expect(rules(snap({ accounts: [acct({ sent24h: 40, bounced24h: 20 })] }))).toEqual([]);
    expect(rules(snap({ accounts: [acct({ sent24h: 100, bounced24h: 5 })] }))).toEqual(['bounce_rate_high:a1:warning']);
    expect(rules(snap({ accounts: [acct({ sent24h: 100, bounced24h: 10 })] }))).toEqual(['bounce_rate_high:a1:critical']);
    expect(rules(snap({ accounts: [acct({ channel: 'sms', sent24h: 100, bounced24h: 50 })] }))).toEqual([]);
    expect(rules(snap({ accounts: [acct({ sent24h: 1000, complained24h: 1 })] }))).toEqual([]);
    expect(rules(snap({ accounts: [acct({ sent24h: 1000, complained24h: 2 })] }))).toEqual(['complaint_rate_high:a1:warning']);
    expect(rules(snap({ accounts: [acct({ sent24h: 1000, complained24h: 6 })] }))).toEqual(['complaint_rate_high:a1:critical']);
  });

  it('gate denials: setup problems count from a handful, ordinary reasons only when they jump', () => {
    expect(rules(snap({ denials: { byCode: { no_rate_card: { count: 4, baseline: 0 } } } }))).toEqual([]);
    expect(rules(snap({ denials: { byCode: { no_rate_card: { count: 5, baseline: 0 } } } }))).toEqual(['gate_denials_systemic:no_rate_card:warning']);
    expect(rules(snap({ denials: { byCode: { gate_error: { count: 50, baseline: 0 } } } }))).toEqual(['gate_denials_systemic:gate_error:critical']);
    expect(rules(snap({ denials: { byCode: { no_consent: { count: 40, baseline: 0 } } } }))).toEqual([]);
    expect(rules(snap({ denials: { byCode: { no_consent: { count: 60, baseline: 20 } } } }))).toEqual([]); // 3x the usual
    expect(rules(snap({ denials: { byCode: { no_consent: { count: 120, baseline: 20 } } } }))).toEqual(['gate_denials_spike:no_consent:warning']);
  });

  it('stuck messages are judged only while sending is on; the outbox always', () => {
    const q = { sendingOn: true, overdue: 3, oldestOverdueSeconds: 1200, staleSending: 0, outboxPending: 0, oldestOutboxSeconds: 0, outboxFailed: 0 };
    expect(rules(snap({ queue: q }))).toEqual(['messages_stuck::warning']);
    expect(rules(snap({ queue: { ...q, oldestOverdueSeconds: 3700 } }))).toEqual(['messages_stuck::critical']);
    expect(rules(snap({ queue: { ...q, overdue: 100 } }))).toEqual(['messages_stuck::critical']);
    expect(rules(snap({ queue: { ...q, sendingOn: false } }))).toEqual([]);
    expect(rules(snap({ queue: { ...q, overdue: 0, outboxPending: 2, oldestOutboxSeconds: 900 } }))).toEqual(['trigger_outbox_stuck::warning']);
    expect(rules(snap({ queue: { ...q, overdue: 0, outboxFailed: 1 } }))).toEqual(['trigger_outbox_stuck::critical']);
  });

  it('turns the tenant attention items into conditions', () => {
    const s = snap({ attention: [{ code: 'iys_sync', severity: 'warning', since: null, data: { late: 2 } }] });
    expect(rules(s)).toEqual(['iys_sync::warning']);
  });
});

describe('thresholds', () => {
  it('reads ENGAGE_OPS_* overrides and ignores invalid ones', () => {
    const t = loadThresholds({ ENGAGE_OPS_FAIL_RATE_WARNING: '0.4', ENGAGE_OPS_MIN_ATTEMPTS: 'abc', ENGAGE_OPS_WINDOW_MINUTES: '-3' } as unknown as NodeJS.ProcessEnv);
    expect(t.failRateWarning).toBe(0.4);
    expect(t.minAttempts).toBe(T.minAttempts);
    expect(t.windowMinutes).toBe(T.windowMinutes);
  });
});

describe('alert notices', () => {
  const now = new Date('2026-11-23T12:00:00Z');
  const h = (n: number) => new Date(now.getTime() - n * 3_600_000);
  const row = (o: Partial<AlertRow> = {}): AlertRow => ({
    id: '1', organizationId: 'o', rule: 'provider_failing', subject: 'a1', severity: 'warning', state: 'open', openedAt: h(1), lastSeenAt: now, resolvedAt: null,
    data: {}, lastNotifiedAt: null, notifiedSeverity: null, resolvedNotifiedAt: null, ...o,
  });
  it('tells once on opening, again on escalation, on a reminder, and once on resolution', () => {
    expect(noticeFor(row(), T, now)).toBe('opened');
    expect(noticeFor(row({ lastNotifiedAt: h(1), notifiedSeverity: 'warning' }), T, now)).toBeNull();
    expect(noticeFor(row({ severity: 'critical', lastNotifiedAt: h(1), notifiedSeverity: 'warning' }), T, now)).toBe('escalated');
    expect(noticeFor(row({ severity: 'critical', lastNotifiedAt: h(7), notifiedSeverity: 'critical' }), T, now)).toBe('reminder');
    expect(noticeFor(row({ lastNotifiedAt: h(7), notifiedSeverity: 'warning' }), T, now)).toBeNull(); // warnings are reminded daily
    expect(noticeFor(row({ lastNotifiedAt: h(25), notifiedSeverity: 'warning' }), T, now)).toBe('reminder');
    const done = row({ state: 'resolved', resolvedAt: h(1), lastNotifiedAt: h(3), notifiedSeverity: 'warning' });
    expect(noticeFor(done, T, now)).toBe('resolved');
    expect(noticeFor({ ...done, resolvedNotifiedAt: now }, T, now)).toBeNull();
    expect(noticeFor({ ...done, lastNotifiedAt: null }, T, now)).toBeNull(); // nobody was told it opened: no need to say it closed
  });
});

describe('describing conditions', () => {
  it('uses only codes and numbers, and masks anything else', () => {
    const text = describeCondition({ rule: 'provider_failing', subject: 'a1', data: { provider: 'ses', channel: 'email', attempts: 12, failures: 6, rate: 0.5, codes: [{ code: 'ses_throttled', count: 4 }] } });
    expect(text).toBe('ses/email: 6 of 12 provider calls failed (50%); ses_throttled×4');
    expect(describeCondition({ rule: 'provider_failing', subject: '', data: { provider: 'not a code, has spaces@x.com', attempts: 1 } })).not.toContain('@');
    expect(describeCondition({ rule: 'something_new', subject: '', data: {} })).toBe('something_new');
  });
  it('words dead-letter conditions', () => {
    expect(platformConditions({ 'engage/import': 1, 'engage/iys-sync': 12, other: 0 }).map((c) => `${c.key}:${c.severity}`)).toEqual(['job_failed:engage/import:warning', 'job_failed:engage/iys-sync:critical']);
  });
});

describe('error tracking', () => {
  afterEach(() => resetErrorGroups());
  it('groups the same error with different ids and numbers, and tells the operators once per group', () => {
    const now = new Date('2026-11-23T12:00:00Z');
    captureError('x', new Error('row 123 of 3f2504e0-4f89-11d3-9a0c-0305e82c3301 failed'), now);
    captureError('x', new Error('row 456 of 11111111-2222-3333-4444-555555555555 failed'), now);
    captureError('y', new Error('row 456 failed'), now);
    expect(errorGroups().map((g) => g.count).sort()).toEqual([1, 2]);
    expect(drainErrorNotices(now).map((n) => n.kind)).toEqual(['new', 'new']);
    expect(drainErrorNotices(now)).toEqual([]);
  });
  it('reports a burst once an hour', () => {
    const t0 = new Date('2026-11-23T12:00:00Z');
    captureError('x', new Error('boom'), t0);
    drainErrorNotices(t0);
    for (let i = 0; i < 20; i++) captureError('x', new Error('boom'), new Date(t0.getTime() + 1000 + i));
    const t1 = new Date(t0.getTime() + 60_000);
    expect(drainErrorNotices(t1).map((n) => n.kind)).toEqual(['burst']);
    expect(drainErrorNotices(new Date(t1.getTime() + 60_000))).toEqual([]);
  });
  it('tracks what engage code logs as an error, without a loop', () => {
    logError('request failed', { error: 'TypeError', detail: 'TypeError x is not a function' });
    logError('request failed', { error: 'TypeError', detail: 'TypeError x is not a function' });
    expect(errorGroups().find((g) => g.source === 'log')?.count).toBe(2);
  });
});

describe('alert webhook url', () => {
  it('accepts https, and http only for loopback', () => {
    const env = (v: string) => ({ ENGAGE_ALERT_WEBHOOK_URL: v }) as unknown as NodeJS.ProcessEnv;
    expect(alertWebhookUrl(env('https://hooks.example/abc'))?.hostname).toBe('hooks.example');
    expect(alertWebhookUrl(env('http://127.0.0.1:9000/x'))?.port).toBe('9000');
    expect(alertWebhookUrl(env('http://hooks.example/abc'))).toBeNull();
    expect(alertWebhookUrl(env('not a url'))).toBeNull();
    expect(alertWebhookUrl({} as NodeJS.ProcessEnv)).toBeNull();
  });
});

describe('restore check helpers', () => {
  it('lists the tables the migrations create, partitions excluded', () => {
    const t = expectedTables(join(fileURLToPath(new URL('.', import.meta.url)), '..', '..', 'migrations'));
    expect(t).toEqual(expect.arrayContaining(['messages', 'message_events', 'consents', 'consent_state', 'ops_alerts', 'inbound_events']));
    expect(t.some((x) => /^events_\d/.test(x))).toBe(false);
  });
});
