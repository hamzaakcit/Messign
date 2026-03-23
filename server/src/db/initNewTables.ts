/**
 * Auto-creates any tables that may not exist yet without running the full schema.
 * Called on server startup.
 */
import { pool } from './index.js';

export async function initNewTables(): Promise<void> {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS game_scores (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id VARCHAR(100) NOT NULL REFERENCES reimbursement_users(id) ON DELETE CASCADE,
        score INTEGER NOT NULL DEFAULT 0,
        duration_ms INTEGER NOT NULL DEFAULT 0,
        played_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_game_scores_top ON game_scores (score DESC);
      CREATE INDEX IF NOT EXISTS idx_game_scores_user ON game_scores (user_id);

      CREATE TABLE IF NOT EXISTS dora_sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id VARCHAR(100) NOT NULL REFERENCES reimbursement_users(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL DEFAULT 'New conversation',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_dora_sessions_user ON dora_sessions (user_id, updated_at DESC);

      CREATE TABLE IF NOT EXISTS dora_messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        session_id UUID NOT NULL REFERENCES dora_sessions(id) ON DELETE CASCADE,
        role VARCHAR(10) NOT NULL CHECK (role IN ('user', 'assistant')),
        content TEXT NOT NULL DEFAULT '',
        metadata JSONB DEFAULT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_dora_messages_session ON dora_messages (session_id, created_at);
    `);
    console.log('[FIX-2] [initNewTables] Success — game_scores, dora_sessions, dora_messages');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[FIX-2] [initNewTables] Skipped (permission issue — grant CREATE on schema public to app role or run migrations as admin):', msg);
  }
}
