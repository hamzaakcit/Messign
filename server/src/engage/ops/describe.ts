import type { Condition } from './types.js';

/**
 * One plain line for a condition, built only from its codes and numbers (no free text from anywhere), for the operators'
 * message and the report. Unknown rules and unexpected shapes still print something short: the rule's name.
 */
const n = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const s = (v: unknown): string => (typeof v === 'string' && /^[A-Za-z0-9_.:-]{1,64}$/.test(v) ? v : '?');
const pct = (v: unknown): string => `${Math.round(n(v) * 100)}%`;
const codes = (v: unknown): string => (Array.isArray(v) ? v.slice(0, 3).map((c) => `${s((c as { code?: unknown }).code)}×${n((c as { count?: unknown }).count)}`).join(', ') : '');

const templates = (v: unknown): string => (Array.isArray(v)
  ? v.slice(0, 3).map((t) => { const x = t as Record<string, unknown>; return `${s(x.metaName)}/${s(x.language)} ${x.status === null ? 'unknown' : s(x.status)}${x.quality === 'RED' ? ' RED' : ''}`; }).join(', ')
  : '');

export function describeCondition(c: Pick<Condition, 'rule' | 'subject' | 'data'>): string {
  const d = c.data;
  const via = `${s(d.provider)}/${s(d.channel)}`;
  switch (c.rule) {
    case 'provider_failing': return `${via}: ${n(d.failures)} of ${n(d.attempts)} provider calls failed (${pct(d.rate)})${codes(d.codes) ? `; ${codes(d.codes)}` : ''}`;
    case 'credentials_rejected': return `${via}: the provider rejected the account's credentials ${n(d.count)} times; ${codes(d.codes)}. Rotate the account`;
    case 'delivery_reports_missing': return `${via}: ${n(d.waiting)} messages were accepted but no delivery report has arrived in 24 hours; check the webhook and the provider's subscription`;
    case 'bounce_rate_high': return `${via}: ${n(d.bounced)} of ${n(d.sent)} messages bounced in 24 hours (${pct(d.rate)})`;
    case 'complaint_rate_high': return `${via}: ${n(d.complained)} complaints in ${n(d.sent)} messages in 24 hours (${(n(d.rate) * 100).toFixed(2)}%)`;
    case 'gate_denials_systemic': return `${n(d.count)} sends denied by the gate in ${n(d.windowMinutes)} minutes with ${s(d.code)}, a setup problem`;
    case 'gate_denials_spike': return `${n(d.count)} sends denied with ${s(d.code)} in ${n(d.windowMinutes)} minutes (usually ${n(d.usual)})`;
    case 'messages_stuck': return `${n(d.overdue)} messages waiting past their time (oldest ${n(d.oldestMinutes)} min), ${n(d.staleSending)} stuck while sending`;
    case 'trigger_outbox_stuck': return `${n(d.pending)} events waiting to start journeys (oldest ${n(d.oldestMinutes)} min), ${n(d.failed)} failed`;
    case 'email_domain_lost': return 'the sending domain no longer passes its authentication check; live email is blocked';
    case 'iys_sync': return `the İYS sync needs attention: ${n(d.breached)} past the limit, ${n(d.atRisk)} at risk, ${n(d.failed)} refused`;
    case 'whatsapp_template_unhealthy': return `${n(d.count)} WhatsApp template(s) in use are paused, disabled, rejected or rated red at Meta: ${templates(d.templates)}`;
    case 'whatsapp_template_check_failing': return `the WhatsApp template check failed ${n(d.failures)} times in a row (${s(d.code)}); template statuses are getting old`;
    case 'whatsapp_frequency_limited': return `${via}: Meta held back ${n(d.limited)} of ${n(d.sent)} WhatsApp messages in 24 hours (131049, ${pct(d.rate)})`;
    case 'whatsapp_pacing_holding': return `${via}: ${n(d.overADay)} WhatsApp messages held over a day by the daily limit of ${n(d.limit)} new customers (${n(d.waiting)} waiting)`;
    default: return c.rule;
  }
}
