import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { usePipeline } from '@/hooks/usePipeline';

const mockListPipelines = vi.fn();
const mockGetPipeline = vi.fn();
const mockGetDealsByStage = vi.fn();
const mockGetMetrics = vi.fn();

vi.mock('@/stores/authStore', () => ({
  useAuthStore: vi.fn(() => ({ user: { authUserId: 'user-1', id: 'user-1' } })),
}));

vi.mock('@/lib/crmApi', () => ({
  crmAPI: {
    listPipelines: (...args: unknown[]) => mockListPipelines(...args),
    getPipeline: (...args: unknown[]) => mockGetPipeline(...args),
    getDealsByStage: (...args: unknown[]) => mockGetDealsByStage(...args),
    getMetrics: (...args: unknown[]) => mockGetMetrics(...args),
  },
}));

describe('usePipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListPipelines.mockResolvedValue([
      { id: 'p-first', name: 'First', is_default: false },
      { id: 'p-def', name: 'Default', is_default: true },
    ]);
    mockGetPipeline.mockResolvedValue({
      id: 'p-def',
      stages: [
        { id: 's1', name: 'Lead', position: 0, probability_default: 10, is_won: false, is_lost: false },
      ],
    });
    mockGetDealsByStage.mockResolvedValue({ s1: [] });
    mockGetMetrics.mockResolvedValue({
      totalPipeline: 0,
      weightedPipeline: 0,
      dealsWon: 0,
      dealsLost: 0,
      avgDealSize: 0,
      winRate: 0,
      avgCycleTime: 0,
    });
  });

  it('selects default pipeline when multiple pipelines exist', async () => {
    const { result } = renderHook(() => usePipeline());

    await waitFor(() => {
      expect(result.current.activePipelineId).toBe('p-def');
    });

    expect(mockGetPipeline).toHaveBeenCalledWith('user-1', 'p-def');
    expect(mockGetDealsByStage).toHaveBeenCalledWith('user-1', 'p-def');
  });
});
