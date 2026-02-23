/**
 * Channels are now stored in the database (channels + channel_members tables).
 * Use db/chatDb.js for getChannelById, getChannelsForUser, getChannelIdsForUser.
 */
export { getChannelById, getChannelsForUser, getChannelIdsForUser } from '../db/chatDb.js';
export type { ChannelRow } from '../db/chatDb.js';
