/**
 * Messages are now stored in the database (messages table).
 * Use db/chatDb.js for getMessagesByChannel, addMessage.
 */
export { getMessagesByChannel, addMessage } from '../db/chatDb.js';
export type { MessageRow } from '../db/chatDb.js';
