import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../services/ai/gateway.js', () => ({
  callModelSafe: vi.fn(),
}));

vi.mock('../../../dal/marketing/truthBrand.js', () => ({
  loadProductTruthSheetMd: vi.fn().mockResolvedValue('## Truth\n- Feature A: shipped'),
}));

import { callModelSafe } from '../../../services/ai/gateway.js';
import {
  parseProductTruthValidationJson,
  runProductTruthValidation,
} from '../../../services/ai/marketing/productTruthValidator.js';

const callMock = vi.mocked(callModelSafe);

describe('parseProductTruthValidationJson', () => {
  it('parses valid PASS payload', () => {
    const raw = JSON.stringify({
      verdict: 'PASS',
      checks: {
        feature_references: { status: 'PASS', details: null },
        blocked_claims: { status: 'PASS', details: null },
        fabricated_metrics: { status: 'PASS', details: null },
        superlatives: { status: 'PASS', details: null },
        glossary_compliance: { status: 'PASS', details: null },
      },
      failed_reasons: [],
      features_referenced: ['Dora'],
      metrics_found: [],
    });
    const r = parseProductTruthValidationJson(raw);
    expect(r.verdict).toBe('PASS');
    expect(r.features_referenced).toContain('Dora');
  });

  it('returns FAIL fallback on garbage', () => {
    const r = parseProductTruthValidationJson('not json');
    expect(r.verdict).toBe('FAIL');
    expect(r.failed_reasons[0]).toContain('parse');
  });
});

describe('runProductTruthValidation', () => {
  beforeEach(() => {
    callMock.mockReset();
  });

  it('calls fast tier and returns parsed result', async () => {
    callMock.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
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
            }),
          },
        },
      ],
    } as Awaited<ReturnType<typeof callModelSafe>>);

    const r = await runProductTruthValidation({
      organizationId: '00000000-0000-0000-0000-000000000001',
      contentText: 'Messign helps teams collaborate.',
      tenantId: '00000000-0000-0000-0000-000000000001',
    });
    expect(r.verdict).toBe('PASS');
    expect(callMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tier: 'fast',
      }),
    );
  });

  it('fails on empty content', async () => {
    const r = await runProductTruthValidation({
      organizationId: '00000000-0000-0000-0000-000000000001',
      contentText: '   ',
      tenantId: '00000000-0000-0000-0000-000000000001',
    });
    expect(r.verdict).toBe('FAIL');
    expect(callMock).not.toHaveBeenCalled();
  });
});
