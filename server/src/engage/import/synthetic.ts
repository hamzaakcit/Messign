import { normalizePhone } from '../profiles.js';

/**
 * Synthetic tenant generator (WP-09). Writes the same CSVs a real tenant would hand over, so the importer is exercised
 * exactly as it will be at business start. Everything is invented:
 *  - emails are only ever `@example.com|org|net` (RFC 2606 reserved), or one of a fixed list of deliberately broken strings;
 *  - phones are only ever in +90 5000 xxxxxx, a range WE chose as unlikely to be assigned (it is not an official
 *    reservation: verify before anything is ever sent to it; sends are allow-list gated anyway), or a fixed list of
 *    deliberately broken strings.
 * Every emitted value passes through `assertSafeEmail` / `assertSafePhone`; there is no code path around them.
 * Real data is messy, so by default the output includes duplicates, bad values, mixed case, shared emails and consents
 * without evidence. The same seed always produces the same files.
 */

export type SyntheticKind = 'bookstore' | 'florist';
export const MAX_SYNTHETIC_PROFILES = 1_000_000;
export const TEST_PHONE_PREFIX = '+905000';

const BAD_EMAILS = ['ayse@@example.com', 'no-at-sign.example.com', 'spaces in@example.com', '@example.com', 'trailing@'];
const BAD_PHONES = ['12345', 'abc', '0532', '+000000', '05000-ab-cd'];

export function assertSafeEmail(v: string): string {
  const t = v.trim();
  if (BAD_EMAILS.includes(t.toLowerCase()) || /^[^@\s]+@example\.(com|org|net)$/i.test(t)) return v;
  throw new Error('Synthetic generator refused to emit a non-test email address');
}
export function assertSafePhone(v: string): string {
  if (BAD_PHONES.includes(v)) return v;
  const n = normalizePhone(v);
  if (n && n.startsWith(TEST_PHONE_PREFIX) && n.length === 13) return v; // +90 5000 xxxxxx
  throw new Error('Synthetic generator refused to emit a non-test phone number');
}

/** Small seeded PRNG: the same seed gives the same sequence (also used by the cart simulator, WP-18). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const SYNTHETIC_FIRST_NAMES: readonly string[] = ['Ayşe', 'Fatma', 'Elif', 'Zeynep', 'Merve', 'Büşra', 'Emine', 'Hatice', 'Selin', 'Ceren', 'Mehmet', 'Mustafa', 'Ahmet', 'Ali', 'Hüseyin', 'İbrahim', 'Emre', 'Burak', 'Can', 'Ömer', 'Gülşen', 'Özlem', 'Şule', 'Çağla', 'Yusuf', 'Kemal', 'Deniz', 'Ece', 'Tuğba', 'Barış'];
const LAST = ['Yılmaz', 'Kaya', 'Demir', 'Şahin', 'Çelik', 'Yıldız', 'Yıldırım', 'Öztürk', 'Aydın', 'Özdemir', 'Arslan', 'Doğan', 'Kılıç', 'Aslan', 'Çetin', 'Kara', 'Koç', 'Kurt', 'Özkan', 'Şimşek', 'Polat', 'Güneş', 'Erdoğan', 'Aksoy', 'Tekin', 'Uçar', 'Bulut', 'Korkmaz', 'Ünal', 'Işık'];
const CITIES = ['İstanbul', 'Ankara', 'İzmir', 'Bursa', 'Antalya', 'Adana', 'Konya', 'Gaziantep', 'Eskişehir', 'Trabzon'];
const GENRES = ['roman', 'tarih', 'bilim', 'cocuk', 'felsefe', 'siir', 'polisiye'];
const FORMATS = ['basili', 'e-kitap', 'sesli'];
const BOOKS = Array.from({ length: 40 }, (_, i) => `book-${String(i + 1).padStart(3, '0')}`);
const FLOWERS = ['roses-12', 'tulips-20', 'orchid-pot', 'lilies-10', 'peonies-8', 'mixed-seasonal', 'sunflowers-6', 'carnations-15'];
const DOMAINS = ['example.com', 'example.org', 'example.net'];

const ascii = (s: string) => s.toLocaleLowerCase('tr').replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ş/g, 's').replace(/ü/g, 'u').replace(/[^a-z0-9]/g, '');
const csvCell = (v: string) => (/[",;\r\n]|^\s|\s$/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
const csvLine = (cells: string[]) => cells.map(csvCell).join(',');

export interface SyntheticOptions {
  kind: SyntheticKind;
  profiles: number;
  seed?: number;
  /** Inject duplicates, bad values and missing evidence (default true). */
  mess?: boolean;
  now?: Date;
}

