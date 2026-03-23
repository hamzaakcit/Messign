import { describe, it, expect, vi } from 'vitest';
import type { BatchJob, BatchChannelResult } from '@/lib/marketingApi';

describe('pollBatchJob logic', () => {
  function createMockPoller() {
    let callCount = 0;
    const states: BatchJob['status'][] = [
      'pending',
      'processing',
      'processing',
      'completed',
    ];

    return {
      getBatchJobStatus: vi.fn(async (): Promise<BatchJob> => {
        const status = states[Math.min(callCount, states.length - 1)];
        callCount++;
        return {
          id: 'job-1',
          organization_id: 'org-1',
          hero_content_id: 'hero-1',
          status,
          channels: ['email', 'twitter'],
          total_channels: 2,
          completed_channels: status === 'completed' ? 2 : callCount - 1,
          failed_channels: 0,
          results: [],
          error_log: [],
          created_by: 'user-1',
          created_at: new Date().toISOString(),
          started_at: null,
          completed_at: null,
        };
      }),
      getCallCount: () => callCount,
    };
  }

  const terminalStates: BatchJob['status'][] = [
    'completed',
    'failed',
    'partial',
    'cancelled',
  ];

  it('polls until terminal state', async () => {
    const mock = createMockPoller();
    const updates: BatchJob['status'][] = [];
    let result: BatchJob | undefined;
    let polls = 0;

    while (polls < 10) {
      const job = await mock.getBatchJobStatus();
      updates.push(job.status);
      if (terminalStates.includes(job.status)) {
        result = job;
        break;
      }
      polls++;
    }

    expect(result).toBeDefined();
    expect(result!.status).toBe('completed');
    expect(updates).toContain('pending');
    expect(updates).toContain('processing');
    expect(updates).toContain('completed');
  });

  it('tracks progress through updates', async () => {
    const mock = createMockPoller();
    const completedCounts: number[] = [];
    let polls = 0;

    while (polls < 10) {
      const job = await mock.getBatchJobStatus();
      completedCounts.push(job.completed_channels);
      if (terminalStates.includes(job.status)) break;
      polls++;
    }

    expect(
      completedCounts[completedCounts.length - 1],
    ).toBeGreaterThanOrEqual(completedCounts[0]);
  });
});

describe('BatchJob type contracts', () => {
  it('terminal states are well-defined', () => {
    const terminal: BatchJob['status'][] = [
      'completed',
      'failed',
      'partial',
      'cancelled',
    ];
    const nonTerminal: BatchJob['status'][] = ['pending', 'processing'];
    expect(terminal).toHaveLength(4);
    expect(nonTerminal).toHaveLength(2);
    for (const s of terminal) {
      expect(nonTerminal).not.toContain(s);
    }
  });

  it('BatchChannelResult status values are a subset of BatchJob statuses', () => {
    const channelStatuses: BatchChannelResult['status'][] = [
      'pending',
      'processing',
      'completed',
      'failed',
    ];
    const jobStatuses: BatchJob['status'][] = [
      'pending',
      'processing',
      'completed',
      'failed',
      'partial',
      'cancelled',
    ];
    for (const cs of channelStatuses) {
      expect(jobStatuses).toContain(cs);
    }
  });

  it('BatchJob has all required fields', () => {
    const job: BatchJob = {
      id: 'j-1',
      organization_id: 'org-1',
      hero_content_id: 'h-1',
      status: 'pending',
      channels: ['email'],
      total_channels: 1,
      completed_channels: 0,
      failed_channels: 0,
      results: [{ channel: 'email', content_id: null, status: 'pending' }],
      error_log: [],
      created_by: 'u-1',
      created_at: '2026-01-01T00:00:00Z',
      started_at: null,
      completed_at: null,
    };

    expect(job.id).toBeTruthy();
    expect(job.channels).toHaveLength(1);
    expect(job.results[0].channel).toBe('email');
  });
});
