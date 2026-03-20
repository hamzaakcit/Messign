import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../db/index.js', () => ({
  query: vi.fn(),
}));

vi.mock('../../../services/ai/marketing/brandVoiceChecker.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../services/ai/marketing/brandVoiceChecker.js')>();
  return { ...actual, runBrandVoiceCheck: vi.fn() };
});

import { query } from '../../../db/index.js';
import type { ToolResult } from '../../../services/ai/types.js';
import { runBrandVoiceCheck } from '../../../services/ai/marketing/brandVoiceChecker.js';
import {
  brandVoiceCheck,
  competitorContentScan,
  productTruthLookup,
} from '../../../modules/marketing/tools/contentStrategistTools.js';

const queryMock = vi.mocked(query);
const runBrandVoiceCheckMock = vi.mocked(runBrandVoiceCheck);

function mockQr<T extends Record<string, unknown>>(rows: T[]): Awaited<ReturnType<typeof query>> {
  return { rows, rowCount: rows.length, command: '', oid: 0, fields: [] } as Awaited<ReturnType<typeof query>>;
}

describe('productTruthLookup handler', () => {
  beforeEach(() => {
    queryMock.mockReset();
  });

  it('returns failure when org cannot be resolved', async () => {
    queryMock.mockResolvedValueOnce(mockQr([]));
    const res = (await productTruthLookup.handler({}, { userId: 'u1', userRole: 'manager' })) as ToolResult;
    expect(res.success).toBe(false);
  });
});

describe('brandVoiceCheck handler', () => {
  beforeEach(() => {
    queryMock.mockReset();
    runBrandVoiceCheckMock.mockReset();
  });

  it('returns structured result from brand voice service', async () => {
    runBrandVoiceCheckMock.mockResolvedValue({
      score: 88,
      dimensions: {
        tone_voice: 18,
        clarity_structure: 18,
        audience_positioning: 17,
        claims_proof_safety: 18,
        taboo_policy: 17,
      },
      strengths: ['Clear CTA'],
      improvements: ['Optional polish on hook'],
      taboo_violations: [],
      anti_example_matches: [],
      passes: true,
    });

    const res = (await brandVoiceCheck.handler(
      { draft_text: 'Hello world' },
      { userId: 'u1', userRole: 'manager', organizationId: '00000000-0000-0000-0000-000000000099' },
    )) as ToolResult;
    expect(res.success).toBe(true);
    expect(res.summary).toContain('88');
    expect((res.data as { score: number }).score).toBe(88);
    expect(runBrandVoiceCheckMock).toHaveBeenCalledWith(
      expect.objectContaining({ contentText: 'Hello world', tenantId: '00000000-0000-0000-0000-000000000099' }),
    );
  });
});

describe('competitorContentScan handler', () => {
  it('returns stub limitation', async () => {
    const res = (await competitorContentScan.handler(
      { competitor_name: 'Acme' },
      { userId: 'u1', userRole: 'manager' },
    )) as ToolResult;
    expect(res.success).toBe(true);
    expect(res.summary).toContain('not available');
  });
});
