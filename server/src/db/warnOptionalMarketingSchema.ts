/**
 * One-time startup check: optional marketing migrations (097+, 099+, competitors, etc.).
 * Logs a clear hint if tables/columns the marketing stack expects are missing.
 */

export async function warnOptionalMarketingSchemaIfMissing(): Promise<void> {
  try {
    const { pool } = await import('./index.js');

    const missing: string[] = [];

    const tables = ['performance_feedback', 'brand_profiles', 'competitors', 'competitor_events'];
    for (const name of tables) {
      const r = await pool.query(
        `SELECT 1 FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = $1 LIMIT 1`,
        [name],
      );
      if (r.rowCount === 0) missing.push(`table public.${name}`);
    }

    const col = await pool.query(
      `SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'marketing_content' AND column_name = 'brand_profile_id'
       LIMIT 1`,
    );
    if (col.rowCount === 0) missing.push('column public.marketing_content.brand_profile_id');

    if (missing.length === 0) return;

    console.warn(
      '[DB] Optional marketing schema is incomplete — calibration, brand filters, competitors, and compliance scans may be limited until migrations are applied:',
    );
    for (const m of missing) {
      console.warn(`[DB]   · missing ${m}`);
    }
    console.warn(
      '[DB] Fix: from repo root run: npm run db:migrate && npm run db:migrate-runner',
    );
  } catch (err) {
    console.warn('[DB] Could not verify optional marketing schema:', err);
  }
}
