import { describe, it, vi, beforeEach, expect } from 'vitest';

vi.mock('../../db/index.js', () => ({
  query: vi.fn(),
}));

vi.mock('../../services/ai/llmGateway.js', () => ({
  generateResponse: vi.fn(),
  LLM_TIER: { FAST: 'fast', COMPLEX: 'complex' },
}));

describe('Chat Dora AI: thread summarize & decisions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('summarizeThread returns empty-thread copy when no messages', async () => {
    const { query } = await import('../../db/index.js');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(query).mockResolvedValueOnce({ rows: [] } as any);

    const { summarizeThread } = await import('../../services/chat/doraChatService.js');
    const out = await summarizeThread('ch1', 'parent-1');
    expect(out.summary).toMatch(/No messages/i);
    expect(out.messageCount).toBe(0);
  });

  it('summarizeThread parses LLM JSON when thread has messages', async () => {
    const { query } = await import('../../db/index.js');
    const { generateResponse } = await import('../../services/ai/llmGateway.js');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(query).mockResolvedValueOnce({
      rows: [
        {
          id: 'p1',
          user_id: 'u1',
          content: 'Start',
          sender_name: 'Alice',
          created_at: '2024-01-01T00:00:00Z',
        },
      ],
    } as any);
    vi.mocked(generateResponse).mockResolvedValueOnce({
      content: JSON.stringify({ summary: 'Short thread', keyTopics: ['topic'] }),
      toolCalls: [],
      usage: {},
      provider: 'groq',
      model: 'test',
    });

    const { summarizeThread } = await import('../../services/chat/doraChatService.js');
    const out = await summarizeThread('ch1', 'parent-1');
    expect(out.summary).toBe('Short thread');
    expect(out.keyTopics).toEqual(['topic']);
    expect(out.messageCount).toBe(1);
  });

  it('extractDecisions returns empty when channel has no messages', async () => {
    const { query } = await import('../../db/index.js');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(query).mockResolvedValueOnce({ rows: [] } as any);

    const { extractDecisions } = await import('../../services/chat/doraChatService.js');
    const out = await extractDecisions('ch1');
    expect(out.decisions).toEqual([]);
    expect(out.confidence).toBe(0);
  });

  it('extractDecisionsThread returns empty when thread has no messages', async () => {
    const { query } = await import('../../db/index.js');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(query).mockResolvedValueOnce({ rows: [] } as any);

    const { extractDecisionsThread } = await import('../../services/chat/doraChatService.js');
    const out = await extractDecisionsThread('ch1', 'parent-1');
    expect(out.decisions).toEqual([]);
  });

  it('extractDecisionsThread parses LLM JSON when thread has messages', async () => {
    const { query } = await import('../../db/index.js');
    const { generateResponse } = await import('../../services/ai/llmGateway.js');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(query).mockResolvedValueOnce({
      rows: [
        {
          id: 'p1',
          user_id: 'u1',
          content: 'We ship Friday',
          sender_name: 'A',
          created_at: '2024-01-01T00:00:00Z',
        },
      ],
    } as any);
    vi.mocked(generateResponse).mockResolvedValueOnce({
      content: JSON.stringify({
        decisions: [{ text: 'Ship Friday', owners: ['A'] }],
        confidence: 0.9,
      }),
      toolCalls: [],
      usage: {},
      provider: 'groq',
      model: 'test',
    });

    const { extractDecisionsThread } = await import('../../services/chat/doraChatService.js');
    const out = await extractDecisionsThread('ch1', 'parent-1');
    expect(out.decisions).toHaveLength(1);
    expect(out.decisions[0]?.text).toBe('Ship Friday');
  });
});

describe('Chat Dora AI: smart reply thread context', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('generateSmartReplies uses thread filter when threadRootMessageId is set', async () => {
    const { query } = await import('../../db/index.js');
    const { generateResponse } = await import('../../services/ai/llmGateway.js');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(query)
      .mockResolvedValueOnce({
        rows: [{ content: 'hello', user_id: 'u1', sender_name: 'Pat' }],
      } as any)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .mockResolvedValueOnce({ rows: [{ full_name: 'Requester' }] } as any);

    vi.mocked(generateResponse).mockResolvedValueOnce({
      content: JSON.stringify({ replies: ['a', 'b', 'c'], contextSummary: 'ok' }),
      toolCalls: [],
      usage: {},
      provider: 'groq',
      model: 'test',
    });

    const { generateSmartReplies } = await import('../../services/chat/smartReplyService.js');
    await generateSmartReplies('ch1', 'u9', 10, 'root-msg');

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('m.thread_id = $2'),
      expect.arrayContaining(['ch1', 'root-msg', 10]),
    );
  });
});

describe('Chat Dora AI: transform draft & message', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('transformDraft returns empty text for whitespace-only input', async () => {
    const { transformDraft } = await import('../../services/chat/doraChatService.js');
    const out = await transformDraft('   \n', 'shorten');
    expect(out.text).toBe('');
  });

  it('transformDraft returns parsed text from LLM', async () => {
    const { generateResponse } = await import('../../services/ai/llmGateway.js');
    vi.mocked(generateResponse).mockResolvedValueOnce({
      content: JSON.stringify({ text: 'Polished line' }),
      toolCalls: [],
      usage: {},
      provider: 'groq',
      model: 'test',
    });

    const { transformDraft } = await import('../../services/chat/doraChatService.js');
    const out = await transformDraft('rough line', 'professional');
    expect(out.text).toBe('Polished line');
  });

  it('transformMessage returns null when message not found', async () => {
    const { query } = await import('../../db/index.js');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(query).mockResolvedValueOnce({ rows: [] } as any);

    const { transformMessage } = await import('../../services/chat/doraChatService.js');
    const out = await transformMessage('ch1', 'missing', 'explain');
    expect(out).toBeNull();
  });
});
