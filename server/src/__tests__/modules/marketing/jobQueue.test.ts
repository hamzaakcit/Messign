import { describe, it, expect } from 'vitest';
import { isJobQueueUnavailableError } from '../../../services/jobQueue.js';

describe('isJobQueueUnavailableError', () => {
  it('returns true for pg-boss not initialized message', () => {
    expect(
      isJobQueueUnavailableError(new Error('[JobQueue] pg-boss not initialized. Call startJobQueue() first.')),
    ).toBe(true);
  });

  it('returns false for unrelated errors', () => {
    expect(isJobQueueUnavailableError(new Error('Failed to enqueue scrape'))).toBe(false);
  });

  it('returns false for non-Error values', () => {
    expect(isJobQueueUnavailableError(null)).toBe(false);
  });
});
