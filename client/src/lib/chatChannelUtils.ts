/** @module chatChannelUtils — defensive parsing for chat channel payloads (API, sockets, cache). */
import type { Channel, ChannelType, Message } from '@/types';

/**
 * Returns a stable member id list; never throws if `members` is missing or malformed.
 */
export function getChannelMemberIds(channel: Channel | null | undefined): string[] {
  if (!channel) return [];
  const m = channel.members;
  return Array.isArray(m) ? m.filter((id): id is string => typeof id === 'string') : [];
}

/**
 * Coerces an unknown payload into a `Channel`, or returns null if `id` is unusable.
 */
export function normalizeChannel(raw: unknown): Channel | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string' || r.id.length === 0) return null;

  const membersRaw = r.members;
  const members = Array.isArray(membersRaw)
    ? membersRaw.filter((x): x is string => typeof x === 'string')
    : [];

  const tr = r.type;
  const type: ChannelType =
    tr === 'public' || tr === 'private' || tr === 'dm' ? tr : 'public';

  const unread =
    typeof r.unreadCount === 'number' && Number.isFinite(r.unreadCount) ? r.unreadCount : 0;

  const channel: Channel = {
    id: r.id,
    name: typeof r.name === 'string' && r.name.length > 0 ? r.name : 'Channel',
    type,
    members,
    unreadCount: unread,
    createdAt: typeof r.createdAt === 'string' ? r.createdAt : new Date(0).toISOString(),
  };

  if (typeof r.description === 'string') channel.description = r.description;
  if (r.lastMessage && typeof r.lastMessage === 'object') {
    channel.lastMessage = r.lastMessage as Message;
  }
  if (typeof r.topic === 'string') channel.topic = r.topic;
  if (typeof r.avatarUrl === 'string') channel.avatarUrl = r.avatarUrl;
  if (typeof r.archived === 'boolean') channel.archived = r.archived;

  return channel;
}

/**
 * Coerces an unknown list (API JSON, TanStack cache) into a clean `Channel[]`.
 */
export function normalizeChannelList(raw: unknown): Channel[] {
  if (!Array.isArray(raw)) return [];
  const out: Channel[] = [];
  for (const item of raw) {
    const c = normalizeChannel(item);
    if (c) out.push(c);
  }
  return out;
}
