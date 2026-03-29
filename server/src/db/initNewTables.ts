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

  try {
    await pool.query(`
      ALTER TABLE approval_steps
        ADD COLUMN IF NOT EXISTS sla_deadline_hours INTEGER DEFAULT 48,
        ADD COLUMN IF NOT EXISTS sla_reminder_sent BOOLEAN DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS sla_escalated BOOLEAN DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMPTZ;
    `);
    console.log('[FIX-2] [initNewTables] Success — approval_steps SLA columns');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[FIX-2] [initNewTables] approval_steps SLA columns skipped:', msg);
  }

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS finance_notification_preferences (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES reimbursement_users(id),
        organization_id UUID NOT NULL REFERENCES organizations(id),
        preferences JSONB NOT NULL DEFAULT '{}',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(user_id, organization_id)
      );

      ALTER TABLE finance_settings
        ADD COLUMN IF NOT EXISTS approval_workflow_config JSONB DEFAULT '[]',
        ADD COLUMN IF NOT EXISTS notification_preferences JSONB DEFAULT '{}';

      CREATE TABLE IF NOT EXISTS finance_dora_job_runs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id UUID NOT NULL,
        job_name VARCHAR(100) NOT NULL,
        started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        completed_at TIMESTAMPTZ,
        status VARCHAR(20) DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
        result JSONB,
        error_message TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_dora_job_runs_org ON finance_dora_job_runs(organization_id, job_name);

      ALTER TABLE finance_audit_log
        ADD COLUMN IF NOT EXISTS severity VARCHAR(20) DEFAULT 'info';
    `);
    await pool.query(`
      DO $$ BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'finance_audit_log' AND column_name = 'is_flagged'
        ) THEN
          EXECUTE 'UPDATE finance_audit_log SET severity = ''warning'' WHERE is_flagged = TRUE AND severity = ''info''';
        END IF;
      END $$;
    `);
    console.log('[FIX-2] [initNewTables] Success — finance v2 sprint 5 (notification prefs, job runs, audit severity)');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[FIX-2] [initNewTables] finance sprint 5 remainder skipped:', msg);
  }
}
