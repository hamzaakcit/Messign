import 'dotenv/config';
import { pool } from './index.js';

/**
 * Adds missing columns to existing tables without dropping data.
 * Run this when you have an existing DB that was created before these columns were added.
 * Usage: npm run db:fix  (or: tsx src/db/fixMissingColumns.ts)
 */
async function fixMissingColumns(): Promise<void> {
  const client = await pool.connect();
  try {
    console.log('Adding missing columns (if any)...');

    // Add unread_count to channels
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'channels' AND column_name = 'unread_count') THEN
          ALTER TABLE channels ADD COLUMN unread_count INT NOT NULL DEFAULT 0;
          RAISE NOTICE 'Added unread_count to channels';
        END IF;
      END $$;
    `);
    console.log('✅ channels.unread_count');

    // Add updated_at to reimbursement_users
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'reimbursement_users' AND column_name = 'updated_at') THEN
          ALTER TABLE reimbursement_users ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
          RAISE NOTICE 'Added updated_at to reimbursement_users';
        END IF;
      END $$;
    `);
    console.log('✅ reimbursement_users.updated_at');

    console.log('Done. All missing columns are in place.');
  } catch (err) {
    console.error('Error fixing columns:', err);
    throw err;
  } finally {
    client.release();
  }
}

fixMissingColumns()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
