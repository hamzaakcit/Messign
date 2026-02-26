import { query } from './index.js';

async function runClaudeUsageMigration() {
  await query(`
    CREATE TABLE IF NOT EXISTS ai_claude_daily_usage (
      user_id    TEXT NOT NULL,
      usage_date DATE NOT NULL DEFAULT CURRENT_DATE,
      count      INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (user_id, usage_date)
    )
  `);
  console.log('[migration] ai_claude_daily_usage table ready');
}

runClaudeUsageMigration().catch((e) => {
  console.error('[migration] failed:', e);
  process.exit(1);
});
