import { afterEach, describe, expect, it } from 'vitest';
import {
  decryptInstagramToken,
  encryptInstagramToken,
  parseInstagramAccountId,
} from '../../../services/marketing/publishing/instagramConnection.js';
import { localMarketingFilePath } from '../../../services/marketing/publishing/instagramPublicImage.js';

describe('instagram connection', () => {
  const previous = process.env.JWT_SECRET;

  afterEach(() => {
    if (previous == null) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previous;
  });

  it('accepts a numeric business account id', () => {
    expect(parseInstagramAccountId(' 17841400000000000 ')).toBe('17841400000000000');
    expect(parseInstagramAccountId('not-an-id')).toBeNull();
    expect(parseInstagramAccountId('123')).toBeNull();
  });

  it('round-trips the token without storing it in the clear', () => {
    process.env.JWT_SECRET = 'test-secret-for-instagram-connection';
    const token = 'EAA-test-token-value-that-is-long-enough';
    const stored = encryptInstagramToken(token);
    expect(stored).not.toContain(token);
    expect(decryptInstagramToken(stored)).toBe(token);
  });

  it('rejects a local upload path that leaves the marketing folder', () => {
    expect(localMarketingFilePath('/uploads/marketing/org/instagram/photo.jpg')).toMatch(/marketing\/org\/instagram\/photo\.jpg$/);
    expect(localMarketingFilePath('/uploads/marketing/../secret.jpg')).toBeNull();
    expect(localMarketingFilePath('https://cdn.example.com/a.jpg')).toBeNull();
  });
});
