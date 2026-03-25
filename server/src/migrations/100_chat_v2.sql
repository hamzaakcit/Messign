-- Chat v2: Company OS Hub schema additions
-- Extends the base chat tables (005_channels.sql) with threading, reactions, pins, embedded cards, and Dora AI support.

-- Add new columns to messages
ALTER TABLE messages ADD COLUMN IF NOT EXISTS thread_id UUID REFERENCES messages(id) ON DELETE SET NULL;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}';
ALTER TABLE messages ADD COLUMN IF NOT EXISTS reply_count INT NOT NULL DEFAULT 0;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT FALSE;

-- Indexes for thread lookups and pinned message queries
CREATE INDEX IF NOT EXISTS idx_messages_thread_id ON messages (thread_id) WHERE thread_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_messages_pinned ON messages (channel_id) WHERE is_pinned = TRUE;
CREATE INDEX IF NOT EXISTS idx_messages_metadata ON messages USING GIN (metadata);

-- Full-text search on messages
ALTER TABLE messages ADD COLUMN IF NOT EXISTS content_tsv tsvector
  GENERATED ALWAYS AS (to_tsvector('english', coalesce(content, ''))) STORED;
CREATE INDEX IF NOT EXISTS idx_messages_content_fts ON messages USING GIN (content_tsv);

-- Message reactions
CREATE TABLE IF NOT EXISTS message_reactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    user_id VARCHAR(100) NOT NULL,
    emoji VARCHAR(32) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(message_id, user_id, emoji)
);
CREATE INDEX IF NOT EXISTS idx_message_reactions_message ON message_reactions (message_id);

-- Chat bookmarks / Smart Folders
CREATE TABLE IF NOT EXISTS chat_bookmarks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    user_id VARCHAR(100) NOT NULL,
    folder_name VARCHAR(100) NOT NULL DEFAULT 'Saved',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(channel_id, user_id, folder_name)
);
CREATE INDEX IF NOT EXISTS idx_chat_bookmarks_user ON chat_bookmarks (user_id);

-- Dora AI suggestions for chat
CREATE TABLE IF NOT EXISTS chat_dora_suggestions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    trigger_message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
    suggestion_type VARCHAR(50) NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}',
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_chat_dora_suggestions_channel ON chat_dora_suggestions (channel_id, status);

-- Add topic and avatar to channels for richer channel metadata
ALTER TABLE channels ADD COLUMN IF NOT EXISTS topic TEXT;
ALTER TABLE channels ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE channels ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT FALSE;

-- Add status_text to reimbursement_users for custom status messages
ALTER TABLE reimbursement_users ADD COLUMN IF NOT EXISTS status_text TEXT;
ALTER TABLE reimbursement_users ADD COLUMN IF NOT EXISTS status_emoji VARCHAR(10);
