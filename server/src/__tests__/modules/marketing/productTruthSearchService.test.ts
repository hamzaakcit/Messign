import { describe, it, expect } from 'vitest';
import {
  formatProductTruthLookupMarkdown,
  type ProductTruthLookupRawResult,
} from '../../../services/marketing/productTruthSearchService.js';

describe('formatProductTruthLookupMarkdown', () => {
  it('returns the no-data message when all sections empty', () => {
    const raw: ProductTruthLookupRawResult = {
      workspaceId: 'w1',
      searchQuery: 'foo',
      features: [],
      approvedClaims: [],
      blockedClaims: [],
      competitorRows: [],
    };
    expect(formatProductTruthLookupMarkdown(raw)).toContain("No verified data found for 'foo'");
  });

  it('adds warning for internal_only or deprecated features', () => {
    const raw: ProductTruthLookupRawResult = {
      workspaceId: 'w1',
      searchQuery: 'x',
      features: [
        {
          id: '1',
          feature_name: 'Secret',
          description: 'Internal',
          status: 'internal_only',
        },
      ],
      approvedClaims: [],
      blockedClaims: [],
      competitorRows: [],
    };
    const md = formatProductTruthLookupMarkdown(raw);
    expect(md).toContain('internal/deprecated');
    expect(md).toContain('Secret');
  });
});
