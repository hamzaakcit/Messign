import { createTemplate, listTemplates } from '../templates/templates.js';
import { createJourney, listJourneys } from './journeys.js';

/**
 * The cart-abandonment journey (WP-18): the first ready-made journey, built from the WP-15..17 parts only.
 *
 *   cart_updated -> wait 1 hour -> reminder 1 -> wait 24 hours -> reminder 2 -> end
 *   an order_completed at any point (counted by when it happened) ends it, so a buyer gets nothing more
 *
 * Re-entry after_exit: a customer who abandons a new cart after the previous enrollment ended enters again; the send
 * gate's frequency cap still limits how many marketing mails reach one person. Holdout 10% (D-11).
 *
 * Installing creates the two templates (when the tenant has none with those keys) and the journey as a draft. It never
 * approves or activates: a tenant admin does that (ADR-011).
 */

export const CART_JOURNEY_KEY = 'cart-abandonment';
export const CART_FIRST_DELAY_MINUTES = 60;
export const CART_SECOND_DELAY_MINUTES = 24 * 60;
export const CART_TEMPLATE_KEYS = { first: 'cart-reminder-1', second: 'cart-reminder-2' } as const;

const footer = '<p style="font-size:12px;color:#666">Bu e-postaları almak istemiyorsanız <a href="{{unsubscribe_url}}">abonelikten çıkabilirsiniz</a>.</p>';
export const CART_TEMPLATES: Record<keyof typeof CART_TEMPLATE_KEYS, { name: string; subject: string; html: string }> = {
  first: {
    name: 'Sepet hatırlatma 1',
    subject: 'Sepetinizdeki ürünler sizi bekliyor',
    html: '<p>Merhaba {{first_name | default: "değerli müşterimiz"}},</p>'
      + '<p>Sepetinize eklediğiniz ürünler hâlâ sizi bekliyor. Alışverişinizi tamamlamak için sitemize dönebilirsiniz.</p>' + footer,
  },
  second: {
    name: 'Sepet hatırlatma 2',
    subject: 'Sepetinizi unutmayın',
    html: '<p>Merhaba {{first_name | default: "değerli müşterimiz"}},</p>'
      + '<p>Sepetinizdeki ürünleri sizin için ayırdık. Bu son hatırlatmamız; dilediğiniz zaman alışverişinize kaldığınız yerden devam edebilirsiniz.</p>' + footer,
  },
};

export function cartAbandonmentDefinition(o: { holdoutPercent?: number } = {}) {
  return {
    trigger: { type: 'event', event: 'cart_updated' },
    exit_when: [{ event: 'order_completed' }],
    re_entry: 'after_exit',
    holdout_percent: o.holdoutPercent ?? 10,
    steps: [
      { id: 'wait-1h', type: 'delay', minutes: CART_FIRST_DELAY_MINUTES },
      { id: 'reminder-1', type: 'message', channel: 'email', template: CART_TEMPLATE_KEYS.first, purpose: 'marketing' },
      { id: 'wait-24h', type: 'delay', minutes: CART_SECOND_DELAY_MINUTES },
      { id: 'reminder-2', type: 'message', channel: 'email', template: CART_TEMPLATE_KEYS.second, purpose: 'marketing' },
      { id: 'done', type: 'exit' },
    ],
  };
}

export interface CartInstallResult { journeyId: string; version: number; templatesCreated: string[] }

/** Creates the templates that are missing and the journey as a draft version 1. Refuses if the journey key is taken. */
export async function installCartAbandonment(orgId: string, userId: string | null, o: { holdoutPercent?: number } = {}): Promise<CartInstallResult> {
  if ((await listJourneys(orgId)).some((j) => j.key === CART_JOURNEY_KEY)) {
    throw new Error(`This tenant already has a journey with the key "${CART_JOURNEY_KEY}"`);
  }
  const existing = new Set((await listTemplates(orgId)).map((t) => t.key));
  const templatesCreated: string[] = [];
  for (const which of ['first', 'second'] as const) {
    const key = CART_TEMPLATE_KEYS[which];
    if (existing.has(key)) continue;
    await createTemplate(orgId, userId, { key, ...CART_TEMPLATES[which] });
    templatesCreated.push(key);
  }
  const { journey, version } = await createJourney(orgId, userId, { key: CART_JOURNEY_KEY, name: 'Sepet terk', definition: cartAbandonmentDefinition(o) });
  return { journeyId: journey.id, version: version.version, templatesCreated };
}
