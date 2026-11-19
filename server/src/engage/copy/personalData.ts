import { normalizePhone } from '../profiles.js';

/**
 * Personal-data detector for AI copy drafting (WP-24). Pure: no database, no network.
 *
 * It looks for the shapes of personal identifiers in free text: email addresses, phone numbers (any form normalizePhone
 * accepts, including Turkish national forms), Turkish IBANs, 11-digit national ids, and payment card numbers that pass
 * the Luhn check. It returns the KINDS found, never the values, so an error can name the problem without repeating it.
 *
 * Known limit: names and street addresses have no reliable shape, so they are not detected here. The drafting path is
 * built so they cannot reach a prompt in the first place: it reads no profile data, and the only free text it sends is
 * the admin's brief, which is screened by this module. Any finding fails closed.
 */

export type PersonalDataKind = 'email' | 'phone' | 'iban' | 'national_id' | 'card_number';

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
const PHONE_CANDIDATE = /(?<![\w+])\+?\d(?:[\s().-]?\d){7,17}(?![\w])/g;
const IBAN_TR = /\bTR\d{2}(?:\s?\d{4}){5}\s?\d{2}\b/gi;
const NATIONAL_ID = /(?<!\d)[1-9]\d{10}(?!\d)/g;
const CARD_CANDIDATE = /(?<!\d)(?:\d[ -]?){12,18}\d(?!\d)/g;

function luhnValid(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let d = digits.charCodeAt(i) - 48;
    if (double) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

/** The kinds of personal data present in the text, sorted. An empty list means none of the shapes were found. */
export function personalDataKinds(text: string): PersonalDataKind[] {
  const kinds = new Set<PersonalDataKind>();
  if (text.search(EMAIL) >= 0) kinds.add('email');
  for (const m of text.matchAll(PHONE_CANDIDATE)) {
    if (normalizePhone(m[0]) !== null) { kinds.add('phone'); break; }
  }
  if (text.search(IBAN_TR) >= 0) kinds.add('iban');
  if (text.search(NATIONAL_ID) >= 0) kinds.add('national_id');
  for (const m of text.matchAll(CARD_CANDIDATE)) {
    const digits = m[0].replace(/[ -]/g, '');
    if (digits.length >= 13 && digits.length <= 19 && luhnValid(digits)) { kinds.add('card_number'); break; }
  }
  return [...kinds].sort();
}

export function containsPersonalData(text: string): boolean {
  return personalDataKinds(text).length > 0;
}
