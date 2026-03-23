/**
 * Ultimate one-shot DB repair (dev / Railway). From `server/`:
 *   npx tsx src/force-db-fix.ts
 *
 * Uses DATABASE_ADMIN_URL → DATABASE_PUBLIC_URL → DATABASE_URL (skips *.railway.internal
 * when a public URL exists). Railway TCP proxy: SSL same as server/src/db/index.ts.
 *
 * Destructive: DROP NOT NULL on tenant_id, matview OWNER/GRANT, DISABLE RLS, optional SUPERUSER.
 * Set ULTIMATE_FIX_SUPERUSER=1 to attempt ALTER ROLE messign_app WITH SUPERUSER (not recommended).
 */
import { Pool } from 'pg';
import dotenv from 'dotenv';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env') });

function isRailwayInternal(url: string): boolean {
  return /railway\.internal/i.test(url);
}

function pickDbUrlForLocalScript(): string | undefined {
  const admin = process.env.DATABASE_ADMIN_URL?.trim();
  const pub = process.env.DATABASE_PUBLIC_URL?.trim();
  const primary = process.env.DATABASE_URL?.trim();

  if (admin && !isRailwayInternal(admin)) return admin;
  if (pub && !isRailwayInternal(pub)) return pub;
  if (primary && !isRailwayInternal(primary)) return primary;
  if (admin) return admin;
  if (pub) return pub;
  return primary;
}

const dbUrl = pickDbUrlForLocalScript();
if (!dbUrl) {
  console.error('Set DATABASE_URL, or DATABASE_PUBLIC_URL / DATABASE_ADMIN_URL with a public host.');
  process.exit(1);
}

if (isRailwayInternal(process.env.DATABASE_URL ?? '') && !isRailwayInternal(dbUrl)) {
  console.log('Using connection with a public host (not DATABASE_URL internal).');
}

let connectionString = dbUrl;
const useUnsafeSSL =
  connectionString.includes('rlwy.net') ||
  connectionString.includes('railway.app') ||
  connectionString.includes('railway.net');
if (useUnsafeSSL) {
  connectionString = connectionString.replace(/[?&]sslmode=[^&]*/g, '').replace(/\?$/, '');
}

const pool = new Pool({
  connectionString,
  max: 2,
  connectionTimeoutMillis: useUnsafeSSL ? 15000 : 2000,
  ...(useUnsafeSSL ? { ssl: { rejectUnauthorized: false } } : {}),
});

async function runUltimateFix() {
  try {
    const client = await pool.connect();
    try {
      console.log('--- Starting Ultimate Database Force-Fix ---');

      const batches: string[] = [
        // 1. Relax tenant_id NOT NULL only where the column exists (marketing_content often uses organization_id only)
        `DO $$
        BEGIN
          IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'marketing_content' AND column_name = 'tenant_id'
          ) THEN
            EXECUTE 'ALTER TABLE marketing_content ALTER COLUMN tenant_id DROP NOT NULL';
          END IF;
          IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'reimbursement_users' AND column_name = 'tenant_id'
          ) THEN
            EXECUTE 'ALTER TABLE reimbursement_users ALTER COLUMN tenant_id DROP NOT NULL';
          END IF;
          IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'finance_dora_job_runs' AND column_name = 'tenant_id'
          ) THEN
            EXECUTE 'ALTER TABLE finance_dora_job_runs ALTER COLUMN tenant_id DROP NOT NULL';
          END IF;
        END $$;`,

        // 2. Materialized views: owner + GRANT to messign_app (PG: GRANT uses TABLE for matviews)
        `DO $$
        DECLARE
          r RECORD;
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'messign_app') THEN
            RAISE NOTICE 'Role messign_app does not exist — skipping matview OWNER/GRANT';
            RETURN;
          END IF;
          FOR r IN (SELECT matviewname FROM pg_matviews WHERE schemaname = 'public')
          LOOP
            EXECUTE format('ALTER MATERIALIZED VIEW public.%I OWNER TO messign_app', r.matviewname);
            EXECUTE format('GRANT ALL ON TABLE public.%I TO messign_app', r.matviewname);
          END LOOP;
        END $$;`,

        // 3. OKR columns
        `DO $$
        BEGIN
          IF to_regclass('public.okr_goals') IS NOT NULL THEN
            EXECUTE 'ALTER TABLE okr_goals ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT false';
            EXECUTE 'ALTER TABLE okr_goals ADD COLUMN IF NOT EXISTS last_check_in_at TIMESTAMPTZ';
            EXECUTE 'ALTER TABLE okr_goals ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES reimbursement_users(id)';
          END IF;
          IF to_regclass('public.okr_key_results') IS NOT NULL THEN
            EXECUTE 'ALTER TABLE okr_key_results ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES reimbursement_users(id) ON DELETE SET NULL';
            EXECUTE 'ALTER TABLE okr_key_results ADD COLUMN IF NOT EXISTS last_check_in_at TIMESTAMPTZ';
          END IF;
        END $$;`,

        // 4. RLS bypass (tables that exist)
        `DO $$
        BEGIN
          IF to_regclass('public.marketing_content') IS NOT NULL THEN
            EXECUTE 'ALTER TABLE marketing_content DISABLE ROW LEVEL SECURITY';
          END IF;
          IF to_regclass('public.okr_goals') IS NOT NULL THEN
            EXECUTE 'ALTER TABLE okr_goals DISABLE ROW LEVEL SECURITY';
          END IF;
          IF to_regclass('public.reimbursement_users') IS NOT NULL THEN
            EXECUTE 'ALTER TABLE reimbursement_users DISABLE ROW LEVEL SECURITY';
          END IF;
          IF to_regclass('public.finance_dora_job_runs') IS NOT NULL THEN
            EXECUTE 'ALTER TABLE finance_dora_job_runs DISABLE ROW LEVEL SECURITY';
          END IF;
        END $$;`,

        // 5. Broad grants for messign_app (if present)
        `DO $$
        BEGIN
          IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'messign_app') THEN
            EXECUTE 'GRANT ALL ON SCHEMA public TO messign_app';
            EXECUTE 'GRANT ALL ON ALL TABLES IN SCHEMA public TO messign_app';
            EXECUTE 'GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO messign_app';
          ELSE
            RAISE NOTICE 'Role messign_app does not exist — skipping schema GRANTs';
          END IF;
        END $$;`,
      ];

      for (const sql of batches) {
        await client.query(sql);
      }

      if (process.env.ULTIMATE_FIX_SUPERUSER === '1') {
        try {
          await client.query(`ALTER ROLE messign_app WITH SUPERUSER;`);
          console.warn('ULTIMATE_FIX_SUPERUSER=1: messign_app is now SUPERUSER (revoke in production).');
        } catch (e) {
          console.warn('Could not ALTER ROLE messign_app WITH SUPERUSER:', e instanceof Error ? e.message : e);
        }
      }

      console.log('Success. tenant_id constraints relaxed (where columns exist), matviews updated, OKR columns, RLS disabled on key tables.');
    } finally {
      client.release();
    }
  } catch (err) {
    const e = err as NodeJS.ErrnoException & { code?: string };
    if (e.code === 'ENOTFOUND' && dbUrl !== undefined && isRailwayInternal(dbUrl)) {
      console.error(`
ENOTFOUND: use DATABASE_PUBLIC_URL or DATABASE_ADMIN_URL with a public host, or run SQL in Railway editor.
`);
    }
    console.error('Fix failed:', err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

void runUltimateFix();
