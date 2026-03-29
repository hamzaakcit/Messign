import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSearchEmbeddings = vi.fn();
const mockHasRAGData = vi.fn();
const mockRagHybridSearch = vi.fn();
const mockEmbedQuery = vi.fn();
const mockHybridSearchChunks = vi.fn();
const mockSemanticSearchChunks = vi.fn();
const mockQuery = vi.fn();

vi.mock('../../services/ai/rag/embeddingPipeline.js', () => ({
  searchEmbeddings: (...args: unknown[]) => mockSearchEmbeddings(...args),
}));

vi.mock('../../services/rag/db.js', () => ({
  hasRAGData: (...args: unknown[]) => mockHasRAGData(...args),
  hybridSearch: (...args: unknown[]) => mockRagHybridSearch(...args),
}));

vi.mock('../../services/rag/embeddings.js', () => ({
  embedQuery: (...args: unknown[]) => mockEmbedQuery(...args),
}));

vi.mock('../../services/knowledgeSearch.js', () => ({
  hybridSearchChunks: (...args: unknown[]) => mockHybridSearchChunks(...args),
  semanticSearchChunks: (...args: unknown[]) => mockSemanticSearchChunks(...args),
  hybridSearch: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../db/index.js', () => ({
  query: (...args: unknown[]) => mockQuery(...args),
}));

import searchKnowledgeBaseTool from '../../services/ai/tools/searchKnowledgeBase.js';

const toolCtx = {
  organizationId: '00000000-0000-0000-0000-000000000001',
  userRole: 'employee',
  userId: 'user-1',
} as const;

describe('knowledge:search_knowledge_base', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchEmbeddings.mockResolvedValue([
      {
        content: 'crm entity hit',
        similarity: 0.82,
        metadata: {},
        source: 'crm:note',
      },
    ]);
    mockHasRAGData.mockResolvedValue(true);
    mockRagHybridSearch.mockResolvedValue([]);
    mockEmbedQuery.mockResolvedValue(new Array(128).fill(0.01));
    mockHybridSearchChunks.mockResolvedValue([
      {
        id: 'chunk-1',
        document_id: 'doc-handset',
        chunk_index: 0,
        chunk_text: 'Handset DLR means…',
        title: 'Handset DLR Guide',
        slug: 'handset-dlr',
        document_type: 'guide',
        score: 0.88,
      },
    ]);
    mockSemanticSearchChunks.mockResolvedValue([]);
    mockQuery.mockResolvedValue({ rows: [] });
  });

  it('does not return early with empty documents when RAG chunks are empty but entity_embeddings matched', async () => {
    const execute = searchKnowledgeBaseTool.execute;
    if (!execute) throw new Error('execute missing');

    const result = await execute({ query: 'handset dlr' }, toolCtx as never);

    expect(result.success).toBe(true);
    const data = result.data as { documents?: Array<{ id: string; title: string }> };
    expect(data?.documents?.length).toBe(1);
    expect(data?.documents?.[0]?.id).toBe('doc-handset');
    expect(data?.documents?.[0]?.title).toBe('Handset DLR Guide');
    expect(mockRagHybridSearch).toHaveBeenCalled();
    expect(mockHybridSearchChunks).toHaveBeenCalled();
  });
});
