import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../db/index.js', () => ({
  query: vi.fn(),
}));

import { query } from '../../../db/index.js';
import { loadProductTruthSheetMd } from '../../../dal/marketing/truthBrand.js';

const queryMock = vi.mocked(query);

/** Minimal pg QueryResult shape for mocks (strict tsc). */
function mockQr<T extends Record<string, unknown>>(rows: T[]): Awaited<ReturnType<typeof query>> {
  return { rows, rowCount: rows.length, command: '', oid: 0, fields: [] } as Awaited<ReturnType<typeof query>>;
}

describe('loadProductTruthSheetMd', () => {
  beforeEach(() => {
    queryMock.mockReset();
  });

  it('returns default fallback when organizationId is null', async () => {
    const md = await loadProductTruthSheetMd(null);
    expect(md).toContain('Collaboration, Work Management');
  });

  it('returns default fallback when all tables are empty', async () => {
    queryMock
      .mockResolvedValueOnce(mockQr([])) // features
      .mockResolvedValueOnce(mockQr([])) // claims
      .mockResolvedValueOnce(mockQr([])) // blocked
      .mockResolvedValueOnce(mockQr([])) // competitors
      .mockResolvedValueOnce(mockQr([])); // glossary

    const md = await loadProductTruthSheetMd('00000000-0000-0000-0000-000000000001');
    expect(md).toContain('## Product truth (default');
    expect(md).toContain('No rows in marketing_truth_*');
  });

  it('renders feature rows when present', async () => {
    queryMock
      .mockResolvedValueOnce(
        mockQr([
          {
            key: 'knowledge_hub',
            name: 'Knowledge Hub',
            description: 'Docs.',
            status: 'shipped',
            announced: false,
          },
        ]),
      )
      .mockResolvedValueOnce(mockQr([]))
      .mockResolvedValueOnce(mockQr([]))
      .mockResolvedValueOnce(mockQr([]))
      .mockResolvedValueOnce(mockQr([]));

    const md = await loadProductTruthSheetMd('00000000-0000-0000-0000-000000000002');
    expect(md).toContain('Knowledge Hub');
    expect(md).toContain('`knowledge_hub`');
  });
});
