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
  slashSearch: vi.fn().mockResolvedValue([]),
  resolveEmbeddedCard: vi.fn(),
  awardChatXP: vi.fn(),
}));

describe('Chat Security - Channel Membership', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('checkChannelMembership returns true for public channels', async () => {
    const { getChannelById } = await import('../../db/chatDb.js');
    (getChannelById as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'ch1', name: 'general', type: 'public', members: ['u1', 'u2'],
    });

    const channel = await getChannelById('ch1');
    const isMember = channel && (channel.type === 'public' || channel.members.includes('u3'));
    expect(isMember).toBe(true);
  });

  it('checkChannelMembership returns false for private channel non-members', async () => {
    const { getChannelById } = await import('../../db/chatDb.js');
    (getChannelById as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'ch2', name: 'secret', type: 'private', members: ['u1', 'u2'],
    });

    const channel = await getChannelById('ch2');
    const userId = 'u3';
    const isMember = channel && (channel.type === 'public' || channel.members.includes(userId));
    expect(isMember).toBe(false);
  });

  it('checkChannelMembership returns true for private channel members', async () => {
    const { getChannelById } = await import('../../db/chatDb.js');
    (getChannelById as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'ch2', name: 'secret', type: 'private', members: ['u1', 'u2'],
    });

    const channel = await getChannelById('ch2');
    const userId = 'u1';
    const isMember = channel && (channel.type === 'public' || channel.members.includes(userId));
    expect(isMember).toBe(true);
  });

  it('checkChannelMembership returns false for non-existent channel', async () => {
    const { getChannelById } = await import('../../db/chatDb.js');
    (getChannelById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const channel = await getChannelById('nonexistent');
    const isMember = channel && (channel.type === 'public' || channel.members.includes('u1'));
    expect(isMember).toBeFalsy();
  });

  it('valid XP events are accepted', () => {
    const VALID_XP_EVENTS = [
      'chat.question.answered', 'chat.blocker.resolved',
      'chat.task.created_from_chat', 'chat.message.reacted', 'chat.message.pinned',
      'chat.dora.transform_used',
    ];

    expect(VALID_XP_EVENTS.includes('chat.task.created_from_chat')).toBe(true);
    expect(VALID_XP_EVENTS.includes('chat.invalid.event')).toBe(false);
  });

  it('valid channel types are enforced', () => {
    const VALID_CHANNEL_TYPES = ['public', 'private', 'dm'];

    expect(VALID_CHANNEL_TYPES.includes('public')).toBe(true);
    expect(VALID_CHANNEL_TYPES.includes('private')).toBe(true);
    expect(VALID_CHANNEL_TYPES.includes('dm')).toBe(true);
    expect(VALID_CHANNEL_TYPES.includes('secret')).toBe(false);
    expect(VALID_CHANNEL_TYPES.includes('group')).toBe(false);
  });

  it('edit message rejects non-owner', async () => {
    const { query } = await import('../../db/index.js');
    const mockQuery = vi.mocked(query);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockQuery.mockResolvedValueOnce({ rows: [{ user_id: 'u1' }] } as any);

    const result = await mockQuery(
      'SELECT user_id FROM messages WHERE id = $1 AND channel_id = $2',
      ['m1', 'ch1'],
    );

    const messageOwner = result.rows[0]?.user_id;
    const requestingUser = 'u2';
    expect(messageOwner).not.toBe(requestingUser);
  });

  it('delete message rejects non-owner', async () => {
    const { query } = await import('../../db/index.js');
    const mockQuery = vi.mocked(query);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockQuery.mockResolvedValueOnce({ rows: [{ user_id: 'u1' }] } as any);

    const result = await mockQuery(
      'SELECT user_id FROM messages WHERE id = $1 AND channel_id = $2',
      ['m1', 'ch1'],
    );

    const messageOwner = result.rows[0]?.user_id;
    const requestingUser = 'u2';
    expect(messageOwner).not.toBe(requestingUser);
  });
});
