import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../db/index.js', () => ({
  query: vi.fn(),
}));

vi.mock('../../../services/ai/gateway.js', () => ({
  callModelSafe: vi.fn(),
}));

import { query } from '../../../db/index.js';
import { callModelSafe } from '../../../services/ai/gateway.js';
import { parseComplianceScanJson, runComplianceScan } from '../../../services/ai/marketing/complianceScanner.js';

const queryMock = vi.mocked(query);
const callModelSafeMock = vi.mocked(callModelSafe);

function mockQr<T extends Record<string, unknown>>(rows: T[]): Awaited<ReturnType<typeof query>> {
  return { rows, rowCount: rows.length, command: '', oid: 0, fields: [] } as Awaited<ReturnType<typeof query>>;
}

describe('parseComplianceScanJson', () => {
  it('parses valid JSON with warnings', () => {
    const raw = JSON.stringify({
      verdict: 'WARNING',
      warnings: [
        {
          check: 'pricing_claims',
          severity: 'MEDIUM',
          location: 'line 1',
          issue: 'Price stated',
          suggestion: 'Link to pricing page',
        },
      ],
      warning_count: { high: 0, medium: 1, low: 0 },
      channel_specific_issues: [],
      email_compliance: null,
    });
    const r = parseComplianceScanJson(`prefix ${raw} suffix`);
    expect(r.verdict).toBe('WARNING');
    expect(r.warnings).toHaveLength(1);
    expect(r.warning_count.medium).toBe(1);
  });

  it('normalizes PASS with warnings to WARNING', () => {
    const r = parseComplianceScanJson(
      JSON.stringify({
        verdict: 'PASS',
        warnings: [{ check: 'x', severity: 'LOW', location: 'a', issue: 'i', suggestion: 's' }],
        warning_count: { high: 0, medium: 0, low: 1 },
        channel_specific_issues: [],
      }),
    );
    expect(r.verdict).toBe('WARNING');
  });

  it('falls back on garbage', () => {
    const r = parseComplianceScanJson('not json');
    expect(r.verdict).toBe('WARNING');
    expect(r.warnings[0]?.check).toBe('scanner_output');
  });
});

describe('runComplianceScan', () => {
  beforeEach(() => {
    queryMock.mockReset();
    callModelSafeMock.mockReset();
  });

  it('returns PASS for empty content without calling model', async () => {
    const r = await runComplianceScan({
      organizationId: '00000000-0000-0000-0000-000000000099',
      contentText: '   ',
      tenantId: '00000000-0000-0000-0000-000000000099',
      contentType: 'blog',
      targetChannel: 'web',
    });
    expect(r.verdict).toBe('PASS');
    expect(callModelSafeMock).not.toHaveBeenCalled();
  });

  it('calls fast tier and parses response', async () => {
    queryMock.mockImplementation(async () => mockQr([]));

    const payload = {
      verdict: 'PASS',
      warnings: [],
      warning_count: { high: 0, medium: 0, low: 0 },
      channel_specific_issues: [],
    };

    callModelSafeMock.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify(payload) } }],
    } as Awaited<ReturnType<typeof callModelSafe>>);

    const r = await runComplianceScan({
      organizationId: '00000000-0000-0000-0000-000000000099',
      contentText: 'Hello world',
      tenantId: '00000000-0000-0000-0000-000000000099',
      contentType: 'blog',
      targetChannel: 'LinkedIn',
    });

    expect(r.verdict).toBe('PASS');
    expect(callModelSafeMock).toHaveBeenCalledWith(
      expect.objectContaining({ tier: 'fast', maxTokens: 1400, temperature: 0.15 }),
    );
  });
});
