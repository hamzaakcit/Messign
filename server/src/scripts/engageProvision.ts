/**
 * Creates an engage tenant (organization, first admin user, settings) from an operator's terminal. Same code as
 * POST /api/engage/admin/organizations, without needing a platform-admin login.
 *
 *   npm run engage:provision -- --name "Demo Kitap" --slug demo-kitap --admin-email you@example.com --admin-name "Demo Admin"
 *
 * Writes legacy tables, so it needs the privileged database URL: DATABASE_ADMIN_URL (falls back to DATABASE_URL).
 * Prints the organization id and a one-time temporary password for the admin (they must change it at first login).
 * The password is shown in YOUR terminal only: copy it from there, it is not stored anywhere else.
 */
import 'dotenv/config';

const arg = (name: string): string => {
  const i = process.argv.indexOf(`--${name}`);
  const v = i >= 0 ? process.argv[i + 1] : undefined;
  if (!v || v.startsWith('--')) { console.error(`Missing --${name}`); process.exit(2); }
  return v;
};

async function main(): Promise<void> {
  const admin = process.env.DATABASE_ADMIN_URL?.trim();
  if (admin) { process.env.DATABASE_PUBLIC_URL = admin; delete process.env.PGBOUNCER_URL; }
  const { validateProvisionInput, provisionWithAdminPool } = await import('../engage/bootstrap/provisionOrganization.js');
  const input = validateProvisionInput({ name: arg('name'), slug: arg('slug'), adminEmail: arg('admin-email'), adminFullName: arg('admin-name') });
  const r = await provisionWithAdminPool(input);
  console.log(`[engage] created tenant "${r.organization.name}" (${r.organization.slug})`);
  console.log(`  organization id: ${r.organization.id}`);
  console.log(`  admin user id:   ${r.admin.userId}`);
  console.log(`  admin email:     ${r.admin.email}`);
  console.log(`  temporary password (shown once, must be changed at first login): ${r.temporaryPassword}`);
  const { pool } = await import('../db/index.js');
  await pool.end();
}

main().catch((err) => { console.error('[engage] provision failed:', err instanceof Error ? err.message : err); process.exit(1); });
