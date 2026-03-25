import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('chatAPI.getMessagesPage', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ messages: [], hasMore: false }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('requests paginated messages with limit and before', async () => {
    const { chatAPI } = await import('@/lib/messagingApi');
    await chatAPI.getMessagesPage('channel-1', { limit: 50, before: 'msg-older' }, 'user-1');
    expect(fetchSpy).toHaveBeenCalled();
    const url = String(fetchSpy.mock.calls[0][0]);
    expect(url).toContain('/chat/channels/channel-1/messages');
    expect(url).toContain('limit=50');
    expect(url).toContain('before=msg-older');
  });
});
