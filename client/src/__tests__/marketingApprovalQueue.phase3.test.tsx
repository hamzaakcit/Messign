import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, renderHook, act } from '@testing-library/react';
import { TelemetryPanel } from '@/pages/marketing/components/approval/TelemetryPanel';
import type { ApprovalQueueItem } from '@/pages/marketing/approvalQueue/types';
import { useMarketingApprovalQueue } from '@/hooks/useMarketingApprovalQueue';
import type { MarketingApprovalApiRow } from '@/pages/marketing/approvalQueue/mapApiApprovalToUi';

const { listMock, submitMock } = vi.hoisted(() => ({
  listMock: vi.fn(),
  submitMock: vi.fn(),
}));

vi.mock('@/lib/marketingApi', () => ({
  marketingAPI: {
    listApprovals: listMock,
    submitApprovalReview: submitMock,
  },
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    message: vi.fn(),
  },
}));

describe('Phase 3 Approval Queue — UX matrix', () => {
  beforeEach(() => {
    listMock.mockReset();
    submitMock.mockReset();
    listMock.mockResolvedValue([]);
    submitMock.mockResolvedValue({
      approval_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      content_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      content_status: 'draft',
    });
  });

  it('UX-01: renders compliance WARNING text and brand score 85 in TelemetryPanel', () => {
    const item: ApprovalQueueItem = {
      id: 'q1',
      title: 'Test',
      targetChannel: 'linkedin',
      campaignName: 'C1',
      campaignId: 'c1',
      submittedAt: new Date().toISOString(),
      userBrief: 'Brief',
      body: 'Body',
      brandVoiceScore: 85,
      productTruth: {
        verdict: 'PASS',
        checks: {
          feature_references: { status: 'PASS', details: null },
          blocked_claims: { status: 'PASS', details: null },
          fabricated_metrics: { status: 'PASS', details: null },
          superlatives: { status: 'PASS', details: null },
          glossary_compliance: { status: 'PASS', details: null },
        },
        failed_reasons: [],
        features_referenced: [],
        metrics_found: [],
      },
      brandVoice: {
        score: 85,
        dimensions: {
          tone_voice: 17,
          clarity_structure: 17,
          audience_positioning: 17,
          claims_proof_safety: 17,
          taboo_policy: 17,
        },
        strengths: [],
        improvements: [],
        taboo_violations: [],
        anti_example_matches: [],
        passes: true,
      },
      compliance: {
        verdict: 'WARNING',
        warnings: [
          {
            check: 'performance_claims',
            severity: 'HIGH',
            location: 'paragraph 2',
            issue: 'Guaranteed revenue doubling',
            suggestion: 'Use directional language.',
          },
        ],
        warning_count: { high: 1, medium: 0, low: 0 },
        channel_specific_issues: [],
      },
    };

    render(<TelemetryPanel item={item} />);

    expect(screen.getByTestId('telemetry-brand-score')).toHaveTextContent('85');
    expect(screen.getByTestId('telemetry-compliance-high-issue')).toHaveTextContent('Guaranteed revenue doubling');
  });

  it('UX-02: requestRevision sends rejected payload with needs_polish and feedback', async () => {
    listMock.mockResolvedValue([]);
    const { result } = renderHook(() => useMarketingApprovalQueue('user-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.requestRevision('appr-rev', {
        reason: 'needs_polish',
        feedback: 'Make it punchier',
      });
    });

    expect(submitMock).toHaveBeenCalledWith('user-1', 'appr-rev', {
      status: 'rejected',
      rejection_reason: 'needs_polish',
      feedback: 'Make it punchier',
    });
  });

  it('UX-03: approve calls API with approved status and removes item optimistically', async () => {
    const row: MarketingApprovalApiRow = {
      id: 'appr-ux3',
      content_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      status: 'pending',
      truth_validation: { verdict: 'PASS', checks: {}, failed_reasons: [], features_referenced: [], metrics_found: [] },
      brand_voice_check: { score: 90, dimensions: {}, strengths: [], improvements: [], taboo_violations: [], anti_example_matches: [] },
      compliance_scan: { verdict: 'PASS', warnings: [], warning_count: { high: 0, medium: 0, low: 0 }, channel_specific_issues: [] },
      content_title: 'UX3',
      content_body: 'Hello',
      user_brief: 'Brief',
      content_type: 'social_post',
      content_channel: 'linkedin',
      campaign_id: null,
      campaign_name: 'Camp',
      submitted_at: new Date().toISOString(),
    };
    listMock.mockResolvedValue([row]);

    const { result } = renderHook(() => useMarketingApprovalQueue('user-2'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.items).toHaveLength(1);

    await act(async () => {
      await result.current.approve('appr-ux3');
    });

    expect(submitMock).toHaveBeenCalledWith('user-2', 'appr-ux3', { status: 'approved' });
    await waitFor(() => expect(result.current.items).toHaveLength(0));
  });
});
