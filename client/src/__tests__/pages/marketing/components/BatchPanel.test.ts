import { describe, it, expect } from 'vitest';
import {
  BATCH_CHANNELS,
  CHANNEL_LABELS,
  getDefaultSelectedChannels,
  getAtomizeButtonText,
  formatElapsedTime,
  getResultStatusHeader,
  getRetryableChannels,
  getProgressPercentage,
} from '@/pages/marketing/lib/batchUtils';

describe('Channel selection', () => {
  it('pre-checks all except hero channel', () => {
    expect(getDefaultSelectedChannels('email')).toEqual([
      'twitter',
      'instagram',
      'linkedin',
      'sms',
    ]);
  });
  it('pre-checks all when hero not in batch list', () => {
    expect(getDefaultSelectedChannels('blog')).toEqual([...BATCH_CHANNELS]);
  });
  it('5 channels total', () => {
    expect(BATCH_CHANNELS).toHaveLength(5);
  });
});

describe('Channel labels', () => {
  it('all 5 have labels', () => {
    expect(Object.keys(CHANNEL_LABELS)).toHaveLength(5);
  });
  it('labels are distinct', () => {
    expect(new Set(Object.values(CHANNEL_LABELS)).size).toBe(5);
  });
});

describe('Button text', () => {
  it('shows count', () => {
    expect(getAtomizeButtonText(3)).toBe('Atomize to 3 Channels');
  });
  it('singular', () => {
    expect(getAtomizeButtonText(1)).toBe('Atomize to 1 Channel');
  });
  it('zero', () => {
    expect(getAtomizeButtonText(0)).toBe('Select channels');
  });
});

describe('Progress', () => {
  it('calculates correctly', () => {
    expect(getProgressPercentage(3, 5)).toBe(60);
    expect(getProgressPercentage(5, 5)).toBe(100);
    expect(getProgressPercentage(0, 0)).toBe(0);
  });
});

describe('Elapsed time', () => {
  it('seconds format', () => {
    expect(
      formatElapsedTime(new Date(Date.now() - 30000).toISOString()),
    ).toMatch(/^\d+s$/);
  });
  it('minutes format', () => {
    expect(
      formatElapsedTime(new Date(Date.now() - 90000).toISOString()),
    ).toMatch(/^\d+m \d+s$/);
  });
});

describe('Status header', () => {
  it('completed=green', () => {
    expect(getResultStatusHeader('completed').color).toBe('green');
  });
  it('partial=amber', () => {
    expect(getResultStatusHeader('partial').color).toBe('amber');
  });
  it('failed=red', () => {
    expect(getResultStatusHeader('failed').color).toBe('red');
  });
  it('cancelled=gray', () => {
    expect(getResultStatusHeader('cancelled').color).toBe('gray');
  });
});

describe('Retryable channels', () => {
  it('only failed', () => {
    expect(
      getRetryableChannels([
        { channel: 'email', status: 'completed' },
        { channel: 'twitter', status: 'failed' },
        { channel: 'linkedin', status: 'failed' },
      ]),
    ).toEqual(['twitter', 'linkedin']);
  });
  it('empty when none failed', () => {
    expect(
      getRetryableChannels([{ channel: 'email', status: 'completed' }]),
    ).toEqual([]);
  });
});

describe('State machine', () => {
  type S = 'select' | 'processing' | 'results';
  const next = (c: S, e: string): S => {
    if (c === 'select' && e === 'submit') return 'processing';
    if (c === 'processing' && (e === 'complete' || e === 'cancel'))
      return 'results';
    return c;
  };
  it('select→processing', () => {
    expect(next('select', 'submit')).toBe('processing');
  });
  it('processing→results', () => {
    expect(next('processing', 'complete')).toBe('results');
  });
  it('cancel→results', () => {
    expect(next('processing', 'cancel')).toBe('results');
  });
  it('stays on unknown', () => {
    expect(next('select', 'x')).toBe('select');
  });
});
