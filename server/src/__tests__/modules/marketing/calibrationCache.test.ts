import { describe, it, expect, beforeEach } from 'vitest';
import {
  buildCacheKey,
  getCachedCalibration,
  setCachedCalibration,
  invalidateCalibrationCache,
  clearCalibrationCache,
  getCalibrationCacheStats,
} from '../../../services/marketing/calibrationCache.js';

describe('buildCacheKey', () => {
  it('builds key from org + channel', () => {
    expect(buildCacheKey('org-1', 'email')).toBe('org-1:email');
  });

  it('includes brand profile when provided', () => {
    expect(buildCacheKey('org-1', 'email', 'bp-1')).toBe('org-1:email:bp-1');
  });

  it('excludes brand profile when undefined', () => {
    expect(buildCacheKey('org-1', 'twitter', undefined)).toBe('org-1:twitter');
  });
});

describe('calibration cache operations', () => {
  beforeEach(() => {
    clearCalibrationCache();
  });

  it('returns null for uncached key', () => {
    expect(getCachedCalibration('org-1', 'email')).toBeNull();
  });

  it('stores and retrieves a calibration prompt', () => {
    const prompt = {
      text: 'Calibration data',
      generatedAt: new Date().toISOString(),
      basedOnRecords: 20,
    };
    setCachedCalibration('org-1', 'email', prompt);
    const cached = getCachedCalibration('org-1', 'email');
    expect(cached).not.toBeNull();
    expect(cached!.text).toBe('Calibration data');
    expect(cached!.basedOnRecords).toBe(20);
  });

  it('different channels have separate cache entries', () => {
    const emailPrompt = {
      text: 'Email calibration',
      generatedAt: '',
      basedOnRecords: 10,
    };
    const twitterPrompt = {
      text: 'Twitter calibration',
      generatedAt: '',
      basedOnRecords: 5,
    };
    setCachedCalibration('org-1', 'email', emailPrompt);
    setCachedCalibration('org-1', 'twitter', twitterPrompt);

    expect(getCachedCalibration('org-1', 'email')!.text).toBe(
      'Email calibration',
    );
    expect(getCachedCalibration('org-1', 'twitter')!.text).toBe(
      'Twitter calibration',
    );
  });

  it('different brand profiles have separate cache entries', () => {
    const bp1 = { text: 'Brand 1', generatedAt: '', basedOnRecords: 8 };
    const bp2 = { text: 'Brand 2', generatedAt: '', basedOnRecords: 12 };
    setCachedCalibration('org-1', 'email', bp1, 'bp-1');
    setCachedCalibration('org-1', 'email', bp2, 'bp-2');

    expect(getCachedCalibration('org-1', 'email', 'bp-1')!.text).toBe(
      'Brand 1',
    );
    expect(getCachedCalibration('org-1', 'email', 'bp-2')!.text).toBe(
      'Brand 2',
    );
  });

  it('expires after TTL', async () => {
    const prompt = {
      text: 'Short-lived',
      generatedAt: '',
      basedOnRecords: 5,
    };
    setCachedCalibration('org-1', 'email', prompt, undefined, 1);

    await new Promise((r) => setTimeout(r, 10));
    expect(getCachedCalibration('org-1', 'email')).toBeNull();
  });
});

describe('invalidateCalibrationCache', () => {
  beforeEach(() => {
    clearCalibrationCache();
  });

  it('invalidates all entries for an org when no channel specified', () => {
    setCachedCalibration('org-1', 'email', {
      text: 'a',
      generatedAt: '',
      basedOnRecords: 1,
    });
    setCachedCalibration('org-1', 'twitter', {
      text: 'b',
      generatedAt: '',
      basedOnRecords: 1,
    });
    setCachedCalibration('org-2', 'email', {
      text: 'c',
      generatedAt: '',
      basedOnRecords: 1,
    });

    const count = invalidateCalibrationCache('org-1');
    expect(count).toBe(2);
    expect(getCachedCalibration('org-1', 'email')).toBeNull();
    expect(getCachedCalibration('org-1', 'twitter')).toBeNull();
    expect(getCachedCalibration('org-2', 'email')).not.toBeNull();
  });

  it('invalidates only specified channel when channel provided', () => {
    setCachedCalibration('org-1', 'email', {
      text: 'a',
      generatedAt: '',
      basedOnRecords: 1,
    });
    setCachedCalibration('org-1', 'twitter', {
      text: 'b',
      generatedAt: '',
      basedOnRecords: 1,
    });

    const count = invalidateCalibrationCache('org-1', 'email');
    expect(count).toBe(1);
    expect(getCachedCalibration('org-1', 'email')).toBeNull();
    expect(getCachedCalibration('org-1', 'twitter')).not.toBeNull();
  });

  it('returns 0 when nothing to invalidate', () => {
    expect(invalidateCalibrationCache('nonexistent')).toBe(0);
  });
});

describe('getCalibrationCacheStats', () => {
  beforeEach(() => {
    clearCalibrationCache();
  });

  it('returns empty stats for empty cache', () => {
    const stats = getCalibrationCacheStats();
    expect(stats.size).toBe(0);
    expect(stats.entries).toHaveLength(0);
  });

  it('returns correct size and entries', () => {
    setCachedCalibration('org-1', 'email', {
      text: 'a',
      generatedAt: '',
      basedOnRecords: 1,
    });
    setCachedCalibration('org-2', 'email', {
      text: 'b',
      generatedAt: '',
      basedOnRecords: 1,
    });

    const stats = getCalibrationCacheStats();
    expect(stats.size).toBe(2);
    expect(stats.entries).toHaveLength(2);
    expect(stats.entries[0].expiresIn).toBeGreaterThan(3500);
  });
});

describe('clearCalibrationCache', () => {
  it('removes all entries', () => {
    setCachedCalibration('org-1', 'email', {
      text: 'a',
      generatedAt: '',
      basedOnRecords: 1,
    });
    setCachedCalibration('org-2', 'twitter', {
      text: 'b',
      generatedAt: '',
      basedOnRecords: 1,
    });

    clearCalibrationCache();
    expect(getCalibrationCacheStats().size).toBe(0);
  });
});
