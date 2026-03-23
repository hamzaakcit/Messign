import { describe, it, expect, vi, beforeEach } from 'vitest';

const executeContentWorkflow = vi.fn().mockResolvedValue({
  status: 'completed',
  contentId: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
  draft: 'revised',
  approvalId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  attempts: 1,
  truth: { verdict: 'PASS' },
  brandVoice: { score: 80 },
  compliance: { verdict: 'PASS' },
});

vi.mock('../../../events/index.js', () => ({
  eventBus: { emit: vi.fn() },
}));

vi.mock('../../../services/ai/marketing/marketingContentWorkflow.js', () => ({
  executeContentWorkflow: (...args: unknown[]) => executeContentWorkflow(...args),
}));

vi.mock('../../../dal/marketing/approvalsQueue.js', () => ({
  getApprovalById: vi.fn(),
  updateApprovalReview: vi.fn(),
}));

vi.mock('../../../dal/marketing/content.js', () => ({
  getContentById: vi.fn(),
  updateContent: vi.fn(),
}));

import { submitReview } from '../../../controllers/marketingToolsController.js';
import * as approvalsDal from '../../../dal/marketing/approvalsQueue.js';
import * as contentDal from '../../../dal/marketing/content.js';

const ctx = {
  userId: '11111111-1111-1111-1111-111111111111',
  role: 'manager' as const,
  organizationId: '22222222-2222-2222-2222-222222222222',
};

describe('submitReview Phase 3 — revision workflow', () => {
  beforeEach(() => {
    vi.mocked(approvalsDal.getApprovalById).mockResolvedValue({
      id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      organization_id: ctx.organizationId!,
      content_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      status: 'pending',
      truth_validation: null,
      brand_voice_check: null,
      compliance_scan: null,
      reviewer_feedback: null,
      rejection_reason: null,
      reviewed_by: null,
      reviewed_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    vi.mocked(approvalsDal.updateApprovalReview).mockResolvedValue({
      id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      organization_id: ctx.organizationId!,
      content_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      status: 'rejected',
      truth_validation: null,
      brand_voice_check: null,
      compliance_scan: null,
      reviewer_feedback: 'Make it punchier',
      rejection_reason: 'needs_polish',
      reviewed_by: ctx.userId,
      reviewed_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    vi.mocked(contentDal.getContentById).mockResolvedValue({
      id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      organization_id: ctx.organizationId!,
      campaign_id: null,
      title: 'Test content',
      content_type: 'social_post',
      channel: 'linkedin',
      status: 'in_review',
      body: 'v1 draft',
      body_html: null,
      body_design: null,
      scheduled_date: null,
      scheduled_time: null,
      published_at: null,
      author_id: null,
      reviewer_id: null,
      tags: [],
      views: 0,
      engagement: 0,
      click_throughs: 0,
      leads_attributed: 0,
      knowledge_doc_id: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      user_brief: 'Original launch brief',
      revision_history: [],
    });
    vi.mocked(contentDal.updateContent).mockResolvedValue({
      id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      organization_id: ctx.organizationId!,
      campaign_id: null,
      title: 'Test content',
      content_type: 'social_post',
      channel: 'linkedin',
      status: 'draft',
      body: 'v1 draft',
      body_html: null,
      body_design: null,
      scheduled_date: null,
      scheduled_time: null,
      published_at: null,
      author_id: null,
      reviewer_id: null,
      tags: [],
      views: 0,
      engagement: 0,
      click_throughs: 0,
      leads_attributed: 0,
      knowledge_doc_id: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      user_brief: 'Original launch brief',
      revision_history: [],
    });
    executeContentWorkflow.mockClear();
  });

  it('UX-02 backend: schedules executeContentWorkflow with human feedback on reject', async () => {
    const result = await submitReview(ctx, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', {
      status: 'rejected',
      feedback: 'Make it punchier',
      rejection_reason: 'needs_polish',
    });

    expect(result.ok).toBe(true);
    expect(executeContentWorkflow).toHaveBeenCalledTimes(1);
    const call = executeContentWorkflow.mock.calls[0];
    expect(call[0]).toContain('Original launch brief');
    expect(call[0]).toContain('Make it punchier');
    expect(call[0]).toContain('needs_polish');
    expect(call[0]).toContain('The human reviewer rejected this draft');
  });
});
