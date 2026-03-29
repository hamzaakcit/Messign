import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  clearCalibrationCache,
  setCachedCalibration,
} from '../../../services/marketing/calibrationCache.js';
import { resolveCalibrationPrompt } from '../../../services/marketing/calibrationResolver.js';

vi.mock('../../../db/index.js', () => ({
  query: vi.fn(),
}));

vi.mock('../../../dal/marketing/calibrationSnapshots.js', () => ({
  getLatestCalibrationSnapshot: vi.fn().mockResolvedValue(null),
}));

describe('resolveCalibrationPrompt', () => {
  beforeEach(() => {
    clearCalibrationCache();
    vi.clearAllMocks();
  });

  it('returns cached result on cache hit (no DB call)', async () => {
    setCachedCalibration('org-1', 'email', {
      text: 'Cached calibration',
      generatedAt: new Date().toISOString(),
      basedOnRecords: 15,
    });

    const { query } = await import('../../../db/index.js');

    const result = await resolveCalibrationPrompt(
      'org-1',
      'email',
      undefined,
    );
    expect(result.text).toBe('Cached calibration');
    expect(query).not.toHaveBeenCalled();
  });

  it('queries DB on cache miss and caches the result', async () => {
    const { query } = await import('../../../db/index.js');
    const mockQuery = vi.mocked(query);

    // COUNT query → 0 records (will return fallback prompt)
    mockQuery.mockResolvedValueOnce({ rows: [{ total: '0' }] } as never);

    const result = await resolveCalibrationPrompt(
      'org-miss',
      'email',
      undefined,
    );

    expect(mockQuery).toHaveBeenCalled();
    expect(result.text).toContain('No historical performance data');
    expect(result.basedOnRecords).toBe(0);

    // Second call should hit cache
    mockQuery.mockClear();
    const cached = await resolveCalibrationPrompt(
      'org-miss',
      'email',
      undefined,
    );
    expect(cached.text).toBe(result.text);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('uses different cache keys for different channels', async () => {
    setCachedCalibration('org-1', 'email', {
      text: 'Email data',
      generatedAt: '',
      basedOnRecords: 10,
    });
    setCachedCalibration('org-1', 'twitter', {
      text: 'Twitter data',
      generatedAt: '',
      basedOnRecords: 5,
    });

    const email = await resolveCalibrationPrompt('org-1', 'email', undefined);
    const twitter = await resolveCalibrationPrompt(
      'org-1',
      'twitter',
      undefined,
    );

    expect(email.text).toBe('Email data');
    expect(twitter.text).toBe('Twitter data');
  });
});
