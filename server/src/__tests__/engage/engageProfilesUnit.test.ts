import { describe, expect, it } from 'vitest';
import { normalizeEmail, normalizePhone } from '../../engage/profiles.js';

describe('normalizeEmail', () => {
  it('lower-cases and trims', () => expect(normalizeEmail('  Ayse.Kaya@Example.COM ')).toBe('ayse.kaya@example.com'));
  it.each(['', 'nope', 'a@b', 'a b@c.com', '@c.com', 'a@@c.com', 42, null, undefined])('rejects %j', (v) => expect(normalizeEmail(v)).toBeNull());
  it('rejects addresses over 254 characters', () => expect(normalizeEmail(`${'a'.repeat(250)}@x.com`)).toBeNull());
});

describe('normalizePhone', () => {
  it.each([
    ['0532 123 45 67', '+905321234567'],
    ['532 123 45 67', '+905321234567'],
    ['905321234567', '+905321234567'],
    ['00905321234567', '+905321234567'],
    ['+90 (532) 123-45-67', '+905321234567'],
    ['+44 20 7946 0958', '+442079460958'],
    ['0044 20 7946 0958', '+442079460958'],
  ])('%s -> %s', (raw, want) => expect(normalizePhone(raw)).toBe(want));
  it.each(['', '12345', 'abc', '+0123456789', '+9', '0532 123 45', '+1234567890123456', '05321234567x', 5321234567, null])('rejects %j', (v) => {
    expect(normalizePhone(v)).toBeNull();
  });
  it('does not guess a country for a bare number that is not Turkish-shaped', () => expect(normalizePhone('2079460958')).toBeNull());
});
