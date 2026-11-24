import { z } from 'zod';
import { upsertFromApi, upsertSchema } from './ingest.js';
import { findProfileByExternalId, ProfileInputError, type ProfileView } from './profiles.js';

/**
 * Adding one customer by hand (admin, Customers page). The same profile and consent writes as the ingestion API, so a
 * customer added here behaves exactly like one sent by a store. A marketing consent entered by hand (email, or WhatsApp from
 * WP-40b) needs a note saying where the customer agreed (the evidence); without the note the consent is refused, not stored
 * empty. WhatsApp consent also needs the customer's phone number.
 */

export const createCustomerSchema = z.object({
  external_id: z.string().trim().min(1, 'Enter a customer ID').max(200),
  email: z.string().trim().max(320).nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  email_consent: z.boolean().default(false),
  whatsapp_consent: z.boolean().default(false),
  consent_note: z.string().trim().max(500).nullable().optional(),
}).strict();

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;

export class CustomerExistsError extends Error {}

const blankToNull = (v: string | null | undefined): string | null => (v && v.length > 0 ? v : null);

export async function createCustomer(orgId: string, userId: string, input: CreateCustomerInput, now: Date = new Date()): Promise<ProfileView> {
  const email = blankToNull(input.email);
  const phone = blankToNull(input.phone);
  const note = blankToNull(input.consent_note);
  if (input.email_consent && !email) throw new ProfileInputError('To record email consent, enter the customer\'s email address');
  if (input.email_consent && !note) throw new ProfileInputError('Say where the customer agreed to marketing email, so the consent has evidence');
  if (input.whatsapp_consent && !phone) throw new ProfileInputError('To record WhatsApp consent, enter the customer\'s phone number');
  if (input.whatsapp_consent && !note) throw new ProfileInputError('Say where the customer agreed to marketing on WhatsApp, so the consent has evidence');
  if (await findProfileByExternalId(orgId, input.external_id)) throw new CustomerExistsError('A customer with this customer ID already exists');

  const evidence = { method: 'manual_entry', note, entered_by: userId, entered_at: now.toISOString() };
  const consents = [
    ...(input.email_consent ? [{ channel: 'email', status: 'granted', source: 'import', evidence }] : []),
    ...(input.whatsapp_consent ? [{ channel: 'whatsapp', status: 'granted', source: 'import', evidence }] : []),
  ];
  const body = upsertSchema.parse({
    external_id: input.external_id,
    identifiers: { email, phone },
    consents: consents.length ? consents : undefined,
  });
  return upsertFromApi(orgId, body);
}
