import type { AttentionItem } from './settingsApi';

/** What an attention item means, in words for the admin (the codes and numbers are the server's). */

const REASONS: Record<string, string> = {
  spf_missing: 'there is no SPF record', spf_multiple: 'there is more than one SPF record',
  dkim_missing: 'a DKIM record is missing', dkim_selectors_not_set: 'no DKIM selector is named',
  dmarc_missing: 'there is no DMARC record', dmarc_multiple: 'there is more than one DMARC record', dmarc_invalid: 'the DMARC record has no valid policy',
  lookup_failed: 'DNS could not be reached',
};

const num = (v: unknown): number => (typeof v === 'number' ? v : 0);

export function attentionText(item: AttentionItem): { title: string; detail: string } {
  const d = item.data;
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
