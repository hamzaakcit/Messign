import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../db/index.js', () => ({
  query: vi.fn().mockResolvedValue({ rows: [] }),
}));

vi.mock('../../services/ai/llmGateway.js', () => ({
  generateResponse: vi.fn().mockResolvedValue({
    content: JSON.stringify({ summary: 'Test summary', keyTopics: ['topic1'] }),
    toolCalls: [],
    usage: {},
    provider: 'groq',
    model: 'test',
  }),
  LLM_TIER: { FAST: 'fast', COMPLEX: 'complex' },
}));

vi.mock('../../services/gamification.js', () => ({
  awardXP: vi.fn().mockResolvedValue({
    user: { id: 'user-1', xp: 100, level: 1, name: 'Test User' },
    leveledUp: false,
  }),
  XP_REWARDS: { message_sent: 5 },
}));

vi.mock('../../events/index.js', () => ({
  eventBus: { emit: vi.fn() },
}));

vi.mock('../../sockets/index.js', () => ({
  emitToUser: vi.fn(),
}));

describe('Chat Service: slashCommandService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('slashSearch returns empty array for empty query', async () => {
    const { slashSearch } = await import('../../services/chat/slashCommandService.js');
    const results = await slashSearch('all', '', 10);
    expect(results).toEqual([]);
  });

  it('slashSearch calls correct search for task type', async () => {
    const db = await import('../../db/index.js');
    (db.query as ReturnType<typeof vi.fn>).mockResolvedValue({
      rows: [{ id: 't1', title: 'Test Task', status: 'todo', priority: 'medium', project_name: 'Project 1' }],
    });
    const { searchTasks } = await import('../../services/chat/slashCommandService.js');
    const results = await searchTasks('Test');
    expect(results).toHaveLength(1);
    expect(results[0].type).toBe('task');
    expect(results[0].title).toBe('Test Task');
  });
});

describe('Chat Service: embeddedCardService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resolveEmbeddedCard returns null for unknown type', async () => {
    const { resolveEmbeddedCard } = await import('../../services/chat/embeddedCardService.js');
    const result = await resolveEmbeddedCard('unknown', 'some-id');
    expect(result).toBeNull();
  });
});

describe('Chat Service: chatGamificationService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('awardChatXP calls awardXP and emits events', async () => {
    const { awardChatXP } = await import('../../services/chat/chatGamificationService.js');
    const gamification = await import('../../services/gamification.js');
    const events = await import('../../events/index.js');

    const result = await awardChatXP('user-1', 'chat.question.answered');
    expect(result).toBeDefined();
    expect(result?.amount).toBe(15);
    expect(gamification.awardXP).toHaveBeenCalledWith('user-1', 15, 'chat.question.answered');
    expect(events.eventBus.emit).toHaveBeenCalledWith('gamification.xp.awarded', expect.objectContaining({
      userId: 'user-1',
      amount: 15,
    }));
  });
});

describe('Chat Service: doraChatService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('summarizeConversation returns fallback for no messages', async () => {
    const db = await import('../../db/index.js');
    (db.query as ReturnType<typeof vi.fn>).mockResolvedValue({ rows: [] });

    const { summarizeConversation } = await import('../../services/chat/doraChatService.js');
    const result = await summarizeConversation('channel-1', 50);
    expect(result.summary).toBe('No messages to summarize.');
    expect(result.participantCount).toBe(0);
    expect(result.messageCount).toBe(0);
  });

  it('detectActionItems returns empty for no messages', async () => {
    const db = await import('../../db/index.js');
    (db.query as ReturnType<typeof vi.fn>).mockResolvedValue({ rows: [] });

    const { detectActionItems } = await import('../../services/chat/doraChatService.js');
    const result = await detectActionItems('channel-1');
    expect(result.actionItems).toEqual([]);
    expect(result.confidence).toBe(0);
  });
});

describe('Chat Service: smartReplyService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('generateSmartReplies returns empty for no messages', async () => {
    const db = await import('../../db/index.js');
    (db.query as ReturnType<typeof vi.fn>).mockResolvedValue({ rows: [] });

    const { generateSmartReplies } = await import('../../services/chat/smartReplyService.js');
    const result = await generateSmartReplies('channel-1', 'user-1');
    expect(result.replies).toEqual([]);
  });
});
