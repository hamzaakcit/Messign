import { describe, it, expect } from 'vitest';
import {
  isBlockedImageHost,
  validateInstagramImageUrlStruct,
} from '../../../services/marketing/publishing/adapters/instagramImageUrl.js';

describe('instagramImageUrl', () => {
  it('validateInstagramImageUrlStruct accepts public https URLs', () => {
    const r = validateInstagramImageUrlStruct('https://example.com/x/photo.png');
    expect(r.ok).toBe(true);
  });

  it('rejects mock storage host', () => {
    const r = validateInstagramImageUrlStruct('https://storage.mock.local/bucket/key.png');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/mock|non-public/i);
  });

  it('rejects plain text', () => {
    const r = validateInstagramImageUrlStruct('Flying red paperplane in a big office Square 1:1');
    expect(r.ok).toBe(false);
  });

  it('rejects http', () => {
    const r = validateInstagramImageUrlStruct('http://example.com/a.png');
    expect(r.ok).toBe(false);
  });

  it('isBlockedImageHost', () => {
    expect(isBlockedImageHost('storage.mock.local')).toBe(true);
    expect(isBlockedImageHost('xyz.supabase.co')).toBe(false);
  });
});
