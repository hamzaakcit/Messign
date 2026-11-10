/**
 * Lets the platform organization use engage as well as the Company-OS modules (ADR-016), so one Lucy page shows both.
 * Only the organization named by PLATFORM_ORG_SLUG (default `messign`) can be changed; an engage tenant is refused.
 *
 *   npm run engage:platform             product `all`: the platform's users can open the engage sections
 *   npm run engage:platform -- --off    product `workspace` again (engage data stays, but is unreachable)
 *
 * Run `npm run db:migrate` first (migration 126 allows the value). Writes a legacy table, so it needs the privileged
 * database URL: DATABASE_ADMIN_URL (falls back to DATABASE_URL). It changes nothing else and prints what it did.
 */
import 'dotenv/config';

async function main(): Promise<void> {
  const on = !process.argv.includes('--off');
  const admin = process.env.DATABASE_ADMIN_URL?.trim();
  if (admin) { process.env.DATABASE_PUBLIC_URL = admin; delete process.env.PGBOUNCER_URL; }
  const { setPlatformEngageWithAdminPool, EnablePlatformError } = await import('../engage/bootstrap/enablePlatformOrganization.js');
  try {
    const r = await setPlatformEngageWithAdminPool(on);
    console.log(`[engage] platform organization "${r.slug}" (${r.organizationId}): product is now "${r.product}"${r.changed ? '' : ' (it already was)'}`);
  } catch (err) {
    if (err instanceof EnablePlatformError) { console.error(`[engage] ${err.message}`); process.exitCode = 1; } else throw err;
  } finally {
    const { pool } = await import('../db/index.js');
    await pool.end();
  }
}

main().catch((err) => { console.error('[engage] platform change failed:', err instanceof Error ? err.message : err); process.exit(1); });
