import { describe, it, expect, vi, beforeEach } from 'vitest';
import type {
  ProductTruthValidationResult,
  RunProductTruthValidationOptions,
} from '../../../services/ai/marketing/productTruthValidator.js';
import type { BrandVoiceCheckResult } from '../../../services/ai/marketing/brandVoiceChecker.js';
import type { ComplianceScanResult } from '../../../services/ai/marketing/complianceScanner.js';
import {
  executeContentWorkflow,
  type MarketingContentWorkflowContext,
} from '../../../services/ai/marketing/marketingContentWorkflow.js';
import type { LLMGatewayResult, PromptConfig } from '../../../services/ai/llmGateway.js';
import type { RunBrandVoiceCheckArgs } from '../../../services/ai/marketing/brandVoiceChecker.js';
import type { RunComplianceScanArgs } from '../../../services/ai/marketing/complianceScanner.js';

const CONTENT_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

function passTruth(): ProductTruthValidationResult {
  return {
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
  };
}

function failTruth(): ProductTruthValidationResult {
  return {
    verdict: 'FAIL',
    checks: {
      feature_references: { status: 'FAIL', details: 'bad' },
      blocked_claims: { status: 'PASS', details: null },
      fabricated_metrics: { status: 'PASS', details: null },
      superlatives: { status: 'PASS', details: null },
      glossary_compliance: { status: 'PASS', details: null },
    },
    failed_reasons: ['Claim not in truth sheet'],
    features_referenced: [],
    metrics_found: [],
  };
}

function stubBrand(): BrandVoiceCheckResult {
  return {
    score: 80,
    dimensions: {},
    strengths: [],
    improvements: [],
    taboo_violations: [],
    anti_example_matches: [],
    passes: true,
  };
}

function stubCompliance(): ComplianceScanResult {
  return {
    verdict: 'PASS',
    warnings: [],
    warning_count: { high: 0, medium: 0, low: 0 },
    channel_specific_issues: [],
    email_compliance: null,
  };
}

describe('executeContentWorkflow', () => {
  const baseCtx: MarketingContentWorkflowContext = {
    organizationId: '00000000-0000-0000-0000-00000000ab12',
    tenantId: '00000000-0000-0000-0000-00000000ab12',
    caller: {
      userId: '00000000-0000-0000-0000-00000000ab34',
      role: 'manager',
      organizationId: '00000000-0000-0000-0000-00000000ab12',
    },
    contentId: CONTENT_ID,
    title: 'Test',
  };

  const mockGen = vi.fn(async (_c: PromptConfig): Promise<LLMGatewayResult> => ({
    content: '',
    toolCalls: [],
    usage: {},
    provider: 'anthropic',
    model: 'claude',
  }));
  const mockTruth = vi.fn(async (_o: RunProductTruthValidationOptions): Promise<ProductTruthValidationResult> =>
    passTruth(),
  );
  const mockBrand = vi.fn(async (_a: RunBrandVoiceCheckArgs): Promise<BrandVoiceCheckResult> => stubBrand());
  const mockComp = vi.fn(async (_a: RunComplianceScanArgs): Promise<ComplianceScanResult> => stubCompliance());
  const mockAssign = vi.fn();
  const mockUpdate = vi.fn();
  const mockGet = vi.fn();

  beforeEach(() => {
    mockGen.mockReset();
    mockTruth.mockReset();
    mockBrand.mockReset();
    mockComp.mockReset();
    mockAssign.mockReset();
    mockUpdate.mockReset();
    mockGet.mockReset();

    mockGen.mockResolvedValue({
      content: 'Final marketing draft body.',
      toolCalls: [],
      usage: {},
      provider: 'anthropic',
      model: 'claude',
    });
    mockTruth.mockResolvedValue(passTruth());
    mockBrand.mockResolvedValue(stubBrand());
    mockComp.mockResolvedValue(stubCompliance());
    mockAssign.mockResolvedValue({ ok: true, data: { approval_id: 'appr-1', content_id: CONTENT_ID } });
    mockGet.mockResolvedValue({
      id: CONTENT_ID,
      title: 'Test',
      content_type: 'social_post',
      channel: 'linkedin',
      organization_id: baseCtx.organizationId,
      status: 'draft',
      body: '',
    });
    mockUpdate.mockResolvedValue(undefined);
  });

  it('runs gatekeepers then assignApproval on Truth PASS', async () => {
    const result = await executeContentWorkflow('Write a tagline.', baseCtx, {
      generateResponseFn: mockGen,
      runProductTruthValidationFn: mockTruth,
      runBrandVoiceCheckFn: mockBrand,
      runComplianceScanFn: mockComp,
      assignApprovalFn: mockAssign,
      getContentByIdFn: mockGet,
      updateContentFn: mockUpdate,
      createContentFn: vi.fn(),
    });

    expect(result.status).toBe('completed');
    if (result.status === 'completed') {
      expect(result.approvalId).toBe('appr-1');
      expect(result.draft).toContain('Final marketing');
    }
    expect(mockTruth).toHaveBeenCalledTimes(1);
    expect(mockBrand).toHaveBeenCalledTimes(1);
    expect(mockComp).toHaveBeenCalledTimes(1);
    expect(mockAssign).toHaveBeenCalledWith(
      baseCtx.caller,
      expect.objectContaining({
        content_id: CONTENT_ID,
        validation_scores: expect.objectContaining({
          truth_validation: expect.any(Object),
          brand_voice_check: expect.any(Object),
          compliance_scan: expect.any(Object),
        }),
      }),
    );
  });

  it('retries generation when Truth FAILs until max attempts', async () => {
    mockTruth.mockResolvedValueOnce(failTruth()).mockResolvedValueOnce(failTruth()).mockResolvedValue(passTruth());

    const result = await executeContentWorkflow('Brief', baseCtx, {
      generateResponseFn: mockGen,
      runProductTruthValidationFn: mockTruth,
      runBrandVoiceCheckFn: mockBrand,
      runComplianceScanFn: mockComp,
      assignApprovalFn: mockAssign,
      getContentByIdFn: mockGet,
      updateContentFn: mockUpdate,
      createContentFn: vi.fn(),
    });

    expect(mockGen).toHaveBeenCalledTimes(3);
    expect(mockTruth).toHaveBeenCalledTimes(3);
    expect(result.status).toBe('completed');
  });

  it('fails after maxTruthRetries exhausted', async () => {
    mockTruth.mockResolvedValue(failTruth());

    const result = await executeContentWorkflow(
      'Brief',
      { ...baseCtx, maxTruthRetries: 1 },
      {
        generateResponseFn: mockGen,
        runProductTruthValidationFn: mockTruth,
        runBrandVoiceCheckFn: mockBrand,
        runComplianceScanFn: mockComp,
        assignApprovalFn: mockAssign,
        getContentByIdFn: mockGet,
        updateContentFn: mockUpdate,
        createContentFn: vi.fn(),
      },
    );

    expect(mockGen).toHaveBeenCalledTimes(2);
    expect(mockTruth).toHaveBeenCalledTimes(2);
    expect(result.status).toBe('failed');
    expect(mockAssign).not.toHaveBeenCalled();
  });
});
