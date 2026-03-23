import { describe, it, expect } from 'vitest';
import {
  BATCH_CHANNEL_META,
  BATCH_STATUS_META,
  calculateBatchProgress,
  formatBatchDuration,
  canRetryChannel,
  hasContentLink,
} from '@/pages/marketing/lib/batchUtils';

describe('E2E: Batch Utils Complete Coverage', () => {
  it('all 5 channels have metadata', () => {
    const channels = ['email', 'twitter', 'instagram', 'linkedin', 'sms'];
    for (const ch of channels) {
      expect(BATCH_CHANNEL_META[ch]).toBeDefined();
      expect(BATCH_CHANNEL_META[ch].displayName).toBeTruthy();
      expect(BATCH_CHANNEL_META[ch].description).toBeTruthy();
    }
    expect(Object.keys(BATCH_CHANNEL_META).sort()).toEqual(channels.sort());
  });

  it('all 6 statuses have metadata', () => {
    for (const s of [
      'pending',
      'processing',
      'completed',
      'failed',
      'partial',
      'cancelled',
    ]) {
      expect(BATCH_STATUS_META[s]).toBeDefined();
      expect(BATCH_STATUS_META[s].label).toBeTruthy();
    }
  });

  it('progress edge cases', () => {
    expect(calculateBatchProgress(0, 0, 0)).toBe(0);
    expect(calculateBatchProgress(0, 0, 5)).toBe(0);
    expect(calculateBatchProgress(5, 0, 5)).toBe(100);
    expect(calculateBatchProgress(3, 2, 5)).toBe(100);
    expect(calculateBatchProgress(2, 1, 5)).toBe(60);
    expect(calculateBatchProgress(1, 0, 3)).toBe(33);
  });

  it('duration formatting', () => {
    expect(
      formatBatchDuration('2026-03-23T10:00:00Z', '2026-03-23T10:00:45Z'),
    ).toContain('45');
    expect(
      formatBatchDuration('2026-03-23T10:00:00Z', '2026-03-23T10:02:15Z'),
    ).toContain('2');
    expect(formatBatchDuration(null, null)).toBe('');
  });

  it('retry only for failed', () => {
    expect(canRetryChannel('failed')).toBe(true);
    expect(canRetryChannel('completed')).toBe(false);
    expect(canRetryChannel('processing')).toBe(false);
  });

  it('content link only for completed with id', () => {
    expect(hasContentLink('completed', 'c-1')).toBe(true);
    expect(hasContentLink('completed', null)).toBe(false);
    expect(hasContentLink('failed', 'c-1')).toBe(false);
  });

  it('email channel signals VA2 in description', () => {
    expect(BATCH_CHANNEL_META.email.description).toContain('VA2');
  });
});
