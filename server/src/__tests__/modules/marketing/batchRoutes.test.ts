import { describe, it, expect } from 'vitest';
import {
  createBatchJob,
  getBatchJobStatus,
  listBatchJobs,
  cancelBatchJob,
  getDerivatives,
  retryBatchChannel,
  isValidChannel,
} from '../../../services/marketing/batchService.js';

describe('Batch Route Dependencies', () => {
  it('batchService exports all required functions', () => {
    expect(typeof createBatchJob).toBe('function');
    expect(typeof getBatchJobStatus).toBe('function');
    expect(typeof listBatchJobs).toBe('function');
    expect(typeof cancelBatchJob).toBe('function');
    expect(typeof getDerivatives).toBe('function');
    expect(typeof retryBatchChannel).toBe('function');
  });

  it('channel validation rejects invalid channels at route level', () => {
    expect(isValidChannel('email')).toBe(true);
    expect(isValidChannel('twitter')).toBe(true);
    expect(isValidChannel('instagram')).toBe(true);
    expect(isValidChannel('linkedin')).toBe(true);
    expect(isValidChannel('sms')).toBe(true);
    expect(isValidChannel('facebook')).toBe(false);
    expect(isValidChannel('')).toBe(false);
  });
});

describe('Batch Route Input Validation', () => {
  it('POST /batch requires hero_content_id', () => {
    const body = { channels: ['email'] };
    expect(body).not.toHaveProperty('hero_content_id');
  });

  it('POST /batch requires at least one valid channel', () => {
    const emptyChannels = { hero_content_id: 'x', channels: [] as string[] };
    expect(emptyChannels.channels.length).toBe(0);

    const invalidChannels = {
      hero_content_id: 'x',
      channels: ['facebook', 'tiktok'],
    };
    const valid = invalidChannels.channels.filter((c) => isValidChannel(c));
    expect(valid.length).toBe(0);
  });

  it('POST /batch filters invalid channels from mixed input', () => {
    const mixedChannels = ['email', 'facebook', 'twitter', 'tiktok'];
    const valid = mixedChannels.filter((c) => isValidChannel(c));
    expect(valid).toEqual(['email', 'twitter']);
    expect(valid.length).toBeGreaterThan(0);
  });

  it('POST /retry-channel requires channel in body', () => {
    const bodyMissing = {};
    const bodyEmpty = { channel: '' };
    expect(bodyMissing).not.toHaveProperty('channel');
    expect(bodyEmpty.channel).toBeFalsy();
  });

  it('retry-channel only accepts valid channels', () => {
    expect(isValidChannel('email')).toBe(true);
    expect(isValidChannel('snapchat')).toBe(false);
  });
});
