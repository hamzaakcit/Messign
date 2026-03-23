import { describe, it, expect } from 'vitest';
import {
  isValidChannel,
  VALID_BATCH_CHANNELS,
  computeOverallStatus,
} from '../../../services/marketing/batchService.js';
import type {
  BatchChannelResult,
  BatchJobStatus,
} from '../../../services/marketing/batchService.js';
import { JOB_NAMES } from '../../../services/jobQueue.js';

describe('Channel Validation', () => {
  it('validates all 5 supported channels', () => {
    expect(isValidChannel('email')).toBe(true);
    expect(isValidChannel('twitter')).toBe(true);
    expect(isValidChannel('instagram')).toBe(true);
    expect(isValidChannel('linkedin')).toBe(true);
    expect(isValidChannel('sms')).toBe(true);
  });

  it('rejects invalid channels', () => {
    expect(isValidChannel('facebook')).toBe(false);
    expect(isValidChannel('tiktok')).toBe(false);
    expect(isValidChannel('')).toBe(false);
    expect(isValidChannel('EMAIL')).toBe(false);
  });

  it('VALID_BATCH_CHANNELS has exactly 5 entries', () => {
    expect(VALID_BATCH_CHANNELS).toHaveLength(5);
  });
});

describe('BatchChannelResult type conformance', () => {
  it('captures all channel result states', () => {
    const pending: BatchChannelResult = {
      channel: 'email',
      content_id: null,
      status: 'pending',
    };
    const processing: BatchChannelResult = {
      channel: 'twitter',
      content_id: null,
      status: 'processing',
      started_at: new Date().toISOString(),
    };
    const completed: BatchChannelResult = {
      channel: 'linkedin',
      content_id: 'c-123',
      status: 'completed',
      completed_at: new Date().toISOString(),
    };
    const failed: BatchChannelResult = {
      channel: 'sms',
      content_id: null,
      status: 'failed',
      error: 'Rate limited',
    };

    expect(pending.status).toBe('pending');
    expect(processing.started_at).toBeDefined();
    expect(completed.content_id).toBe('c-123');
    expect(failed.error).toContain('Rate limited');
  });
});

describe('computeOverallStatus', () => {
  it('all completed -> completed', () => {
    const results: BatchChannelResult[] = [
      { channel: 'email', content_id: 'c1', status: 'completed' },
      { channel: 'twitter', content_id: 'c2', status: 'completed' },
    ];
    expect(computeOverallStatus(results, 2, 'processing')).toBe('completed');
  });

  it('all failed -> failed', () => {
    const results: BatchChannelResult[] = [
      { channel: 'email', content_id: null, status: 'failed', error: 'err' },
      { channel: 'twitter', content_id: null, status: 'failed', error: 'err' },
    ];
    expect(computeOverallStatus(results, 2, 'processing')).toBe('failed');
  });

  it('mixed completed and failed -> partial', () => {
    const results: BatchChannelResult[] = [
      { channel: 'email', content_id: 'c1', status: 'completed' },
      { channel: 'twitter', content_id: null, status: 'failed', error: 'err' },
    ];
    expect(computeOverallStatus(results, 2, 'processing')).toBe('partial');
  });

  it('some still processing -> processing', () => {
    const results: BatchChannelResult[] = [
      { channel: 'email', content_id: 'c1', status: 'completed' },
      { channel: 'twitter', content_id: null, status: 'processing' },
    ];
    expect(computeOverallStatus(results, 2, 'processing')).toBe('processing');
  });

  it('all pending -> processing (not yet started)', () => {
    const results: BatchChannelResult[] = [
      { channel: 'email', content_id: null, status: 'pending' },
      { channel: 'twitter', content_id: null, status: 'pending' },
    ];
    expect(computeOverallStatus(results, 2, 'processing')).toBe('processing');
  });

  it('preserves cancelled status regardless of results', () => {
    const results: BatchChannelResult[] = [
      { channel: 'email', content_id: 'c1', status: 'completed' },
      { channel: 'twitter', content_id: null, status: 'pending' },
    ];
    expect(computeOverallStatus(results, 2, 'cancelled')).toBe('cancelled');
  });

  it('single channel completed -> completed', () => {
    const results: BatchChannelResult[] = [
      { channel: 'email', content_id: 'c1', status: 'completed' },
    ];
    expect(computeOverallStatus(results, 1, 'processing')).toBe('completed');
  });

  it('single channel failed -> failed', () => {
    const results: BatchChannelResult[] = [
      { channel: 'email', content_id: null, status: 'failed', error: 'err' },
    ];
    expect(computeOverallStatus(results, 1, 'processing')).toBe('failed');
  });

  it('3 completed + 2 failed -> partial', () => {
    const results: BatchChannelResult[] = [
      { channel: 'email', content_id: 'c1', status: 'completed' },
      { channel: 'twitter', content_id: 'c2', status: 'completed' },
      { channel: 'instagram', content_id: 'c3', status: 'completed' },
      { channel: 'linkedin', content_id: null, status: 'failed', error: 'err' },
      { channel: 'sms', content_id: null, status: 'failed', error: 'err' },
    ];
    expect(computeOverallStatus(results, 5, 'processing')).toBe('partial');
  });
});

describe('Job Queue constants', () => {
  it('JOB_NAMES includes batch generate', () => {
    expect(JOB_NAMES.BATCH_GENERATE).toBe('marketing:batch-generate');
  });
});
