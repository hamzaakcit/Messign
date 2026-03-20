import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../db/index.js', () => ({
  query: vi.fn(),
}));

vi.mock('../../../services/ai/gateway.js', () => ({
  callModelSafe: vi.fn(),
}));

import { query } from '../../../db/index.js';
import { callModelSafe } from '../../../services/ai/gateway.js';
import {
  parseBrandVoiceCheckJson,
  runBrandVoiceCheck,
} from '../../../services/ai/marketing/brandVoiceChecker.js';

const queryMock = vi.mocked(query);
const callModelSafeMock = vi.mocked(callModelSafe);

function mockQr<T extends Record<string, unknown>>(rows: T[]): Awaited<ReturnType<typeof query>> {
  return { rows, rowCount: rows.length, command: '', oid: 0, fields: [] } as Awaited<ReturnType<typeof query>>;
}

describe('parseBrandVoiceCheckJson', () => {
  it('parses JSON object from model output', () => {
    const raw = `Here: {"score": 82, "dimensions": {"tone_voice": 16, "clarity_structure": 17, "audience_positioning": 17, "claims_proof_safety": 16, "taboo_policy": 16}, "strengths": ["Clear"], "improvements": ["Tighten CTA"], "taboo_violations": [], "anti_example_matches": []}`;
    const r = parseBrandVoiceCheckJson(raw);
    expect(r.score).toBe(82);
    expect(r.passes).toBe(true);
    expect(r.dimensions.tone_voice).toBe(16);
    expect(r.improvements).toContain('Tighten CTA');
  });

  it('falls back on invalid JSON', () => {
    const r = parseBrandVoiceCheckJson('not json');
    expect(r.score).toBe(0);
    expect(r.passes).toBe(false);
    expect(r.improvements[0]).toContain('Could not parse');
  });
});

describe('runBrandVoiceCheck', () => {
  beforeEach(() => {
    queryMock.mockReset();
    callModelSafeMock.mockReset();
  });

  it('calls fast model and returns parsed result', async () => {
    queryMock
      .mockResolvedValueOnce(mockQr([{ profile: { tone: 'crisp' } } as Record<string, unknown>]))
      .mockResolvedValueOnce(mockQr([]));

    const json = {
      score: 80,
      dimensions: {
        tone_voice: 16,
        clarity_structure: 16,
        audience_positioning: 16,
        claims_proof_safety: 16,
        taboo_policy: 16,
      },
      strengths: ['On brand'],
      improvements: ['Minor tweak'],
      taboo_violations: [],
      anti_example_matches: [],
    };

    callModelSafeMock.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify(json) } }],
    } as Awaited<ReturnType<typeof callModelSafe>>);

    const r = await runBrandVoiceCheck({
      organizationId: '00000000-0000-0000-0000-000000000099',
      contentText: 'Hello',
      tenantId: '00000000-0000-0000-0000-000000000099',
    });

    expect(r.score).toBe(80);
    expect(r.passes).toBe(true);
    expect(callModelSafeMock).toHaveBeenCalledWith(
      expect.objectContaining({ tier: 'fast', maxTokens: 900, temperature: 0.2 }),
    );
  });
});
