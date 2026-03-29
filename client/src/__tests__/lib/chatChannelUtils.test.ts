import { describe, it, expect } from 'vitest';
import { getChannelMemberIds, normalizeChannel, normalizeChannelList } from '@/lib/chatChannelUtils';
import type { Channel } from '@/types';

describe('chatChannelUtils', () => {
  it('normalizeChannelList returns [] for non-arrays', () => {
    expect(normalizeChannelList(null)).toEqual([]);
    expect(normalizeChannelList(undefined)).toEqual([]);
    expect(normalizeChannelList({})).toEqual([]);
  });

  it('normalizeChannel fills members when missing', () => {
    const c = normalizeChannel({
      id: 'ch1',
      name: 'x',
      type: 'dm',
      unreadCount: 0,
      createdAt: '2020-01-01',
    });
    expect(c).not.toBeNull();
    expect(c!.members).toEqual([]);
  });

  it('getChannelMemberIds is safe when members missing', () => {
    expect(getChannelMemberIds({ id: 'a', name: 'n', type: 'dm', unreadCount: 0, createdAt: '', members: undefined as unknown as string[] } as Channel)).toEqual([]);
  });
});
