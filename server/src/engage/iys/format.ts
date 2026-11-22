/**
 * İYS value formats and rules, from the official API documentation (https://apidocs.iys.org.tr, version 3.2.4):
 *   - consent dates are "YYYY-MM-DD HH:mm:ss" in Turkish time ("saat dilimi Türkiye saati kabul edilir"). Turkey has had
 *     a single offset (UTC+3, no daylight saving) since 2016, so a fixed offset is exact for every date we will see.
 *   - channels are ARAMA (call), MESAJ (SMS) and EPOSTA (email); WhatsApp has no İYS record.
 *   - a consent older than three business days cannot be registered (error H467), which is the deadline for reporting an
 *     opt-out (regulation Art. 9(6), docs/compliance/tr-messaging-obligations.md).
 * Pure: no database, no network.
 */

export const TURKEY_OFFSET_MS = 3 * 3_600_000;
export const BUSINESS_DAYS_TO_REPORT = 3;

export type IysType = 'ARAMA' | 'MESAJ' | 'EPOSTA';
export type IysStatus = 'ONAY' | 'RET';
export type LocalChannel = 'email' | 'sms' | 'call' | 'whatsapp';
export type LocalConsentSource = 'iys' | 'web' | 'import' | 'api' | 'unsubscribe_link' | 'stop_keyword';

const TYPE_OF_CHANNEL: Partial<Record<LocalChannel, IysType>> = { email: 'EPOSTA', sms: 'MESAJ', call: 'ARAMA' };
/** The local channel for an İYS type: MESAJ is SMS, ARAMA is call. */
const CHANNEL_OF_TYPE: Record<IysType, Exclude<LocalChannel, 'whatsapp'>> = { EPOSTA: 'email', MESAJ: 'sms', ARAMA: 'call' };
/** Which identifier holds the address of a channel. */
export const IDENTIFIER_OF_TYPE: Record<IysType, 'email' | 'phone'> = { EPOSTA: 'email', MESAJ: 'phone', ARAMA: 'phone' };

export const iysTypeOf = (channel: LocalChannel): IysType | null => TYPE_OF_CHANNEL[channel] ?? null;
export const channelOfIysType = (type: string): Exclude<LocalChannel, 'whatsapp'> | null => (CHANNEL_OF_TYPE as Record<string, Exclude<LocalChannel, 'whatsapp'>>)[type] ?? null;

/**
 * The İYS `source` for an opt-out the tenant recorded: how the recipient acted, in the documentation's terms
 * (HS_EPOSTA: through the provider's email, HS_MESAJ: the provider's SMS number, HS_WEB: the provider's website,
 * HS_EORTAM: another electronic medium of the provider). HS_KARAR ("the provider decided") is not used: it is for a
 * provider's own decision, and the documentation refuses it for a first registration. This is a reading of the
 * documented definitions, to be confirmed in İYS's sandbox with the tenant at business start.
 */
const SOURCE_OF_LOCAL: Record<Exclude<LocalConsentSource, 'iys'>, string> = {
  unsubscribe_link: 'HS_EPOSTA', stop_keyword: 'HS_MESAJ', web: 'HS_WEB', api: 'HS_EORTAM', import: 'HS_EORTAM',
};
export const iysSourceOf = (source: LocalConsentSource): string | null => (source === 'iys' ? null : SOURCE_OF_LOCAL[source]);

const pad = (n: number) => String(n).padStart(2, '0');

/** "YYYY-MM-DD HH:mm:ss" in Turkish time. */
export function formatIysDate(at: Date): string {
  const t = new Date(at.getTime() + TURKEY_OFFSET_MS);
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())} ${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}:${pad(t.getUTCSeconds())}`;
}

const IYS_DATE_RE = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/;
/** The instant an İYS date names, or null when it is not in the documented format (or not a real date). */
export function parseIysDate(text: unknown): Date | null {
  if (typeof text !== 'string') return null;
  const m = IYS_DATE_RE.exec(text);
  if (!m) return null;
  const [y, mo, d, h, mi, s] = m.slice(1).map(Number) as [number, number, number, number, number, number];
  const ms = Date.UTC(y, mo - 1, d, h, mi, s) - TURKEY_OFFSET_MS;
  const back = new Date(ms + TURKEY_OFFSET_MS);
  // Date.UTC rolls 31 February over to March: refuse anything that did not round-trip.
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d || back.getUTCHours() !== h) return null;
  return new Date(ms);
}

/** Monday to Friday in Turkish time. Public holidays are not known here, which only makes a deadline earlier, never later. */
const isBusinessDay = (localMs: number): boolean => { const d = new Date(localMs).getUTCDay(); return d !== 0 && d !== 6; };

/** `at` plus `days` business days, at the same time of day (a weekend adds nothing). */
export function addBusinessDays(at: Date, days: number): Date {
  let local = at.getTime() + TURKEY_OFFSET_MS;
  let left = days;
  while (left > 0) {
    local += 86_400_000;
    if (isBusinessDay(local)) left--;
  }
  return new Date(local - TURKEY_OFFSET_MS);
}

/** The moment after which İYS no longer accepts a consent taken at `consentAt` (error H467). */
export const reportDeadline = (consentAt: Date): Date => addBusinessDays(consentAt, BUSINESS_DAYS_TO_REPORT);
