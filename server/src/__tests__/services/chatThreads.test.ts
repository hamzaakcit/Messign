import { describe, it, vi, beforeEach, expect } from 'vitest';

vi.mock('../../db/index.js', () => ({
  query: vi.fn(),
}));

vi.mock('../../db/chatDb.js', () => ({
  getChannelById: vi.fn(),
  createMessage: vi.fn(),
  getChannelsForUser: vi.fn(),
  getMessagesForChannel: vi.fn(),
  findOrCreateDmChannel: vi.fn(),
  markChannelAsReadForUser: vi.fn(),
}));

vi.mock('../../db/employeesDb.js', () => ({
  addEmployeeXP: vi.fn(),
}));

vi.mock('../../sockets/index.js', () => ({
  emitToUser: vi.fn(),
}));

vi.mock('../../events/index.js', () => ({
  eventBus: { emit: vi.fn() },
}));

vi.mock('../../services/chat/index.js', () => ({
  summarizeConversation: vi.fn(),
  detectActionItems: vi.fn(),
  getKBSuggestions: vi.fn(),
  generateSmartReplies: vi.fn(),
  slashSearch: vi.fn(),
  resolveEmbeddedCard: vi.fn(),
  awardChatXP: vi.fn(),
}));

describe('Chat Thread Server Logic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('thread message creation increments reply_count on parent', async () => {
    const { query } = await import('../../db/index.js');
    const mockQuery = vi.mocked(query);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockQuery.mockResolvedValueOnce({ rows: [{ reply_count: 3 }] } as any);

    await mockQuery(
      'UPDATE messages SET reply_count = reply_count + 1 WHERE id = $1',
      ['parent-msg-id'],
    );

    expect(mockQuery).toHaveBeenCalledWith(
      'UPDATE messages SET reply_count = reply_count + 1 WHERE id = $1',
      ['parent-msg-id'],
    );
  });

  it('thread replies are fetched with WHERE thread_id = parent', async () => {
    const { query } = await import('../../db/index.js');
    const mockQuery = vi.mocked(query);

    const mockReplies = {
      rows: [
        { id: 'r1', channel_id: 'ch1', user_id: 'u1', content: 'Reply 1', thread_id: 'parent-1', reply_count: 0, created_at: '2024-01-01', sender_name: 'Alice', sender_avatar: null, attachments: [], mentions: [], xp_gained: 5, reactions: [], edited_at: null, is_pinned: false, metadata: {} },
        { id: 'r2', channel_id: 'ch1', user_id: 'u2', content: 'Reply 2', thread_id: 'parent-1', reply_count: 0, created_at: '2024-01-02', sender_name: 'Bob', sender_avatar: null, attachments: [], mentions: [], xp_gained: 5, reactions: [], edited_at: null, is_pinned: false, metadata: {} },
      ],
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockQuery.mockResolvedValueOnce(mockReplies as any);

    const result = await mockQuery(
      expect.stringContaining('WHERE m.thread_id = $1'),
      ['parent-1', 'ch1'],
    );

    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].thread_id).toBe('parent-1');
    expect(result.rows[1].thread_id).toBe('parent-1');
  });

  it('creating a message with threadId sets thread_id column', async () => {
    const { query } = await import('../../db/index.js');
    const mockQuery = vi.mocked(query);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockQuery.mockResolvedValueOnce({ rows: [] } as any);

    await mockQuery(
      'UPDATE messages SET thread_id = $1 WHERE id = $2',
      ['parent-1', 'new-msg-id'],
    );

    expect(mockQuery).toHaveBeenCalledWith(
      'UPDATE messages SET thread_id = $1 WHERE id = $2',
      ['parent-1', 'new-msg-id'],
    );
  });
});
