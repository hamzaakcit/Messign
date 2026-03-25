import { describe, it, expect } from 'vitest';
import { isUuidString } from '../../dal/reimbursementUsersPk.js';

describe('isUuidString', () => {
  it('accepts canonical UUID v4 strings', () => {
    expect(isUuidString('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
  });

  it('rejects legacy slug-style ids', () => {
    expect(isUuidString('user-hamza')).toBe(false);
    expect(isUuidString('not-a-uuid')).toBe(false);
  });

  it('rejects empty', () => {
    expect(isUuidString('')).toBe(false);
    expect(isUuidString(undefined)).toBe(false);
    expect(isUuidString(null)).toBe(false);
  });
});
