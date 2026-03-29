import { describe, expect, it } from 'vitest';
import {
  computeKnowledgeSearchAggregates,
  documentsFromKnowledgeSearchData,
} from '../../../services/ai/tools/knowledgeSearchAggregates.js';

/** Reference id for fixtures (see user-provided sample). */
const REF_USER_ID = '3a733025-e96b-4ee4-9b8a-4fb6423ad4b7';

describe('computeKnowledgeSearchAggregates', () => {
  it('counts by document_type', () => {
    const rows = [
      { id: REF_USER_ID, title: 'A', slug: 'a', document_type: 'policy' },
      { id: '2', title: 'B', slug: 'b', document_type: 'guide' },
      { id: '3', title: 'C', slug: 'c', document_type: 'policy' },
    ];
    const a = computeKnowledgeSearchAggregates(rows);
    expect(a.count).toBe(3);
    expect(a.byType.policy).toBe(2);
    expect(a.byType.guide).toBe(1);
  });
});

describe('documentsFromKnowledgeSearchData', () => {
  it('returns array for legacy array payload', () => {
    const rows = [{ id: '1', title: 'T' }];
    expect(documentsFromKnowledgeSearchData(rows)).toEqual(rows);
  });

  it('extracts documents from structured payload', () => {
    const docs = [{ id: '1', title: 'T', slug: 't' }];
    expect(documentsFromKnowledgeSearchData({ documents: docs, query: 'q', confidence: 0.5 })).toEqual(docs);
  });
});
