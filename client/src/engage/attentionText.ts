import type { AttentionItem } from './settingsApi';
import { CHECK_ERROR_TEXT, META_STATUS_TEXT } from './whatsappText';

/** What an attention item means, in words for the admin (the codes and numbers are the server's). */

const REASONS: Record<string, string> = {
  spf_missing: 'there is no SPF record', spf_multiple: 'there is more than one SPF record',
  dkim_missing: 'a DKIM record is missing', dkim_selectors_not_set: 'no DKIM selector is named',
  dmarc_missing: 'there is no DMARC record', dmarc_multiple: 'there is more than one DMARC record', dmarc_invalid: 'the DMARC record has no valid policy',
  lookup_failed: 'DNS could not be reached',
};

const num = (v: unknown): number => (typeof v === 'number' ? v : 0);

/** Plain words for the gate's reasons that mean the setup is wrong (the ones the ops rules treat as systemic). */
const DENIAL_TEXT: Record<string, string> = {
  gate_error: 'the send check itself failed', gate_unavailable: 'the send check could not run',
  sender_identity_mismatch: 'the sender name in Settings does not match the From name of the email account',
  readiness_missing: 'a setup step in the readiness list is not done', account_inactive: 'the channel account is not active',
  account_mode_mismatch: 'the channel account is in test mode while sending is live, or the other way round',
  budget_exceeded: 'the monthly budget cap is used up', no_budget_cap: 'no budget cap is set', no_rate_card: 'no price is set for the channel',
  currency_mismatch: 'the price and the budget cap use different currencies', content_template_invalid: 'the message template is not valid',
  sender_id_invalid: 'the SMS sender name is not valid',
  template_not_approved: 'a WhatsApp template is not approved by Meta, or was paused', template_status_unknown: 'a WhatsApp template was never seen at Meta',
  template_mapping_mismatch: 'the values do not fit a WhatsApp template Meta approved', template_category_mismatch: 'a marketing WhatsApp template was sent as transactional',
  account_limit_reached: 'the WhatsApp account reached its daily limit of new customers',
};
const FAIL_CODE_TEXT = (code: unknown): string => (typeof code === 'string' ? code : 'an error');
const topCodes = (v: unknown): string => (Array.isArray(v) ? v.slice(0, 2).map((c) => `${FAIL_CODE_TEXT((c as { code?: unknown }).code)} (${num((c as { count?: unknown }).count)})`).join(', ') : '');
const who = (d: Record<string, unknown>): string => (typeof d.provider === 'string' ? d.provider : 'the provider');

