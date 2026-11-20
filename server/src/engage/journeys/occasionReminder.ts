import { createTemplate, listTemplates } from '../templates/templates.js';
import { createJourney, listJourneys } from './journeys.js';

/**
 * The occasion-reminder journey (WP-25): the first ready-made journey on a date attribute, for a florist.
 *
 *   a customer's date attribute (anniversary_date, birth_date) is an occasion `offset_days` away -> one reminder -> end
 *
 * It starts once per customer per year (the date trigger's enrollment key is the occasion day, re_entry is after_exit),
 * is a commercial message (consent required, ADR-004), and makes no claim about stock, prices or delivery. Holdout 10%
 * (D-11), so the uplift is measurable like the cart journey's.
 *
 * Installing creates the template (when the tenant has none with that key) and the journey as a draft. It never approves
 * or activates: a tenant admin does that (ADR-011). One journey per attribute: the key is occasion-<attribute>.
 */

export const OCCASION_TEMPLATE_KEY = 'occasion-reminder';
export const OCCASION_DEFAULT_OFFSET_DAYS = -7;
export const OCCASION_DEFAULT_TIME = '09:30';

const footer = '<p style="font-size:12px;color:#666">Bu e-postaları almak istemiyorsanız <a href="{{unsubscribe_url}}">abonelikten çıkabilirsiniz</a>.</p>';
export const OCCASION_TEMPLATE = {
  name: 'Özel gün hatırlatma',
  subject: 'Özel gününüz yaklaşıyor',
  html: '<p>Merhaba {{first_name | default: "değerli müşterimiz"}},</p>'
    + '<p>Özel gününüz yaklaşırken sevdiklerinize bir çiçek göndermek isterseniz, sitemize dilediğiniz zaman göz atabilirsiniz.</p>' + footer,
};

const ATTRIBUTE = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
export const occasionJourneyKey = (attribute: string): string => `occasion-${attribute.toLowerCase().replace(/_/g, '-')}`.slice(0, 64);

export interface OccasionOptions { attribute: string; offsetDays?: number; atLocalTime?: string; holdoutPercent?: number }

export function occasionReminderDefinition(o: OccasionOptions) {
  return {
    trigger: { type: 'date_attribute', attribute: o.attribute, offset_days: o.offsetDays ?? OCCASION_DEFAULT_OFFSET_DAYS, at_local_time: o.atLocalTime ?? OCCASION_DEFAULT_TIME },
    exit_when: [],
    re_entry: 'after_exit',
    holdout_percent: o.holdoutPercent ?? 10,
    steps: [
      { id: 'reminder', type: 'message', channel: 'email', template: OCCASION_TEMPLATE_KEY, purpose: 'marketing' },
      { id: 'done', type: 'exit' },
    ],
  };
}

export interface OccasionInstallResult { journeyId: string; journeyKey: string; version: number; templateCreated: boolean }

/** Creates the template if it is missing and the journey as a draft version 1. Refuses if the journey key is taken. */
export async function installOccasionReminder(orgId: string, userId: string | null, o: OccasionOptions): Promise<OccasionInstallResult> {
  if (!ATTRIBUTE.test(o.attribute)) throw new Error('The attribute name must be letters, digits and underscores');
  const key = occasionJourneyKey(o.attribute);
  if ((await listJourneys(orgId)).some((j) => j.key === key)) throw new Error(`This tenant already has a journey with the key "${key}"`);
  const exists = (await listTemplates(orgId)).some((t) => t.key === OCCASION_TEMPLATE_KEY);
  if (!exists) await createTemplate(orgId, userId, { key: OCCASION_TEMPLATE_KEY, ...OCCASION_TEMPLATE });
  const { journey, version } = await createJourney(orgId, userId, { key, name: `Özel gün: ${o.attribute}`, definition: occasionReminderDefinition(o) });
  return { journeyId: journey.id, journeyKey: key, version: version.version, templateCreated: !exists };
}