export interface SyntheticTenant {
  profilesCsv: string;
  ordersCsv: string;
  /** What a correct importer must end up with. */
  expected: { distinctProfiles: number; distinctValidOrders: number; profileRows: number; orderRows: number };
}

const PROFILE_HEADERS = ['external_id', 'first_name', 'last_name', 'email', 'phone', 'city', 'locale', 'consent_email', 'consent_sms', 'consent_whatsapp', 'consent_recorded_at', 'consent_evidence_ref', 'consent_ip'];

export function generateSyntheticTenant(opts: SyntheticOptions): SyntheticTenant {
  if (!Number.isInteger(opts.profiles) || opts.profiles < 1 || opts.profiles > MAX_SYNTHETIC_PROFILES) throw new Error(`profiles must be 1 to ${MAX_SYNTHETIC_PROFILES}`);
  const rnd = mulberry32(opts.seed ?? 1);
  const pick = <T,>(a: readonly T[]): T => a[Math.floor(rnd() * a.length)]!;
  const chance = (p: number) => opts.mess !== false && rnd() < p;
  const now = (opts.now ?? new Date()).getTime();
  const day = 24 * 3600_000;
  const isoDate = (t: number) => new Date(t).toISOString().slice(0, 10);
  const florist = opts.kind === 'florist';
  const headers = [...PROFILE_HEADERS, ...(florist ? ['birth_date', 'anniversary_date'] : ['favorite_genre', 'preferred_format'])];
  const lines: string[] = [csvLine(headers)];
  const seenIds = new Set<string>();
  const rowsByIndex: string[][] = [];
  let profileRows = 0;
  const sharedEmailPool: string[] = [];

  for (let i = 1; i <= opts.profiles; i++) {
    const first = pick(SYNTHETIC_FIRST_NAMES); const last = pick(LAST);
    const id = `syn-${opts.kind}-${String(i).padStart(7, '0')}`;
    let email = assertSafeEmail(`${ascii(first)}.${ascii(last)}.${i}@${pick(DOMAINS)}`);
    if (chance(0.01) && sharedEmailPool.length) email = sharedEmailPool[Math.floor(rnd() * sharedEmailPool.length)]!; // two customers, one address
    else if (rnd() < 0.002) sharedEmailPool.push(email);
    if (chance(0.05)) email = assertSafeEmail(` ${email.replace(/^[^@]+/, (m) => m.toUpperCase())} `); // mixed case and padding
    if (chance(0.02)) email = assertSafeEmail(pick(BAD_EMAILS));
    if (rnd() < 0.08) email = '';

    const digits = String(i).padStart(6, '0');
    const forms = [`+905000${digits}`, `05000 ${digits.slice(0, 3)} ${digits.slice(3)}`, `5000${digits}`, `+90 5000 ${digits}`];
    let phone = assertSafePhone(forms[Math.floor(rnd() * forms.length)]!);
    if (chance(0.02)) phone = assertSafePhone(pick(BAD_PHONES));
    if (rnd() < 0.2) phone = '';

    const emailGrant = rnd() < 0.55; const emailRevoke = !emailGrant && rnd() < 0.1;
    const smsGrant = rnd() < 0.3; const smsRevoke = !smsGrant && rnd() < 0.08;
    const recorded = isoDate(now - Math.floor(rnd() * 700) * day - day);
    let evidence = emailGrant || smsGrant ? pick(['checkout-form-v3', 'newsletter-popup-v2', 'account-settings-v5']) : '';
    let recordedAt = emailGrant || smsGrant ? recorded : '';
    let consentEmail = emailGrant ? 'granted' : emailRevoke ? 'revoked' : '';
    const consentSms = smsGrant ? 'granted' : smsRevoke ? 'revoked' : '';
    if (chance(0.03)) evidence = ''; // grant without evidence
    if (chance(0.005)) recordedAt = isoDate(now + 30 * day); // consent dated in the future
    if (chance(0.005)) consentEmail = 'maybe';

    const extra = florist
      ? [rnd() < 0.7 ? isoDate(now - (20 + Math.floor(rnd() * 40)) * 365 * day + Math.floor(rnd() * 365) * day) : '', rnd() < 0.3 ? isoDate(now - (1 + Math.floor(rnd() * 15)) * 365 * day + Math.floor(rnd() * 365) * day) : '']
      : [pick(GENRES), pick(FORMATS)];
    const row = [id, first, last, email, phone, pick(CITIES), 'tr-TR', consentEmail, consentSms, '', recordedAt, evidence, evidence ? `203.0.113.${1 + Math.floor(rnd() * 254)}` : '', ...extra];
    if (chance(0.002)) row[0] = '';
    if (row[0]) seenIds.add(row[0]);
    rowsByIndex.push(row);
    lines.push(csvLine(row));
    profileRows++;
    if (chance(0.03)) { // the same customer exported twice, slightly different
      const dup = [...row]; dup[5] = pick(CITIES); dup[3] = dup[3] ? dup[3].replace(/^[^@]+/, (m) => m.toUpperCase()) : '';
      if (dup[3]) assertSafeEmail(dup[3]);
      if (dup[0]) { lines.push(csvLine(dup)); profileRows++; }
    }
  }

  const orderLines: string[] = [csvLine(['order_id', 'external_id', 'ordered_at', 'total', 'currency', 'product_ids'])];
  const catalog = florist ? FLOWERS : BOOKS;
  const validOrders = new Set<string>();
  let orderRows = 0; let orderSeq = 0;
  for (const row of rowsByIndex) {
    if (!row[0] || rnd() > 0.6) continue;
    const n = 1 + Math.floor(rnd() * (florist ? 3 : 6));
    for (let k = 0; k < n; k++) {
      const orderId = `syn-ord-${opts.kind}-${String(++orderSeq).padStart(8, '0')}`;
      const at = isoDate(now - (1 + Math.floor(rnd() * 380)) * day);
      const total = (20 + rnd() * (florist ? 600 : 400)).toFixed(2);
      const items = Array.from({ length: 1 + Math.floor(rnd() * 3) }, () => pick(catalog)).join('|');
      let ext = row[0]; let totalCell = chance(0.2) ? total.replace('.', ',') : total; let when = at; let ok = true;
      if (chance(0.003)) { ext = 'syn-ghost-unknown'; ok = false; }
      else if (chance(0.003)) { totalCell = 'abc'; ok = false; }
      else if (chance(0.005)) { when = isoDate(now - 500 * day); ok = false; }
      orderLines.push(csvLine([orderId, ext, when, totalCell, 'TRY', items])); orderRows++;
      if (ok) validOrders.add(orderId);
      if (chance(0.01)) { orderLines.push(csvLine([orderId, ext, when, totalCell, 'TRY', items])); orderRows++; }
    }
  }
  return {
    profilesCsv: `${lines.join('\n')}\n`,
    ordersCsv: `${orderLines.join('\n')}\n`,
    expected: { distinctProfiles: seenIds.size, distinctValidOrders: validOrders.size, profileRows, orderRows },
  };
}