function opsAlertText(item: AttentionItem): { title: string; detail: string } | null {
  const d = item.data;
  const pct = (v: unknown) => `${Math.round(num(v) * 100)}%`;
  switch (item.code) {
    case 'provider_failing':
      return { title: `Sending through ${who(d)} is failing`, detail: `${num(d.failures)} of the last ${num(d.attempts)} attempts to hand messages to ${who(d)} failed (${pct(d.rate)})${topCodes(d.codes) ? `: ${topCodes(d.codes)}` : ''}. Messages are retried automatically; check the account's credentials and the provider's status page.` };
    case 'credentials_rejected':
      return { title: `${who(d)} is refusing your credentials`, detail: `${who(d)} rejected the account's access ${num(d.count)} times. Rotate the channel account with a fresh key or token; sending through it fails until then.` };
    case 'delivery_reports_missing':
      return { title: 'No delivery reports are arriving', detail: `${num(d.waiting)} messages were accepted by ${who(d)} but nothing has been reported back for 24 hours, so bounces and complaints may go unnoticed. Check that the provider's webhook points at Messign.` };
    case 'bounce_rate_high':
      return { title: 'Many emails are bouncing', detail: `${num(d.bounced)} of ${num(d.sent)} emails (${pct(d.rate)}) bounced in the last 24 hours. Clean the list; a high bounce rate can get the sending account paused by the provider.` };
    case 'complaint_rate_high':
      return { title: 'Recipients are reporting emails as spam', detail: `${num(d.complained)} complaints in ${num(d.sent)} emails over the last 24 hours. Check who is being mailed and that every message carries a working unsubscribe link.` };
    case 'gate_denials_systemic':
      return { title: 'Sending is being blocked by a setup problem', detail: `${num(d.count)} messages were refused in the last ${num(d.windowMinutes)} minutes because ${DENIAL_TEXT[String(d.code)] ?? String(d.code)}.` };
    case 'gate_denials_spike':
      return { title: 'More messages than usual are being refused', detail: `${num(d.count)} messages were refused in the last ${num(d.windowMinutes)} minutes with ${String(d.code)} (usually about ${num(d.usual)}). Check the audience of the latest campaign or journey.` };
    case 'messages_stuck':
      return { title: 'Messages are waiting longer than expected', detail: `${num(d.overdue)} messages are past their send time (the oldest for ${num(d.oldestMinutes)} minutes) and ${num(d.staleSending)} are stuck while sending. If this does not clear by itself, contact your Messign contact.` };
    case 'trigger_outbox_stuck':
      return { title: 'Journey triggers are not being processed', detail: `${num(d.pending)} events are waiting to start journeys${num(d.failed) ? ` and ${num(d.failed)} failed` : ''}. If this does not clear by itself, contact your Messign contact.` };
    case 'audit_chain_broken':
      return { title: 'The change history no longer verifies', detail: `An entry in the change history was edited or removed (first problem at entry ${num(d.firstBadSeq)} of ${num(d.entries)}). Contact your Messign contact.` };
    case 'whatsapp_frequency_limited':
      return { title: 'Meta is holding back WhatsApp marketing messages', detail: `Meta did not deliver ${num(d.limited)} of ${num(d.sent)} WhatsApp messages in the last 24 hours (${pct(d.rate)}), to keep customers from getting too many marketing messages from businesses. These customers were not opted out. Send less often, or make the content more relevant; trying again at once does not help.` };
    case 'whatsapp_pacing_holding':
      return { title: 'WhatsApp messages are waiting for the daily limit', detail: `${num(d.overADay)} WhatsApp message${num(d.overADay) === 1 ? ' has' : 's have'} waited over a day because the account may message ${num(d.limit)} new customers in 24 hours${d.limitIsDefault ? ' (Meta\'s starting limit, because the account does not say its own)' : ''}. If WhatsApp Manager shows a higher limit, have the account updated; otherwise send smaller campaigns. Messages that wait past their lifetime are not sent.` };
    case 'whatsapp_template_unhealthy': {
      const list = (Array.isArray(d.templates) ? d.templates : []).slice(0, 5).map((t) => {
        const x = t as Record<string, unknown>;
        const status = x.status === null || x.status === undefined ? 'not seen at Meta' : (META_STATUS_TEXT[String(x.status)] ?? String(x.status)).toLowerCase();
        return `${String(x.metaName)} (${status}${x.quality === 'RED' ? ', quality red' : ''})`;
      });
      return { title: 'A WhatsApp template in use is stopped at Meta', detail: `${list.join(', ')}. Messages from a paused, disabled or rejected template are refused before they reach Meta, so journeys and campaigns that use it send nothing on WhatsApp. Fix or replace it in WhatsApp Manager; see the WhatsApp card below.` };
    }
    case 'whatsapp_template_check_failing':
      return { title: 'The WhatsApp template check is failing', detail: `It failed ${num(d.failures)} times in a row. ${CHECK_ERROR_TEXT[String(d.code)] ?? `Meta answered ${String(d.code)}.`} Until it works, a template Meta pauses is only noticed through the webhook.` };
    default:
      return null;
  }
}

export function attentionText(item: AttentionItem): { title: string; detail: string } {
  const d = item.data;
  const ops = opsAlertText(item);
  if (ops) return ops;
  if (item.code === 'email_domain_lost') {
    const reasons = (Array.isArray(d.reasons) ? d.reasons : []).map((r) => REASONS[String(r)] ?? String(r));
    return {
      title: 'Email domain no longer authenticated',
      detail: `The scheduled check of ${String(d.domain ?? 'your sending domain')} found that ${reasons.length ? reasons.join(' and ') : 'a record is missing'}. Live email sending is blocked until the records are back. Publish them, then press "Check now" under Email domain.`,
    };
  }
  const parts: string[] = [];
  const pull = String(d.pullStatus ?? '');
  if (pull === 'never') parts.push('Customers\' changes in İYS have not been pulled yet.');
  else if (pull === 'stale') parts.push('Customers\' changes in İYS have not been pulled for a while.');
  else if (pull === 'critical') parts.push('Customers\' changes in İYS have not been pulled for days. İYS keeps only the last 7 days, so some may be lost if this continues.');
  if (d.pullErrorCode && pull !== 'ok') parts.push(`İYS answered ${String(d.pullErrorCode)}.`);
  if (num(d.breached) > 0) parts.push(`${num(d.breached)} opt-out${num(d.breached) === 1 ? ' was' : 's were'} not reported to İYS within the three business days.`);
  else if (num(d.atRisk) > 0) parts.push(`${num(d.atRisk)} opt-out${num(d.atRisk) === 1 ? ' is' : 's are'} close to the three-business-day limit for reporting to İYS.`);
  else if (num(d.late) > 0) parts.push(`${num(d.late)} opt-out${num(d.late) === 1 ? ' has' : 's have'} waited over a day to be reported to İYS.`);
  if (num(d.failed) > 0 && num(d.breached) === 0) parts.push(`${num(d.failed)} report${num(d.failed) === 1 ? ' was' : 's were'} refused by İYS.`);
  return { title: 'İYS sync needs attention', detail: `${parts.join(' ')} See the İYS card below.`.trim() };
}
